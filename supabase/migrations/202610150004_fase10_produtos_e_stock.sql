-- Fase 10 — produtos, receita por serviço e controlo de stock
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O que resolve
-- -------------
-- O dono regista os produtos que compra e, em cada serviço, quanto gasta de
-- cada um. Quando marca que realizou um serviço, as quantidades saem do stock
-- sozinhas. Daí sai o custo de produto de cada serviço e quanto tempo falta
-- até o produto acabar, sem ninguém fazer contas à mão.
--
-- Três decisões de desenho, para não se perderem
-- ----------------------------------------------
-- 1. O stock NÃO é uma coluna. É a soma de `lexia_produto_movimentos`. Um
--    número guardado dessincroniza-se em silêncio na primeira escrita que
--    falhe a meio; uma soma de movimentos não pode mentir, e ainda dá o
--    histórico de para onde foi cada mililitro.
--
-- 2. O custo unitário vem da COMPRA MAIS RECENTE (`custo_total / quantidade`),
--    não de média ponderada. É o número que o dono reconhece — "o frasco
--    custou-me 180 €" — e actualiza-se sozinho quando ele volta a comprar.
--
-- 3. `servico_id` aponta para o catálogo na base do CLIENTE, que é outra
--    instância de Postgres. Não há FK possível. Guardamos `servico_nome` ao
--    lado para a linha continuar legível se o serviço for apagado lá.
--
-- O que esta migration APAGA, e porquê
-- ------------------------------------
-- `lexia_executores_custo` e a coluna `custo_produto` saem. O custo/hora por
-- executor foi uma funcionalidade que não era pedida: o painel serve para
-- ligar produtos a serviços, e o custo de produto passa a ser calculado da
-- receita em vez de escrito à mão. As notas por serviço ficam.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 1. Produtos
-- --------------------------------------------------------------------------

create table if not exists public.lexia_produtos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  nome text not null check (char_length(nome) between 1 and 256),
  unidade text not null check (unidade in ('ml', 'l', 'g', 'kg', 'un')),
  notas text check (notas is null or char_length(notas) <= 2000),
  activo boolean not null default true,
  actualizado_em timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lexia_produtos_key unique (cliente_slug, nome)
);

-- --------------------------------------------------------------------------
-- 2. Movimentos de stock — compras entram, consumos saem
-- --------------------------------------------------------------------------

create table if not exists public.lexia_produto_movimentos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  produto_id uuid not null references public.lexia_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'consumo', 'ajuste')),
  -- Positiva entra no stock, negativa sai. Nunca zero.
  quantidade numeric(14, 3) not null check (quantidade <> 0),
  -- Só nas compras: o que custou a quantidade comprada, inteira.
  custo_total numeric(12, 2) check (custo_total is null or custo_total >= 0),
  -- Preenchidos quando o consumo veio de um serviço realizado.
  servico_id uuid,
  servico_nome text check (servico_nome is null or char_length(servico_nome) <= 512),
  nota text check (nota is null or char_length(nota) <= 2000),
  ocorrido_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  -- Uma compra tem de ter preço e tem de entrar; um consumo tem de sair.
  constraint lexia_produto_movimentos_coerente check (
    (tipo = 'compra' and quantidade > 0 and custo_total is not null)
    or (tipo = 'consumo' and quantidade < 0)
    or (tipo = 'ajuste' and custo_total is null)
  )
);

create index if not exists lexia_produto_movimentos_produto_idx
  on public.lexia_produto_movimentos (cliente_slug, produto_id, ocorrido_em desc);

-- --------------------------------------------------------------------------
-- 3. Receita: que produtos entram em cada serviço, e quanto
-- --------------------------------------------------------------------------

create table if not exists public.lexia_servico_produtos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  servico_id uuid not null,
  servico_nome text not null check (char_length(servico_nome) between 1 and 512),
  produto_id uuid not null references public.lexia_produtos(id) on delete cascade,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  actualizado_em timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lexia_servico_produtos_key unique (cliente_slug, servico_id, produto_id)
);

create index if not exists lexia_servico_produtos_cliente_idx
  on public.lexia_servico_produtos (cliente_slug, servico_id);

-- --------------------------------------------------------------------------
-- 4. Permissões — mesmo padrão das outras tabelas centrais
-- --------------------------------------------------------------------------

alter table public.lexia_produtos enable row level security;
alter table public.lexia_produto_movimentos enable row level security;
alter table public.lexia_servico_produtos enable row level security;

revoke all on
  public.lexia_produtos,
  public.lexia_produto_movimentos,
  public.lexia_servico_produtos
from public, anon, authenticated, service_role;

grant select, insert, update, delete on
  public.lexia_produtos,
  public.lexia_produto_movimentos,
  public.lexia_servico_produtos
to service_role;

create policy "produtos_select"
on public.lexia_produtos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (id, cliente_slug, nome, unidade, notas, activo, actualizado_em)
  on public.lexia_produtos to authenticated;

create policy "produto_movimentos_select"
on public.lexia_produto_movimentos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id, cliente_slug, produto_id, tipo, quantidade, custo_total,
  servico_id, servico_nome, nota, ocorrido_em
) on public.lexia_produto_movimentos to authenticated;

create policy "servico_produtos_select"
on public.lexia_servico_produtos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id, cliente_slug, servico_id, servico_nome, produto_id, quantidade, actualizado_em
) on public.lexia_servico_produtos to authenticated;

-- --------------------------------------------------------------------------
-- 5. Limpar o que a Fase 9 trouxe a mais
-- --------------------------------------------------------------------------

drop table if exists public.lexia_executores_custo;

alter table public.lexia_servico_custos
  drop column if exists custo_produto;

comment on table public.lexia_produtos is
  'Produtos que o cliente compra. O stock nao vive aqui: e a soma de lexia_produto_movimentos.';
comment on table public.lexia_produto_movimentos is
  'Razao de stock. Compras entram com custo_total, consumos saem quando um servico e realizado.';
comment on table public.lexia_servico_produtos is
  'Receita de cada servico: que produtos consome e em que quantidade. servico_id vive na base do cliente, por isso nao ha FK.';

commit;

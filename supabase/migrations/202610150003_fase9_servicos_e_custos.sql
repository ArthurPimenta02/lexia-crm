-- Fase 9: custo e margem por servico.
--
-- Porque existe: o Martim sabe o preco de cada servico mas nao sabe o que cada
-- servico lhe deixa na mao. Medido em 15/10/2026 na Supabase do Detail, com os
-- precos base e as duracoes que ja lah estao, o euro-por-hora do Martim vai de
-- 40,00 EUR (Clareamento de Farois, 30 EUR em 45 min) a 13,89 EUR (Polimento
-- Tecnico, 500 EUR em 36 h) -- ou seja, o servico de bandeira e o pior de
-- todos, e isto ANTES de descontar o ceramico. Falta exactamente uma coisa
-- para fechar a conta: o custo.
--
-- O QUE ESTA MIGRATION NAO FAZ, E PORQUE:
--
-- 1. NAO COPIA O CATALOGO PARA CA. Os servicos do Detail vivem em duas tabelas
--    na Supabase do cliente: servicos_detail_by_cordeiro (o mestre de venda,
--    que alimenta o RAG do agente) e agendamento_servicos (o operacional, com
--    duracao por executor). Mais rag_servicos_detail_by_cordeiro com os
--    embeddings. Trazer os servicos para ca criava uma QUARTA representacao --
--    e seria a unica que o agente nao le. Duas semanas depois o painel mostra
--    um preco e o agente vende outro. Logo: preco e duracao continuam a ser
--    escritos na base do cliente, e o painel escreve lah.
--
-- 2. NAO GUARDA A MARGEM. A margem e calculada na leitura:
--       margem = preco_do_escalao
--              - custo_produto
--              - (duracao_do_executor / 60 * custo_hora_do_executor)
--    Guardar o resultado seria guardar um numero que envelhece em silencio
--    sempre que o Martim mexe num preco ou numa duracao do outro lado.
--
-- 3. NAO TEM COLUNA DE MOEDA. Preco, custo de produto e custo/hora de um
--    cliente estao todos na moeda desse cliente (EUR no Detail, USD na
--    Miranda) e nunca se somam entre clientes -- ha uma linha por
--    (cliente_slug, servico_id). A moeda do painel vem do cliente, como o fuso
--    horario ja vem em getClientTimezone.
--
-- O QUE FICA CENTRAL, E PORQUE: o custo. Primeiro porque e informacao que o
-- agente de vendas NAO deve poder ler -- a margem do Martim nao e para ir numa
-- resposta ao cliente dele, e a base do cliente e precisamente a que o agente
-- le. Segundo porque "custo de produto" e "custo/hora de quem executa" sao
-- conceitos que servem qualquer cliente da Lexia, ao contrario do resto do
-- esquema de detailing (escaloes de viatura, ao_domicilio, capota).
--
-- Esta migration e aditiva: cria tabelas novas e nao toca em nada existente.

begin;

-- Guard: o risco real desta migration e ser executada no Supabase errado.
-- Cada cliente tem o seu proprio projecto Supabase; os custos vivem apenas na
-- base central da Lexia, que e a unica que tem lexia_clientes.
do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Custo por hora de cada pessoa que executa servicos.
-- Sao os dois unicos numeros globais que o cliente tem de escrever a mao.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_executores_custo (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- Chave do executor, em minusculas e sem espacos, porque tem de casar com o
  -- sufixo das colunas de duracao na base do cliente:
  -- 'martim' -> agendamento_servicos.duracao_martim_minutos.
  -- Se isto nao casar, a duracao nao e encontrada e a margem aparece vazia em
  -- vez de errada -- de proposito.
  executor text not null check (executor ~ '^[a-z0-9_]+$'),
  nome text not null check (char_length(nome) between 1 and 128),
  custo_hora numeric(12, 2) not null default 0 check (custo_hora >= 0),
  activo boolean not null default true,
  actualizado_em timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lexia_executores_custo_key unique (cliente_slug, executor)
);

-- ---------------------------------------------------------------------------
-- Custo de produto por servico. Uma linha por servico do cliente.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_servico_custos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- ID do servico na Supabase DO CLIENTE (servicos_detail_by_cordeiro.id).
  -- Nao ha chave estrangeira possivel: a tabela esta noutra base de dados.
  -- Consequencia a assumir: se o Martim apagar um servico lah, esta linha fica
  -- orfa. Nao faz mal -- a leitura parte sempre do catalogo do cliente e faz
  -- join para ca, logo uma linha orfa deixa simplesmente de ser lida.
  servico_id uuid not null,
  -- Copia do nome no momento da gravacao. E para um humano reconhecer a linha
  -- ao olhar para a tabela. NAO E CHAVE: o join e por servico_id.
  servico_nome text not null check (char_length(servico_nome) between 1 and 512),
  custo_produto numeric(12, 2) not null default 0 check (custo_produto >= 0),
  notas text check (notas is null or char_length(notas) <= 2000),
  actualizado_em timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint lexia_servico_custos_key unique (cliente_slug, servico_id)
);

-- O painel pede sempre "todos os custos de um cliente".
create index if not exists lexia_servico_custos_cliente_idx
  on public.lexia_servico_custos (cliente_slug);

-- ---------------------------------------------------------------------------
-- Permissoes: escrita so por service_role, atraves das server actions que
-- verificam o perfil. O cliente le apenas os seus proprios custos.
-- ---------------------------------------------------------------------------
alter table public.lexia_executores_custo enable row level security;
alter table public.lexia_servico_custos enable row level security;

revoke all on
  public.lexia_executores_custo,
  public.lexia_servico_custos
from public, anon, authenticated, service_role;

grant select, insert, update, delete on
  public.lexia_executores_custo,
  public.lexia_servico_custos
to service_role;

create policy "executores_custo_select"
on public.lexia_executores_custo for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  cliente_slug,
  executor,
  nome,
  custo_hora,
  activo,
  actualizado_em
) on public.lexia_executores_custo to authenticated;

create policy "servico_custos_select"
on public.lexia_servico_custos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  cliente_slug,
  servico_id,
  servico_nome,
  custo_produto,
  notas,
  actualizado_em
) on public.lexia_servico_custos to authenticated;

comment on table public.lexia_executores_custo is
  'Custo por hora de cada executor de servicos. Central e nao na base do cliente para o agente de vendas nunca poder ler custos.';
comment on column public.lexia_executores_custo.executor is
  'Chave do executor. Tem de casar com o sufixo da coluna de duracao na base do cliente: martim -> duracao_martim_minutos.';
comment on table public.lexia_servico_custos is
  'Custo de produto por servico. O preco e a duracao NAO estao aqui: vivem na Supabase do cliente, que e a base que o agente le.';
comment on column public.lexia_servico_custos.servico_id is
  'ID do servico na Supabase do cliente. Sem chave estrangeira por estar noutra base; linhas orfas sao ignoradas na leitura.';
comment on column public.lexia_servico_custos.servico_nome is
  'Copia do nome para leitura humana. Nao e chave -- o join e sempre por servico_id.';

commit;

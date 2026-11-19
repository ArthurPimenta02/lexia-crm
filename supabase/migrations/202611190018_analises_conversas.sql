-- Análises das conversas (2026-11-19): /admin/analises.
--
-- O QUE GUARDA
-- Todos os dias às 2h de Brasília uma rotina na nuvem (fora deste repositório)
-- lê as conversas (lexia_mensagens) e os turnos (lexia_turnos) das últimas
-- 24 h de cada cliente, cruza com o código dos agentes e grava aqui um
-- relatório: uma linha em lexia_analises e um item por achado em
-- lexia_analises_itens. O admin também pode pedir uma análise a qualquer hora
-- pela tela (linha com estado 'pedida').
--
-- QUEM LÊ E ESCREVE
-- - O painel: com a service_role, depois de confirmar lexia_admin (o mesmo
--   mecanismo das outras tabelas do admin: RLS ligado, nada para anon nem
--   authenticated). Um cliente comum não lê nem escreve nestas tabelas.
-- - A rotina: com o utilizador Postgres analise_leitura (já existe; só leitura
--   no resto da base). Ganha select, insert e update NESTAS duas tabelas e as
--   policies correspondentes. Mais nada muda nas permissões dele.
--   Nota: o papel tem default_transaction_read_only = on. Para gravar, a
--   rotina abre a transacção com `begin read write;` (ou
--   `set transaction read write;`). Esta migration não mexe nisso.
--
-- Esta migration é aditiva: cria duas tabelas novas e não toca em nada
-- existente.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

create table if not exists public.lexia_analises (
  id uuid primary key default extensions.gen_random_uuid(),
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('diaria', 'geral', 'especifica')),
  estado text not null default 'pedida'
    check (estado in ('pedida', 'a_correr', 'concluida', 'falhou')),
  -- Texto livre do admin; nulo na diária.
  pedido text check (pedido is null or char_length(pedido) <= 4000),
  -- Nulo = todos os clientes.
  cliente_slug text references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- identificador_conversa de uma conversa só (opcional).
  conversa text check (conversa is null or char_length(conversa) <= 200),
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  resumo text,
  custo_estimado numeric(10, 4) check (custo_estimado is null or custo_estimado >= 0),
  concluida_em timestamptz,
  erro text,
  constraint lexia_analises_periodo_ordem
    check (periodo_inicio is null or periodo_fim is null or periodo_fim >= periodo_inicio)
);

create index if not exists lexia_analises_criado_idx
  on public.lexia_analises (criado_em desc);

create table if not exists public.lexia_analises_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  analise_id uuid not null references public.lexia_analises(id) on delete cascade,
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  identificador_conversa text,
  gravidade text not null check (gravidade in ('grave', 'medio', 'detalhe', 'positivo')),
  titulo text not null check (char_length(titulo) between 1 and 300),
  citacao text,
  o_que_a_ia_decidiu text,
  o_que_o_codigo_fez text,
  causa text,
  onde_corrigir text,
  estado text not null default 'novo'
    check (estado in ('novo', 'visto', 'corrigido', 'falso_alarme')),
  nota_admin text check (nota_admin is null or char_length(nota_admin) <= 2000),
  criado_em timestamptz not null default now()
);

create index if not exists lexia_analises_itens_analise_idx
  on public.lexia_analises_itens (analise_id);

create index if not exists lexia_analises_itens_cliente_idx
  on public.lexia_analises_itens (cliente_slug, criado_em desc);

-- Só admin: RLS ligado, nenhuma policy para anon/authenticated, grants só
-- para a service_role (o painel confirma lexia_admin antes de ler).
alter table public.lexia_analises enable row level security;
alter table public.lexia_analises_itens enable row level security;

revoke all on public.lexia_analises from anon, authenticated;
revoke all on public.lexia_analises_itens from anon, authenticated;
grant select, insert, update on public.lexia_analises to service_role;
grant select, insert, update on public.lexia_analises_itens to service_role;

-- A rotina (utilizador analise_leitura): ler, gravar e actualizar só aqui.
-- Se o papel não existir nesta base (ex.: base de teste), passa à frente.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'analise_leitura') then
    grant select, insert, update on public.lexia_analises to analise_leitura;
    grant select, insert, update on public.lexia_analises_itens to analise_leitura;

    drop policy if exists analise_leitura_ler on public.lexia_analises;
    drop policy if exists analise_rotina_gravar on public.lexia_analises;
    drop policy if exists analise_rotina_atualizar on public.lexia_analises;
    create policy analise_leitura_ler on public.lexia_analises
      for select to analise_leitura using (true);
    create policy analise_rotina_gravar on public.lexia_analises
      for insert to analise_leitura with check (true);
    create policy analise_rotina_atualizar on public.lexia_analises
      for update to analise_leitura using (true) with check (true);

    drop policy if exists analise_leitura_ler on public.lexia_analises_itens;
    drop policy if exists analise_rotina_gravar on public.lexia_analises_itens;
    drop policy if exists analise_rotina_atualizar on public.lexia_analises_itens;
    create policy analise_leitura_ler on public.lexia_analises_itens
      for select to analise_leitura using (true);
    create policy analise_rotina_gravar on public.lexia_analises_itens
      for insert to analise_leitura with check (true);
    create policy analise_rotina_atualizar on public.lexia_analises_itens
      for update to analise_leitura using (true) with check (true);
  else
    raise notice 'analise_leitura nao existe nesta base: tabelas criadas sem as permissoes da rotina.';
  end if;
end;
$$;

commit;

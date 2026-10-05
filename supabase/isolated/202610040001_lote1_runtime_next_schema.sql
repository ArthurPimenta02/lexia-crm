-- Disposable runtime harness for the Lot 1 Next.js end-to-end rehearsal.
--
-- NEVER apply this file to staging or production. It extends only the
-- disposable schema created by 000000000000_lote1_test_baseline.sql after the
-- Lot 1 migrations have been applied and verified.

begin;

do $$
begin
  if not exists (
    select 1
    from public.lexia_environment_identity
    where id = true
      and environment = 'isolated_test'
      and disposable = true
  ) then
    raise exception 'The disposable environment identity is missing';
  end if;

  if to_regprocedure('public.lexia_is_admin()') is null
    or to_regprocedure('public.lexia_user_can_access_cliente(text)') is null
  then
    raise exception 'Lot 1 authorization helpers must exist first';
  end if;

  if to_regprocedure(
    'public.lexia_finalizar_execucao_analista(uuid,text,uuid,text,jsonb,jsonb,text,text,integer,integer,integer,text)'
  ) is null then
    raise exception 'The Lot 1 analyst finalization RPC must exist first';
  end if;
end;
$$;

alter table public.lexia_clientes
  add column cor_principal text;

create table public.lexia_testes_sessoes (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null,
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  origem text not null
    check (origem in ('painel_admin', 'painel_cliente')),
  status text not null default 'activa'
    check (status in ('activa', 'arquivada')),
  nome text,
  criado_por uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_slug, session_id, origem)
);

create table public.lexia_testes_execucoes (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique,
  session_id uuid not null,
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  origem text not null
    check (origem in ('painel_admin', 'painel_cliente')),
  teste_id text,
  rota text,
  mensagem_teste text,
  mensagens jsonb not null default '[]'::jsonb,
  resposta_obtida text,
  raw_agente jsonb,
  raw_contexto jsonb,
  raw_handoff jsonb,
  erro text,
  criado_em timestamptz not null default now(),
  constraint lexia_testes_execucoes_sessao_fkey
    foreign key (cliente_slug, session_id, origem)
    references public.lexia_testes_sessoes (
      cliente_slug,
      session_id,
      origem
    ) on update cascade on delete cascade
);

create table public.lexia_feedbacks (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  teste_execucao_id uuid references public.lexia_testes_execucoes(id)
    on delete cascade,
  origem text,
  avaliacao text,
  comentario text,
  mensagem_cliente text,
  resposta_agente text,
  status text not null default 'pendente',
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_handoffs (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  nome_contacto text,
  telefone text,
  motivo text,
  prioridade text,
  status text not null default 'pendente',
  resumo text,
  origem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_contactos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  canal text,
  identificador_conversa text not null,
  nome text,
  telefone text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_slug, identificador_conversa)
);

create table public.lexia_mensagens (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  contacto_id uuid references public.lexia_contactos(id) on delete cascade,
  identificador_conversa text not null,
  direccao text check (direccao in ('recebida', 'enviada')),
  tipo text,
  conteudo text,
  origem text,
  criado_em timestamptz not null default now()
);

create table public.lexia_runtime_test_harness (
  id boolean primary key default true check (id),
  project_ref text not null,
  version text not null
    check (version = 'lote1-runtime-next-v1'),
  instalado_em timestamptz not null default now()
);

insert into public.lexia_runtime_test_harness (id, project_ref, version)
select true, project_ref, 'lote1-runtime-next-v1'
from public.lexia_environment_identity
where id = true;

create index lexia_testes_sessoes_cliente_idx
  on public.lexia_testes_sessoes (cliente_slug, origem, criado_em desc);
create index lexia_testes_execucoes_sessao_idx
  on public.lexia_testes_execucoes (
    cliente_slug,
    session_id,
    origem,
    criado_em asc
  );
create index lexia_feedbacks_cliente_idx
  on public.lexia_feedbacks (cliente_slug, criado_em desc);
create index lexia_handoffs_cliente_idx
  on public.lexia_handoffs (cliente_slug, criado_em desc);
create index lexia_contactos_cliente_idx
  on public.lexia_contactos (cliente_slug, atualizado_em desc);
create index lexia_mensagens_conversa_idx
  on public.lexia_mensagens (
    cliente_slug,
    identificador_conversa,
    criado_em asc,
    id asc
  );

alter table public.lexia_testes_sessoes enable row level security;
alter table public.lexia_testes_execucoes enable row level security;
alter table public.lexia_feedbacks enable row level security;
alter table public.lexia_handoffs enable row level security;
alter table public.lexia_contactos enable row level security;
alter table public.lexia_mensagens enable row level security;
alter table public.lexia_runtime_test_harness enable row level security;

create policy "runtime_sessions_select"
on public.lexia_testes_sessoes for select to authenticated
using (
  public.lexia_is_admin()
  or (
    origem = 'painel_cliente'
    and public.lexia_user_can_access_cliente(cliente_slug)
  )
);

create policy "runtime_sessions_insert"
on public.lexia_testes_sessoes for insert to authenticated
with check (
  criado_por = auth.uid()
  and (
    (origem = 'painel_admin' and public.lexia_is_admin())
    or (
      origem = 'painel_cliente'
      and not public.lexia_is_admin()
      and public.lexia_user_can_access_cliente(cliente_slug)
    )
  )
);

create policy "runtime_executions_select"
on public.lexia_testes_execucoes for select to authenticated
using (
  public.lexia_is_admin()
  or (
    origem = 'painel_cliente'
    and public.lexia_user_can_access_cliente(cliente_slug)
  )
);

create policy "runtime_feedbacks_select"
on public.lexia_feedbacks for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

create policy "runtime_feedbacks_insert"
on public.lexia_feedbacks for insert to authenticated
with check (
  criado_por = auth.uid()
  and origem = 'painel_cliente'
  and public.lexia_user_can_access_cliente(cliente_slug)
);

create policy "runtime_feedbacks_update"
on public.lexia_feedbacks for update to authenticated
using (
  public.lexia_is_admin()
  or (
    criado_por = auth.uid()
    and public.lexia_user_can_access_cliente(cliente_slug)
  )
)
with check (
  public.lexia_is_admin()
  or (
    criado_por = auth.uid()
    and public.lexia_user_can_access_cliente(cliente_slug)
  )
);

create policy "runtime_handoffs_select"
on public.lexia_handoffs for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

create policy "runtime_handoffs_admin_update"
on public.lexia_handoffs for update to authenticated
using (public.lexia_is_admin())
with check (public.lexia_is_admin());

create policy "runtime_contacts_select"
on public.lexia_contactos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

create policy "runtime_messages_select"
on public.lexia_mensagens for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

revoke all on public.lexia_testes_sessoes
  from public, anon, authenticated;
revoke all on public.lexia_testes_execucoes
  from public, anon, authenticated;
revoke all on public.lexia_feedbacks
  from public, anon, authenticated;
revoke all on public.lexia_handoffs
  from public, anon, authenticated;
revoke all on public.lexia_contactos
  from public, anon, authenticated;
revoke all on public.lexia_mensagens
  from public, anon, authenticated;
revoke all on public.lexia_runtime_test_harness
  from public, anon, authenticated;

grant select, insert on public.lexia_testes_sessoes to authenticated;
grant select on public.lexia_testes_execucoes to authenticated;
grant select, insert, update on public.lexia_feedbacks to authenticated;
grant select, update on public.lexia_handoffs to authenticated;
grant select on public.lexia_contactos to authenticated;
grant select on public.lexia_mensagens to authenticated;

grant all on public.lexia_testes_sessoes to service_role;
grant all on public.lexia_testes_execucoes to service_role;
grant all on public.lexia_feedbacks to service_role;
grant all on public.lexia_handoffs to service_role;
grant all on public.lexia_contactos to service_role;
grant all on public.lexia_mensagens to service_role;
grant all on public.lexia_runtime_test_harness to service_role;

commit;

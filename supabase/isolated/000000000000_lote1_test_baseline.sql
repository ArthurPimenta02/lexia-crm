-- Minimal, disposable schema harness for the Lot 1 isolated regression suite.
-- NEVER apply this file to staging or production. It is not a production
-- baseline and intentionally contains only the pre-existing contracts needed
-- by the versioned Lot 1 migrations and tests.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.lexia_environment_identity (
  id boolean primary key default true check (id),
  project_ref text not null unique,
  environment text not null check (environment = 'isolated_test'),
  disposable boolean not null check (disposable = true),
  criado_em timestamptz not null default now()
);

alter table public.lexia_environment_identity enable row level security;
revoke all on public.lexia_environment_identity from public, anon, authenticated;
grant select, insert, update, delete on public.lexia_environment_identity
  to service_role;

create table public.lexia_clientes (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'suspenso')),
  modo_teste boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_usuarios_clientes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_slug text references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  role text not null
    check (role in ('lexia_admin', 'cliente_admin', 'cliente_operador')),
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_workflows (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  nome text not null,
  tipo text not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'teste')),
  webhook_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_ajustes_agente (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  tipo text,
  modulo text,
  titulo text,
  situacao text,
  gatilho text,
  gatilhos text[] not null default '{}'::text[],
  comportamento_correto text,
  exemplo_resposta text,
  prioridade integer not null default 0,
  exigir_tool text,
  metadata jsonb not null default '{}'::jsonb,
  aplicar_sempre boolean not null default false,
  activo boolean not null default true,
  aprovado boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.lexia_clientes enable row level security;
alter table public.lexia_usuarios_clientes enable row level security;
alter table public.lexia_workflows enable row level security;
alter table public.lexia_ajustes_agente enable row level security;

create policy "profiles_select_own"
on public.lexia_usuarios_clientes for select to authenticated
using (user_id = auth.uid());

-- The lexia_clientes SELECT policy is intentionally installed only after the
-- Lot 1 helper exists. See after_202610030002_lote1_test_client_policy.sql.
-- Keeping it out of this baseline prevents the test harness from duplicating
-- the helper's authorization logic.

create policy "workflows_admin_all"
on public.lexia_workflows for all to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.role = 'lexia_admin'
      and perfil.status = 'ativo'
      and perfil.cliente_slug is null
  )
)
with check (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    where perfil.user_id = auth.uid()
      and perfil.role = 'lexia_admin'
      and perfil.status = 'ativo'
      and perfil.cliente_slug is null
  )
);

create policy "workflows_select"
on public.lexia_workflows for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    join public.lexia_clientes cliente
      on cliente.slug = perfil.cliente_slug
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and perfil.role in ('cliente_admin', 'cliente_operador')
      and perfil.cliente_slug = lexia_workflows.cliente_slug
      and cliente.status = 'ativo'
  )
);

create policy "Cliente pode ler ajustes do próprio cliente"
on public.lexia_ajustes_agente for select to authenticated
using (
  exists (
    select 1
    from public.lexia_usuarios_clientes perfil
    join public.lexia_clientes cliente
      on cliente.slug = perfil.cliente_slug
    where perfil.user_id = auth.uid()
      and perfil.status = 'ativo'
      and perfil.role in ('cliente_admin', 'cliente_operador')
      and perfil.cliente_slug = lexia_ajustes_agente.cliente_slug
      and cliente.status = 'ativo'
  )
);

revoke all on public.lexia_clientes from public, anon, authenticated;
revoke all on public.lexia_usuarios_clientes from public, anon, authenticated;
revoke all on public.lexia_workflows from public, anon, authenticated;
revoke all on public.lexia_ajustes_agente from public, anon, authenticated;

grant select on public.lexia_clientes to authenticated;
grant select on public.lexia_usuarios_clientes to authenticated;
grant select, insert, update, delete on public.lexia_workflows to authenticated;
grant select on public.lexia_ajustes_agente to authenticated;

commit;

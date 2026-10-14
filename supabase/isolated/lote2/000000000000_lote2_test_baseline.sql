-- Minimal baseline for the disposable Lot 2 database harness.
-- This is not a production baseline. It intentionally contains only the
-- legacy contracts required by the Lot 2 migration and isolated tests.

begin;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_env text := nullif(current_setting('lexia.target_environment', true), '');
begin
  if expected_ref is null or expected_ref !~ '^[a-z0-9]{10,40}$' then
    raise exception 'A valid lexia.target_project_ref is required';
  end if;
  if expected_env is distinct from 'isolated_test' then
    raise exception 'The Lot 2 baseline is restricted to isolated_test';
  end if;
  if current_database() <> 'postgres' then
    raise exception 'The Lot 2 baseline requires the postgres database';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ) then
    raise exception 'Unexpected public relations exist; baseline refused';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'Auth users already exist; baseline refused';
  end if;
  if to_regclass('storage.objects') is not null
    and exists (select 1 from storage.objects) then
    raise exception 'Storage objects already exist; baseline refused';
  end if;
  if to_regclass('storage.buckets') is not null
    and exists (select 1 from storage.buckets) then
    raise exception 'Storage buckets already exist; baseline refused';
  end if;
end;
$$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.lexia_environment_identity (
  id boolean primary key default true check (id),
  project_ref text not null unique,
  environment text not null check (environment = 'isolated_test'),
  disposable boolean not null check (disposable = true),
  criado_em timestamptz not null default now()
);

create table public.lexia_lote2_test_resources (
  run_id uuid not null,
  resource_type text not null check (resource_type in (
    'cliente', 'channel_account', 'policy', 'context_config', 'brain_binding',
    'auth_user', 'contact', 'conversation', 'redis_key'
  )),
  resource_id text not null,
  cliente_slug text,
  criado_em timestamptz not null default now(),
  primary key (run_id, resource_type, resource_id)
);

create table public.lexia_clientes (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'suspenso')),
  modo_teste boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.lexia_usuarios_clientes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente_slug text references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  role text not null
    check (role in ('lexia_admin', 'cliente_admin', 'cliente_operador')),
  status text not null default 'ativo'
    check (status in ('ativo', 'inativo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lexia_usuarios_clientes_user_key unique (user_id),
  constraint lexia_usuarios_clientes_scope_check check (
    (role = 'lexia_admin' and cliente_slug is null)
    or (role in ('cliente_admin', 'cliente_operador') and cliente_slug is not null)
  )
);

create table public.lexia_contactos (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  identificador_conversa text not null,
  nome text,
  telefone text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lexia_contactos_conversation_key
    unique (cliente_slug, identificador_conversa)
);

create table public.lexia_mensagens (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  contacto_id uuid references public.lexia_contactos(id) on delete set null,
  identificador_conversa text not null,
  direccao text not null check (direccao in ('recebida', 'enviada')),
  tipo text not null default 'texto',
  conteudo text,
  origem text not null check (origem in ('workflow', 'humano', 'recebida_na_pausa')),
  criado_em timestamptz not null default now()
);

create table public.lexia_handoffs (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  nome_contacto text,
  telefone text,
  motivo text not null,
  prioridade text not null check (prioridade in ('baixa', 'normal', 'alta')),
  resumo text,
  status text not null default 'pendente'
    check (status in ('pendente', 'resolvido', 'perdido')),
  origem text not null check (origem in ('omnichannel_v2', 'workflow')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.lexia_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lexia_usuarios_clientes u
    where u.user_id = auth.uid()
      and u.role = 'lexia_admin'
      and u.status = 'ativo'
      and u.cliente_slug is null
  );
$$;

create or replace function public.lexia_user_can_access_cliente(
  p_cliente_slug text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.lexia_is_admin()
    or exists (
      select 1
      from public.lexia_usuarios_clientes u
      join public.lexia_clientes c on c.slug = u.cliente_slug
      where u.user_id = auth.uid()
        and u.cliente_slug = p_cliente_slug
        and u.status = 'ativo'
        and u.role in ('cliente_admin', 'cliente_operador')
        and c.status = 'ativo'
    );
$$;

alter table public.lexia_environment_identity enable row level security;
alter table public.lexia_lote2_test_resources enable row level security;
alter table public.lexia_clientes enable row level security;
alter table public.lexia_usuarios_clientes enable row level security;
alter table public.lexia_contactos enable row level security;
alter table public.lexia_mensagens enable row level security;
alter table public.lexia_handoffs enable row level security;

create policy "profiles_select_own"
on public.lexia_usuarios_clientes for select to authenticated
using (user_id = auth.uid());

create policy "clientes_select"
on public.lexia_clientes for select to authenticated
using (public.lexia_user_can_access_cliente(slug));

create policy "contactos_select"
on public.lexia_contactos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

create policy "mensagens_select"
on public.lexia_mensagens for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

create policy "handoffs_select"
on public.lexia_handoffs for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

revoke all on
  public.lexia_environment_identity,
  public.lexia_lote2_test_resources,
  public.lexia_clientes,
  public.lexia_usuarios_clientes,
  public.lexia_contactos,
  public.lexia_mensagens,
  public.lexia_handoffs
from public, anon, authenticated, service_role;

grant select on
  public.lexia_clientes,
  public.lexia_usuarios_clientes,
  public.lexia_contactos,
  public.lexia_mensagens,
  public.lexia_handoffs
to authenticated;

grant select, insert, update, delete on
  public.lexia_environment_identity,
  public.lexia_lote2_test_resources,
  public.lexia_clientes,
  public.lexia_usuarios_clientes,
  public.lexia_contactos,
  public.lexia_mensagens,
  public.lexia_handoffs
to service_role;

revoke all on function public.lexia_is_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.lexia_user_can_access_cliente(text)
  from public, anon, authenticated, service_role;
grant execute on function public.lexia_is_admin()
  to authenticated, service_role;
grant execute on function public.lexia_user_can_access_cliente(text)
  to authenticated, service_role;

insert into public.lexia_environment_identity (
  id, project_ref, environment, disposable
) values (
  true,
  current_setting('lexia.target_project_ref'),
  'isolated_test',
  true
);

commit;

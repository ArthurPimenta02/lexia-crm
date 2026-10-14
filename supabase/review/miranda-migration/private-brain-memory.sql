-- REVIEW ONLY. Run separately in the intended PRIVATE brain project, never
-- the central project. No secrets, client data, fixtures, DROP or cleanup.
begin;
create table public.lexia_brain_identity (
  id boolean primary key default true check(id),
  environment text not null check(environment in ('local','isolated_test','staging','production')),
  project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
  cliente_slug text not null check(cliente_slug ~ '^[a-z0-9_]{1,64}$'),
  disposable boolean not null default false
);
create table public.lexia_brain_memories (
  memory_key text primary key,
  scope_json jsonb not null,
  context_json jsonb not null,
  version bigint not null check(version>0),
  last_invocation_id uuid not null,
  last_request_identity text not null,
  cached_result jsonb not null,
  updated_at timestamptz not null,
  check(jsonb_typeof(scope_json)='object' and jsonb_typeof(context_json)='object' and jsonb_typeof(cached_result)='object'),
  check(scope_json=cached_result->'scope')
);
alter table public.lexia_brain_identity enable row level security;
alter table public.lexia_brain_memories enable row level security;
revoke all on public.lexia_brain_identity,public.lexia_brain_memories from public,anon,authenticated;
grant select on public.lexia_brain_identity to service_role;
grant select,insert,update on public.lexia_brain_memories to service_role;
-- Add the reviewed identity row separately; never infer it from a request.
commit;

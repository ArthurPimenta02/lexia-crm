-- Strict, read-only gate for a brand-new disposable Supabase project.
-- It must pass immediately before the first baseline write.

begin transaction read only;

select
  current_database() as database_name,
  current_user as database_user,
  current_setting('lexia.target_project_ref', true) as declared_project_ref,
  current_setting('lexia.target_environment', true) as declared_environment;

select n.nspname as schema_name, c.relname, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
order by c.relkind, c.relname;

select
  (select count(*) from auth.users) as auth_users,
  case when to_regclass('storage.objects') is null then 0
    else (select count(*) from storage.objects) end as storage_objects,
  case when to_regclass('storage.buckets') is null then 0
    else (select count(*) from storage.buckets) end as storage_buckets;

do $$
declare
  expected_ref text := nullif(current_setting('lexia.target_project_ref', true), '');
  expected_env text := nullif(current_setting('lexia.target_environment', true), '');
begin
  if expected_ref is null or expected_ref !~ '^[a-z0-9]{10,40}$' then
    raise exception 'A valid lexia.target_project_ref is required';
  end if;
  if expected_env is distinct from 'isolated_test' then
    raise exception 'The bootstrap preflight is restricted to isolated_test';
  end if;
  if current_database() <> 'postgres' then
    raise exception 'Unexpected database name';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ) then
    raise exception 'Unexpected public relations exist';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'Unexpected Auth users exist';
  end if;
  if to_regclass('storage.objects') is not null
    and exists (select 1 from storage.objects) then
    raise exception 'Unexpected Storage objects exist';
  end if;
  if to_regclass('storage.buckets') is not null
    and exists (select 1 from storage.buckets) then
    raise exception 'Unexpected Storage buckets exist';
  end if;
end;
$$;

commit;

-- Read-only verification for the disposable Next.js runtime harness.

begin transaction read only;

do $$
declare
  expected_ref text;
begin
  select project_ref
  into expected_ref
  from public.lexia_environment_identity
  where id = true
    and environment = 'isolated_test'
    and disposable = true;

  if expected_ref is null then
    raise exception 'Disposable identity not found';
  end if;

  if not exists (
    select 1
    from public.lexia_runtime_test_harness
    where id = true
      and project_ref = expected_ref
      and version = 'lote1-runtime-next-v1'
  ) then
    raise exception 'Runtime harness marker is missing or mismatched';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lexia_clientes'
      and column_name = 'cor_principal'
  ) then
    raise exception 'lexia_clientes.cor_principal is missing';
  end if;

  if exists (
    select 1
    from unnest(array[
      'lexia_testes_sessoes',
      'lexia_testes_execucoes',
      'lexia_feedbacks',
      'lexia_handoffs',
      'lexia_contactos',
      'lexia_mensagens',
      'lexia_runtime_test_harness'
    ]) as required(required_table)
    where to_regclass('public.' || required.required_table) is null
  ) then
    raise exception 'One or more runtime harness tables are missing';
  end if;

  if has_table_privilege('anon', 'public.lexia_testes_sessoes', 'SELECT')
    or has_table_privilege(
      'authenticated',
      'public.lexia_testes_execucoes',
      'INSERT'
    )
    or has_table_privilege(
      'authenticated',
      'public.lexia_runtime_test_harness',
      'SELECT'
    )
    or has_column_privilege(
      'authenticated',
      'public.lexia_workflows',
      'webhook_url',
      'SELECT'
    )
  then
    raise exception 'Runtime harness grants are broader than expected';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.lexia_testes_sessoes',
    'INSERT'
  ) or not has_table_privilege(
    'authenticated',
    'public.lexia_testes_execucoes',
    'SELECT'
  ) then
    raise exception 'Required runtime grants are missing';
  end if;

  if exists (
    select 1
    from unnest(array[
      'lexia_testes_sessoes',
      'lexia_testes_execucoes',
      'lexia_feedbacks',
      'lexia_handoffs',
      'lexia_contactos',
      'lexia_mensagens',
      'lexia_runtime_test_harness'
    ]) as required(required_table)
    where not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = required.required_table
        and c.relrowsecurity = true
    )
  ) then
    raise exception 'RLS is not enabled on every runtime harness table';
  end if;
end;
$$;

select
  project_ref,
  version,
  'runtime_harness_verified' as result
from public.lexia_runtime_test_harness
where id = true;

commit;

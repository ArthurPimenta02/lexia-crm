-- Disposable-harness policy only.
--
-- Apply after 202610030002_lote1_authorization_and_private_workflows.sql.
-- This reproduces the central contract in which lexia_clientes delegates its
-- tenant decision to lexia_user_can_access_cliente instead of copying that
-- function's logic into the policy.

begin;

do $$
begin
  if to_regprocedure('public.lexia_user_can_access_cliente(text)') is null then
    raise exception
      'lexia_user_can_access_cliente(text) must exist before installing the isolated client policy';
  end if;
end;
$$;

drop policy if exists "clientes_select_authorized" on public.lexia_clientes;

create policy "clientes_select_authorized"
on public.lexia_clientes for select to authenticated
using (public.lexia_user_can_access_cliente(slug));

create or replace function public.lexia_test_client_policy_uses_access_helper()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'lexia_clientes'
      and policyname = 'clientes_select_authorized'
      and cmd = 'SELECT'
      and position(
        'lexia_user_can_access_cliente' in coalesce(qual, '')
      ) > 0
  );
$$;

revoke all on function
  public.lexia_test_client_policy_uses_access_helper()
  from public, anon, authenticated;
grant execute on function
  public.lexia_test_client_policy_uses_access_helper()
  to service_role;

commit;

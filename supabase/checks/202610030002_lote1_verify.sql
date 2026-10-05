select
  c.conname,
  c.convalidated,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.lexia_usuarios_clientes'::regclass
  and c.conname in (
    'lexia_usuarios_clientes_user_id_key',
    'lexia_usuarios_clientes_role_scope_check'
  )
order by c.conname;

select
  indexrelid::regclass::text as index_name,
  indisready,
  indisvalid,
  indisunique
from pg_index
where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'lexia_workflows'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type, column_name;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'lexia_workflows'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;

select proname, prosecdef, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'lexia_is_admin',
    'lexia_user_can_access_cliente',
    'lexia_reivindicar_ferramenta_analista',
    'lexia_finalizar_execucao_analista'
  )
order by proname;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'lexia_clientes',
    'lexia_ai_sessoes',
    'lexia_ai_mensagens',
    'lexia_conversation_insights',
    'lexia_ai_execucoes',
    'lexia_ajustes_agente'
  )
order by tablename, policyname;

select
  policyname,
  qual,
  position(
    'lexia_user_can_access_cliente' in coalesce(qual, '')
  ) > 0 as uses_shared_client_access_helper
from pg_policies
where schemaname = 'public'
  and tablename = 'lexia_clientes'
  and cmd = 'SELECT'
order by policyname;

select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
where c.oid = 'public.lexia_workflows'::regclass;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'lexia_workflows'
order by policyname;

-- Read-only preflight for Lot 1. Run before the concurrent index operation.
select user_id, count(*) as association_count
from public.lexia_usuarios_clientes
group by user_id
having count(*) > 1
order by association_count desc, user_id;

select id, user_id, cliente_slug, role, status
from public.lexia_usuarios_clientes
where not (
  (role = 'lexia_admin' and cliente_slug is null)
  or
  (role in ('cliente_admin', 'cliente_operador') and cliente_slug is not null)
)
order by user_id, id;

select
  indexrelid::regclass::text as index_name,
  indisready,
  indisvalid,
  indisunique,
  pg_get_indexdef(indexrelid) as definition
from pg_index
where indexrelid = to_regclass('public.lexia_usuarios_clientes_user_id_key');

select
  conname,
  contype,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.lexia_usuarios_clientes'::regclass
  and conname in (
    'lexia_usuarios_clientes_user_id_key',
    'lexia_usuarios_clientes_role_scope_check'
  );

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

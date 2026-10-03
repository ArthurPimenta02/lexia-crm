begin;

-- Apply only after the compatible server-only workflow DAL is deployed.
-- This revocation intentionally affects every authenticated JWT, including a
-- Lexia admin. Private destination reads and all writes continue via an
-- explicitly authorized server path using service_role.
alter table public.lexia_workflows enable row level security;

drop policy if exists "workflows_admin_all" on public.lexia_workflows;
create policy "workflows_admin_all"
on public.lexia_workflows for all to authenticated
using (public.lexia_is_admin())
with check (public.lexia_is_admin());

drop policy if exists "workflows_select" on public.lexia_workflows;
create policy "workflows_select"
on public.lexia_workflows for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

revoke all on public.lexia_workflows from public, anon, authenticated;

grant select (
  id,
  cliente_slug,
  nome,
  tipo,
  status,
  criado_em,
  atualizado_em
) on public.lexia_workflows to authenticated;

commit;

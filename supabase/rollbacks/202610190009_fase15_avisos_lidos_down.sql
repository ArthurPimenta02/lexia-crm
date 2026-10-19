-- Rollback da Fase 15 — avisos lidos
--
-- Apagar esta tabela não perde nada que não se recupere: o que se perde é o
-- "já li isto" de cada pessoa, e o pior que acontece é o sino voltar a
-- mostrar avisos que já tinham sido vistos. Os avisos em si não vivem aqui.

begin;

drop policy if exists "lexia_avisos_lidos_select" on public.lexia_avisos_lidos;
drop policy if exists "lexia_avisos_lidos_insert" on public.lexia_avisos_lidos;
drop policy if exists "lexia_avisos_lidos_delete" on public.lexia_avisos_lidos;

drop index if exists public.lexia_avisos_lidos_user_idx;
drop index if exists public.lexia_avisos_lidos_cliente_idx;

drop table if exists public.lexia_avisos_lidos;

commit;

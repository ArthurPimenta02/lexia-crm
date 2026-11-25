-- Rollback do compareceu/faltou (2026-11-25).
--
-- ATENÇÃO: apaga todas as marcações de compareceu/faltou feitas no app.

begin;

drop table if exists public.lexia_presencas;

commit;

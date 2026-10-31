-- Rollback da Fase 19 — conexões
--
-- ATENÇÃO: apaga os tokens gravados pela tela /admin/conexoes. Eles só existem
-- aqui (cifrados). Antes de correr, confirme que o agente em código não
-- depende deles, ou que estão guardados noutro sítio.

begin;

drop table if exists public.lexia_conexoes;

commit;

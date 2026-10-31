-- Rollback da Fase 18 — registo de turnos
--
-- Apaga o registo dos turnos do agente em código. Não afecta as conversas
-- (lexia_mensagens) nem os resultados da Área de testes; perde-se só o passo a
-- passo de cada resposta, que não existe em mais lado nenhum.

begin;

drop index if exists public.lexia_turnos_run_idx;
drop index if exists public.lexia_turnos_conversa_criado_idx;
drop index if exists public.lexia_turnos_cliente_criado_idx;

drop table if exists public.lexia_turnos;

commit;

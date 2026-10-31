-- Rollback da Fase 21 — bloqueios
--
-- ATENÇÃO: apaga a lista de contactos bloqueados gravada pela tela
-- /admin/bloqueios. Enquanto o agente em código ler esta tabela, apagá-la faz
-- a agente voltar a responder a essas pessoas.

begin;

drop index if exists public.lexia_bloqueios_cliente_idx;
drop table if exists public.lexia_bloqueios;

commit;

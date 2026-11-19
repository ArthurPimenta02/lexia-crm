-- Rollback das análises das conversas (2026-11-19).
--
-- ATENÇÃO: apaga todos os relatórios gravados pela rotina diária e as notas e
-- estados (visto/corrigido/falso alarme) marcados na tela /admin/analises.
-- As policies e os grants do analise_leitura nestas tabelas vão com elas; as
-- permissões dele no resto da base não mudam.

begin;

drop table if exists public.lexia_analises_itens;
drop table if exists public.lexia_analises;

commit;

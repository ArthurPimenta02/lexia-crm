-- Rollback da Fase 20 — mídia guardada
--
-- ATENÇÃO: os arquivos guardados só existem neste bucket. O Supabase não
-- deixa apagar um bucket com arquivos; esvazie-o antes (no painel, Storage),
-- e só depois de confirmar que ninguém precisa deles. As mensagens em
-- lexia_mensagens continuam com o texto; a mídia passa a "indisponível".

begin;

delete from storage.buckets where id = 'lexia-midia';

commit;

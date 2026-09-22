-- Destructive rollback for 202609220001_lexia_ai_analyst.sql.
-- Export the four Analista Lexia tables before running this in an environment
-- that already contains chat history or conversation classifications.

begin;

drop table if exists public.lexia_ai_mensagens;
drop table if exists public.lexia_ai_execucoes;
drop table if exists public.lexia_conversation_insights;
drop table if exists public.lexia_ai_sessoes;
drop function if exists public.lexia_ai_touch_atualizado_em();

commit;

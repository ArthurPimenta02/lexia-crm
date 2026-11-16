-- Desfaz 202611160017_onboarding_entrevista.sql. APAGA os dados do onboarding novo.
-- O bucket `onboarding` não é apagado aqui (o Supabase recusa apagar um bucket com arquivos): esvaziar e apagar pelo painel.
begin;
drop view if exists public.lexia_onboarding_campos_atual;
drop table if exists public.lexia_onboarding_campos;
drop table if exists public.lexia_onboarding_mensagens;
drop table if exists public.lexia_onboarding_arquivos;
drop table if exists public.lexia_onboarding_itens;
drop table if exists public.lexia_onboardings;
commit;

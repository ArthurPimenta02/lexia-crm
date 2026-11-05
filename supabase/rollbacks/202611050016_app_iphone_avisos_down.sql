-- Desfaz 202611050016_app_iphone_avisos.sql (apaga aparelhos, preferências e histórico de envios).
begin;
drop table if exists public.lexia_app_envios;
drop table if exists public.lexia_app_preferencias;
drop table if exists public.lexia_app_aparelhos;
commit;

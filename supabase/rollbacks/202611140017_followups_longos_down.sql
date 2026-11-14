-- Desfaz 202611140017_followups_longos.sql (os agentes passam a tratar os follow-ups longos como desligados).
begin;
alter table public.lexia_clientes drop column if exists followups_longos;
commit;

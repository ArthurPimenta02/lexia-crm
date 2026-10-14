-- Add accepted operational origins without changing any existing message.
begin;
alter table public.lexia_mensagens add constraint lexia_mensagens_origem_migration_check
  check(origem in ('workflow','humano','recebida_na_pausa','teste_workflow','followup_agente')) not valid;
alter table public.lexia_mensagens validate constraint lexia_mensagens_origem_migration_check;
alter table public.lexia_mensagens drop constraint lexia_mensagens_origem_check;
alter table public.lexia_mensagens rename constraint lexia_mensagens_origem_migration_check to lexia_mensagens_origem_check;
commit;

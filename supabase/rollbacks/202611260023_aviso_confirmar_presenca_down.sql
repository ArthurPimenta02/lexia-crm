-- Volta à restrição de 05/11 (apaga antes as preferências dos tipos novos).
delete from public.lexia_app_preferencias where tipo not in ('agendamento_novo', 'agendamento_remarcado', 'agendamento_cancelado', 'a_espera', 'agenda_manual', 'resumo_manha', 'campanha', 'todos_os_clientes');
alter table public.lexia_app_preferencias drop constraint if exists lexia_app_preferencias_tipo_check;
alter table public.lexia_app_preferencias add constraint lexia_app_preferencias_tipo_check check (tipo in (
  'agendamento_novo', 'agendamento_remarcado', 'agendamento_cancelado',
  'a_espera', 'agenda_manual', 'resumo_manha', 'campanha', 'todos_os_clientes'
));

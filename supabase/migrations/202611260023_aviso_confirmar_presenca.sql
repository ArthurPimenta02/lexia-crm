-- Avisos do app (26/11/2026): tipo novo "confirmar_presenca" (às 20:30, quem
-- ainda não tem compareceu/faltou). A restrição original (05/11) também não
-- tinha os tipos de 14/11 (pediu_pessoa, irritado, resumo_semana, meta_batida):
-- desligar esses avisos no app falhava. Esta lista é a de lib/app/aparelhos.ts.
alter table public.lexia_app_preferencias drop constraint if exists lexia_app_preferencias_tipo_check;
alter table public.lexia_app_preferencias add constraint lexia_app_preferencias_tipo_check check (tipo in (
  'a_espera', 'pediu_pessoa', 'irritado',
  'agendamento_novo', 'agendamento_remarcado', 'agendamento_cancelado', 'agenda_manual',
  'resumo_manha', 'resumo_semana', 'meta_batida', 'confirmar_presenca',
  'todos_os_clientes', 'campanha'
));

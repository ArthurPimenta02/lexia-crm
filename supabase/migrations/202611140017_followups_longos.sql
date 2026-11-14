-- Follow-ups de 3 e 7 dias — interruptor por cliente (14/11/2026)
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- Os agentes (Carol/Miranda e Detail) classificam cada lead em frio, morno ou
-- quente (evento `lead_temperatura` em lexia_eventos) e agendam follow-ups
-- longos: morno + 7 dias, quente + 3 e 7 dias, só WhatsApp, numa fila lenta
-- (até 10 por dia, 6–12 min entre envios). Esta coluna liga/desliga isso por
-- cliente; os agentes leem-na pela service_role a cada minuto. Desligado (o
-- valor por omissão) = como antes da mudança, mas sem o de 3 dias do Detail.
--
-- Não há grant para authenticated: só o admin (service_role) a lê e grava.

begin;

alter table public.lexia_clientes
  add column if not exists followups_longos boolean not null default false;

comment on column public.lexia_clientes.followups_longos is
  'Follow-ups de 3 e 7 dias (morno/quente, só WhatsApp) ligados para este cliente. Lido pelos agentes; editado em /admin/clientes/<slug>.';

commit;

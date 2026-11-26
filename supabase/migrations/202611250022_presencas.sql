-- Compareceu / Faltou (25/11/2026, app focado na agenda).
--
-- Fica numa tabela PRÓPRIA e não em lexia_agendamentos de propósito: essa
-- tabela é o espelho do Google, reescrito pela sincronização de 2 em 2 minutos.
-- Uma coluna lá era apagada na passagem seguinte. A chave é a mesma que liga o
-- espelho ao Google (empresa + agenda + evento), que não muda numa remarcação.
--
-- Só o painel (service role) lê e escreve; ninguém de fora.

begin;

create table if not exists public.lexia_presencas (
  cliente_slug text not null references public.lexia_clientes (slug) on delete cascade,
  calendario_id text not null check (char_length(calendario_id) between 3 and 300),
  event_id text not null check (char_length(event_id) between 1 and 1024),
  presenca text not null check (presenca in ('compareceu', 'faltou')),
  marcado_por uuid references auth.users (id) on delete set null,
  marcado_em timestamptz not null default now(),
  primary key (cliente_slug, calendario_id, event_id)
);

create index if not exists lexia_presencas_cliente_idx
  on public.lexia_presencas (cliente_slug, marcado_em desc);

alter table public.lexia_presencas enable row level security;
revoke all on public.lexia_presencas from anon, authenticated;

comment on table public.lexia_presencas is
  'Compareceu/faltou por agendamento (chave = a do espelho do Google). Escrito pelo app/painel com o user da sessão.';

commit;

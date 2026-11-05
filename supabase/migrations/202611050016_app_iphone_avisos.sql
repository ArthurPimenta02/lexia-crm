-- App do iPhone — aparelhos, preferências e envios dos avisos
--
-- Esta migration pertence ao Supabase CENTRAL da Lexia.
--
-- O app é uma casca que abre o painel; o que ele acrescenta são os avisos no
-- iPhone. Quem os manda é o serviço da plataforma na VPS (lexia-plataforma),
-- pela Apple (APNs), sem Firebase. Os avisos nascem dos factos da base, como
-- os do sino: agenda (lexia_agendamentos) e cliente à espera (lexia_mensagens).
--
--   lexia_app_aparelhos     um iPhone com o app instalado e a sessão aberta
--   lexia_app_preferencias  que tipos de aviso cada pessoa quer
--   lexia_app_envios        o que já saiu: a chave é única, por isso o mesmo
--                           aviso nunca sai duas vezes (nem depois de reiniciar)
--
-- O painel grava aparelhos e preferências pela service_role, depois de ler a
-- sessão; o serviço da VPS lê e grava pela service_role. Ninguém mais toca
-- nestas tabelas: RLS ligado e nenhuma política para anon/authenticated.

begin;

create table if not exists public.lexia_app_aparelhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- O token da Apple identifica o app NESTE iPhone. Se outra pessoa entrar no
  -- mesmo iPhone, o token passa para ela (upsert pelo token).
  token text not null unique check (token ~ '^[0-9a-fA-F]{32,200}$'),
  ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox')),
  plataforma text not null default 'ios' check (plataforma in ('ios')),
  activo boolean not null default true,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);

create index if not exists lexia_app_aparelhos_user_idx
  on public.lexia_app_aparelhos (user_id) where activo;

create table if not exists public.lexia_app_preferencias (
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in (
    'agendamento_novo', 'agendamento_remarcado', 'agendamento_cancelado',
    'a_espera', 'agenda_manual', 'resumo_manha', 'campanha', 'todos_os_clientes'
  )),
  ligado boolean not null,
  actualizado_em timestamptz not null default now(),
  primary key (user_id, tipo)
);

create table if not exists public.lexia_app_envios (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (char_length(chave) between 3 and 500),
  cliente_slug text not null,
  tipo text not null,
  titulo text not null,
  corpo text not null,
  url text not null,
  destinatarios integer not null default 0,
  entregues integer not null default 0,
  falhas jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists lexia_app_envios_cliente_idx
  on public.lexia_app_envios (cliente_slug, criado_em desc);

alter table public.lexia_app_aparelhos enable row level security;
alter table public.lexia_app_preferencias enable row level security;
alter table public.lexia_app_envios enable row level security;

revoke all on public.lexia_app_aparelhos from anon, authenticated;
revoke all on public.lexia_app_preferencias from anon, authenticated;
revoke all on public.lexia_app_envios from anon, authenticated;

comment on table public.lexia_app_aparelhos is
  'iPhones com o app da Lexia. Gravado pelo painel (rota /api/app/aparelho) com o user da sessao.';
comment on table public.lexia_app_preferencias is
  'Tipos de aviso que cada pessoa quer. Sem linha = ligado, menos agenda_manual e todos_os_clientes.';
comment on table public.lexia_app_envios is
  'Avisos ja enviados. A chave unica impede que o mesmo aviso saia duas vezes.';

commit;

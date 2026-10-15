-- Fase 8 do PLANO_ENTREGA_CRM_MULTICLIENTE: campanhas e custo por dia.
--
-- Porque existe: o painel do Detail by Cordeiro precisa de responder "quanto
-- gastei e o que e que isso me deu". Hoje esse numero so existe dentro do
-- Gestor de Anuncios da Meta, que nao se junta com nada nosso.
--
-- O plano previa comecar por import manual/CSV. Nao e preciso: o system user
-- "Lexia AI Bot" ja le a conta act_713888634370334 pela Marketing API v26.0
-- (medido em 14/10/2026: 7 dias = 89,53 EUR, alcance 57.177, cliques 4.785).
--
-- DUAS DECISOES QUE ESTA TABELA IMPOE, e o porque de cada uma:
--
-- 1. UPSERT, nunca append. A Meta reescreve os numeros de um dia ja passado
--    durante cerca de 28 dias (janelas de atribuicao fecham tarde). Se cada
--    sincronizacao inserisse uma linha nova, o gasto do mes aparecia inflado.
--    Dai a unique (campanha_id, dia): sincronizar duas vezes o mesmo dia tem
--    de dar exactamente o mesmo resultado.
--
-- 2. NAO HA COLUNA DE "MENSAGENS INICIADAS". Nesta conta a Meta nao devolve
--    onsite_conversion.messaging_conversation_started_7d em nenhum dia do
--    historico -- 5.646,37 EUR desde 01/01/2025 e zero. A unica accao de
--    mensagem que aparece e onsite_conversion.messaging_block (658).
--    O motivo esta na estrutura das campanhas, nao na API: a campanha activa
--    tem objectivo OUTCOME_ENGAGEMENT e, dos 4 conjuntos ligados, o unico com
--    destino WHATSAPP optimiza LINK_CLICKS (logo a Meta nunca conta conversa)
--    e os outros 3 optimizam CONVERSATIONS mas para
--    MESSAGING_INSTAGRAM_DIRECT_MESSENGER -- 135 de 177 EUR em 14 dias, 76%
--    do gasto, e o Instagram nao envia dados de atribuicao. Isso explica
--    tambem o lado do n8n: em 1.726 execucoes do omnichannel do Detail,
--    apenas 1 trouxe bloco referral.
--    Em v26.0 nao ha atalho: conversations, cost_per_conversation e
--    total_messaging_connection sao recusados como campo de topo (erro #100);
--    conversas so apareceriam dentro do array actions.
--    Por isso "mensagens do dia" conta-se do nosso lado (contactos novos em
--    lexia_contactos), nao do lado da Meta. Guardar um campo da Meta que vem
--    sempre a zero seria fabricar um numero falso. A coluna accoes jsonb
--    guarda o array bruto para que, no dia em que o orcamento mudar para
--    destino WhatsApp, o historico ja esteja lah.
--
-- Esta migration e aditiva: cria tabelas novas e nao toca em nada existente.

begin;

-- Guard: o risco real desta migration e ser executada no Supabase errado.
-- Cada cliente tem o seu proprio projecto Supabase; campanhas e custos vivem
-- apenas na base central da Lexia, que e a unica que tem lexia_clientes.
do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dimensao: a campanha tal como existe na plataforma de anuncios.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_campanhas (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  plataforma text not null check (plataforma in ('meta', 'google')),
  -- ID da campanha na plataforma. Texto, nao bigint: a Meta devolve string e
  -- o Google usa outro formato. Nunca fazer aritmetica com isto.
  campanha_externa_id text not null
    check (char_length(campanha_externa_id) between 1 and 128),
  nome text not null check (char_length(nome) between 1 and 512),
  objectivo text check (char_length(objectivo) between 1 and 128),
  estado text check (char_length(estado) between 1 and 64),
  conta_externa_id text check (char_length(conta_externa_id) between 1 and 128),
  criada_em_plataforma timestamptz,
  sincronizada_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint lexia_campanhas_externa_key
    unique (cliente_slug, plataforma, campanha_externa_id)
);

-- ---------------------------------------------------------------------------
-- Factos: uma linha por dia x campanha. Reescrita a cada sincronizacao.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_campanha_custos (
  id uuid primary key default extensions.gen_random_uuid(),
  campanha_id uuid not null references public.lexia_campanhas(id)
    on update cascade on delete cascade,
  -- Repetido de proposito: a policy RLS e a leitura do painel filtram por
  -- cliente sem ter de juntar a dimensao em cada query.
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- Dia no fuso da conta de anuncios, como a Meta o devolve (date_start).
  -- Para o Detail e Europe/Lisbon. Nao converter: comparar com o Gestor de
  -- Anuncios tem de dar o mesmo numero, ou o cliente deixa de confiar.
  dia date not null,
  gasto numeric(12, 2) not null default 0 check (gasto >= 0),
  moeda text not null default 'EUR' check (char_length(moeda) = 3),
  alcance bigint check (alcance >= 0),
  impressoes bigint check (impressoes >= 0),
  cliques bigint check (cliques >= 0),
  cliques_link bigint check (cliques_link >= 0),
  cpm numeric(12, 4) check (cpm >= 0),
  ctr numeric(8, 4) check (ctr >= 0),
  -- Array de accoes como a Meta o devolve, sem interpretacao. E aqui que
  -- aparecerao as conversas iniciadas se a conta passar a contabiliza-las.
  accoes jsonb check (accoes is null or jsonb_typeof(accoes) = 'array'),
  sincronizado_em timestamptz not null default now(),
  constraint lexia_campanha_custos_dia_key unique (campanha_id, dia)
);

-- O painel pede sempre "um cliente, um intervalo de dias".
create index if not exists lexia_campanha_custos_cliente_dia_idx
  on public.lexia_campanha_custos (cliente_slug, dia desc);

-- ---------------------------------------------------------------------------
-- Permissoes: escrita so por service_role (rota de sincronizacao). O cliente
-- le apenas as suas campanhas, e so as colunas que o painel mostra.
-- ---------------------------------------------------------------------------
alter table public.lexia_campanhas enable row level security;
alter table public.lexia_campanha_custos enable row level security;

revoke all on
  public.lexia_campanhas,
  public.lexia_campanha_custos
from public, anon, authenticated, service_role;

grant select, insert, update, delete on
  public.lexia_campanhas,
  public.lexia_campanha_custos
to service_role;

create policy "campanhas_select"
on public.lexia_campanhas for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  cliente_slug,
  plataforma,
  campanha_externa_id,
  nome,
  objectivo,
  estado,
  criada_em_plataforma,
  sincronizada_em
) on public.lexia_campanhas to authenticated;

create policy "campanha_custos_select"
on public.lexia_campanha_custos for select to authenticated
using (public.lexia_user_can_access_cliente(cliente_slug));

grant select (
  id,
  campanha_id,
  cliente_slug,
  dia,
  gasto,
  moeda,
  alcance,
  impressoes,
  cliques,
  cliques_link,
  cpm,
  ctr,
  sincronizado_em
) on public.lexia_campanha_custos to authenticated;

comment on table public.lexia_campanhas is
  'Campanhas de anuncios espelhadas da plataforma (Meta hoje, Google depois). Dimensao: nao guarda numeros.';
comment on column public.lexia_campanhas.campanha_externa_id is
  'ID da campanha na plataforma. Junta com lexia_contactos.origem_source_id pela via anuncio -> adset -> campanha.';
comment on table public.lexia_campanha_custos is
  'Gasto e entrega por dia x campanha. Reescrita por upsert: a Meta corrige dias passados durante ~28 dias.';
comment on column public.lexia_campanha_custos.dia is
  'Dia no fuso da conta de anuncios (date_start da Meta), para bater exactamente com o Gestor de Anuncios.';
comment on column public.lexia_campanha_custos.accoes is
  'Array actions bruto da Meta. Nesta conta ainda nao traz conversas iniciadas; guardado para quando trouxer.';

commit;

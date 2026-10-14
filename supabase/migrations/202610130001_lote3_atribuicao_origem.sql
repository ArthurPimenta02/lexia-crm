-- Fase 1 do PLANO_ENTREGA_CRM_MULTICLIENTE: captura de atribuicao de origem.
--
-- Porque existe: o Meta envia os dados do anuncio (referral / externalAdReply)
-- APENAS na primeira mensagem do lead. Hoje os dois clientes ja extraem esse
-- bloco dentro do n8n -- a Miranda em "Adaptar Entrada Z-API" (body._anuncio)
-- e o Detail em "Normalizar Entrada Meta Omnichannel" -- mas usam-no so em
-- memoria e nunca o gravam. Cada dia sem persistir e um dia de CAC que nao
-- se recupera.
--
-- Esta migration e aditiva e idempotente:
--   - ADD COLUMN sem DEFAULT nao reescreve a tabela (Postgres 11+), portanto
--     nao ha downtime nem lock longo numa tabela em producao.
--   - Todas as colunas sao nullable: nenhuma escrita existente passa a falhar.
--   - Nenhuma policy RLS e alterada; as colunas novas herdam as da tabela.
--
-- Nao emite evento de atribuicao: isso depende de estender o enum
-- command_type de lexia_conversation_state_events, que e a Fase 2.

begin;

-- Guard: o risco real desta migration e ser executada no Supabase errado.
-- Cada cliente tem o seu proprio projecto Supabase, e lexia_contactos vive
-- apenas na base central da Lexia. Falhar alto e melhor do que criar colunas
-- orfas na base de um cliente.
do $$
begin
  if to_regclass('public.lexia_contactos') is null then
    raise exception
      'lexia_contactos nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

alter table public.lexia_contactos
  add column if not exists origem_tipo text,
  add column if not exists origem_source_id text,
  add column if not exists origem_titulo text,
  add column if not exists origem_url text,
  add column if not exists origem_dados jsonb,
  add column if not exists origem_capturada_em timestamptz;

-- Vocabulario fechado, mas permissivo quanto a NULL para nao invalidar as
-- linhas que ja existem. NOT VALID: nao varre a tabela inteira agora.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lexia_contactos_origem_tipo_check'
      and conrelid = 'public.lexia_contactos'::regclass
  ) then
    alter table public.lexia_contactos
      add constraint lexia_contactos_origem_tipo_check
      check (
        origem_tipo is null or origem_tipo in (
          'ctwa',            -- clique em anuncio -> WhatsApp
          'instagram_ad',    -- clique em anuncio -> Instagram Direct
          'messenger_ad',    -- clique em anuncio -> Messenger
          'meta_ad',         -- anuncio Meta sem app de origem identificado
          'organico',        -- chegou sem anuncio
          'indicacao',
          'desconhecido'
        )
      ) not valid;
  end if;
end;
$$;

-- Suporta a juncao gasto x agendamentos da Fase 8 (CAC por campanha).
-- Parcial: so indexa quem veio de anuncio, que e a minoria das linhas.
create index if not exists lexia_contactos_origem_source_id_idx
  on public.lexia_contactos (cliente_slug, origem_source_id)
  where origem_source_id is not null;

comment on column public.lexia_contactos.origem_tipo is
  'Como o lead chegou. Preenchido na primeira mensagem; nunca sobrescrito depois (atribuicao first-touch).';
comment on column public.lexia_contactos.origem_source_id is
  'ID do anuncio no Meta (externalAdReply.sourceId / referral.source_id). Chave para juntar com o gasto de campanha.';
comment on column public.lexia_contactos.origem_dados is
  'Bloco bruto do anuncio como veio do provedor, para nao perder campos que ainda nao sabemos usar.';
comment on column public.lexia_contactos.origem_capturada_em is
  'Quando a atribuicao foi capturada. NULL significa que nunca houve anuncio associado.';

commit;

-- Atribuição de anúncios PADRÃO para todos os clientes (19/11/2026).
--
-- O PROBLEMA
-- Cada agente grava a origem da ficha à sua maneira (o Detail pelas cópias dos
-- nós do n8n, a Miranda pelas dela, a Claudia pelo código próprio) e cada um
-- perde casos diferentes. Medido a 19/11 desde 20/09:
--   Detail   497 conversas, 103 com anúncio; 175 abrem com a frase do anúncio
--            e só 51 dessas estão ligadas. O Messenger nunca gravou um anúncio
--            (a app não tinha messaging_referrals assinado até hoje).
--   Miranda  464 conversas, 218 com anúncio; 280 abrem com a frase e 114 dessas
--            estão sem ligação.
--
-- A REGRA, num sítio só (esta base), igual para todos:
--   1. id do anúncio que a Meta mandou (`ad_id`), lido no webhook cru em
--      message.referral, postback.referral e no evento messaging_referrals
--      (messaging[] ou changes[]). Não se exige source = ADS. Guardado pelo id
--      do remetente; junta-se à ficha quando ela existe (antes ou depois).
--   2. frase pronta do anúncio como PRIMEIRA mensagem do cliente → origem_tipo
--      'anuncio' (fonte 'frase_pronta'), sem campanha salvo se o mapa
--      frase → campanha a tiver.
--   3. a origem só sobe: nenhum agente a faz descer (um 'organico' gravado por
--      cima de um anúncio é ignorado).
-- O espelho em TypeScript é lib/meta/origem-anuncio.ts (o script de recuperação
-- do histórico corre esse).
--
-- O QUE NÃO FAZ
--   - Não mexe no corpo de lexia_webhooks_meta: continua cru. O que se deriva
--     vai para lexia_origens_pendentes.
--   - Não toca no código de nenhum agente (o da Miranda é intocável).
--   - Não reescreve o passado: só age em linhas novas. O histórico é o script
--     scripts/recuperar-origens.mts, e só com o OK do Arthur.
--   - Um erro aqui NUNCA impede gravar a mensagem, a ficha ou o webhook: cada
--     trigger apanha o erro e deixa um WARNING.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null
     or to_regclass('public.lexia_contactos') is null
     or to_regclass('public.lexia_mensagens') is null
     or to_regclass('public.lexia_webhooks_meta') is null then
    raise exception
      'Faltam tabelas da base CENTRAL da Lexia. Esta migration não é para o projecto de um cliente.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Frases prontas dos anúncios, por cliente (cliente_slug null = todos).
-- campanha_externa_id é o mapa frase → campanha: vazio hoje.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_frases_anuncio (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  frase text not null check (char_length(btrim(frase)) between 8 and 300),
  campanha_externa_id text check (campanha_externa_id ~ '^\d{1,32}$'),
  activa boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint lexia_frases_anuncio_unica unique nulls not distinct (cliente_slug, frase)
);

insert into public.lexia_frases_anuncio (cliente_slug, frase) values
  (null, 'Olá! Posso saber mais informações sobre isto?'),
  (null, 'Hello! Can I get more info on this?'),
  (null, '¡Hola! Quiero más información'),
  ('detail_by_cordeiro', 'Olá! Gostaria de conhecer mais sobre os pacotes de detalhe automóvel'),
  ('detail_by_cordeiro', 'Olá! Gostaria de saber mais sobre os pacotes de detalhe automóvel'),
  ('miranda_skin_experts', 'Olá, vim pelo anúncio e gostaria de agendar uma avaliação de pele'),
  ('miranda_skin_experts', 'Olá! Vim pelo anúncio e quero agendar uma avaliação de pele gratuita'),
  ('miranda_skin_experts', 'Hi! I saw your ad and I''d like to know more about the treatments'),
  ('miranda_skin_experts', 'Hi! I came across your ad and I''m interested in laser hair removal'),
  ('miranda_skin_experts', 'Hi! I saw your ad and I''d like to schedule a consultation'),
  ('miranda_skin_experts', 'Olá! Vim pelo anúncio e tenho interesse na depilação a laser'),
  ('miranda_skin_experts', 'Olá, vim pelo anúncio e quero agendar uma avaliação para Botox'),
  ('miranda_skin_experts', 'Hi! I came across your ad and I''m interested in laser tattoo removal')
on conflict on constraint lexia_frases_anuncio_unica do nothing;

-- ---------------------------------------------------------------------------
-- Referrais à espera da ficha (ou já aplicados): um por conversa, o último.
-- ---------------------------------------------------------------------------
create table if not exists public.lexia_origens_pendentes (
  cliente_slug text not null references public.lexia_clientes(slug)
    on update cascade on delete cascade,
  identificador_conversa text not null,
  canal text not null check (canal in ('whatsapp', 'instagram', 'messenger')),
  anuncio_externo_id text not null check (anuncio_externo_id ~ '^\d{1,32}$'),
  titulo text,
  caminho text not null,
  referral jsonb not null,
  webhook_id uuid,
  recebido_em timestamptz not null default now(),
  primary key (cliente_slug, identificador_conversa)
);

alter table public.lexia_frases_anuncio enable row level security;
alter table public.lexia_origens_pendentes enable row level security;
revoke all on public.lexia_frases_anuncio from public, anon, authenticated;
revoke all on public.lexia_origens_pendentes from public, anon, authenticated;
grant select, insert, update, delete on public.lexia_frases_anuncio to service_role;
grant select, insert, update, delete on public.lexia_origens_pendentes to service_role;

-- A "primeira mensagem recebida" de uma conversa tem de ser barata de achar.
create index if not exists lexia_mensagens_conversa_recebidas_idx
  on public.lexia_mensagens (cliente_slug, identificador_conversa, criado_em)
  where direccao = 'recebida';

-- ---------------------------------------------------------------------------
-- Funções puras (espelho: lib/meta/origem-anuncio.ts)
-- ---------------------------------------------------------------------------
create or replace function public.lexia_frase_normalizada(p_texto text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p_texto, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.lexia_origem_forca(p_tipo text, p_source_id text)
returns integer
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_tipo, '')), '') is null then 0
    when p_tipo = 'organico' then 1
    when p_tipo <> 'instagram_post' and nullif(btrim(coalesce(p_source_id, '')), '') is not null then 3
    else 2
  end
$$;

create or replace function public.lexia_tipo_de_anuncio(p_canal text)
returns text
language sql
immutable
as $$
  select case p_canal when 'instagram' then 'instagram_ad' when 'messenger' then 'messenger_ad'
    when 'whatsapp' then 'ctwa' else 'meta_ad' end
$$;

-- A frase pronta que abre o texto (uma linha que COMEÇA pela frase).
create or replace function public.lexia_frase_de_anuncio(p_cliente text, p_texto text)
returns table (frase text, campanha_externa_id text)
language sql
stable
as $$
  select f.frase, f.campanha_externa_id
  from public.lexia_frases_anuncio f
  where f.activa
    and (f.cliente_slug is null or f.cliente_slug = p_cliente)
    and char_length(public.lexia_frase_normalizada(f.frase)) >= 8
    and exists (
      select 1
      from regexp_split_to_table(coalesce(p_texto, ''), E'\n') as linha
      where starts_with(public.lexia_frase_normalizada(linha) || ' ',
                        public.lexia_frase_normalizada(f.frase) || ' ')
    )
  order by (f.cliente_slug is null), char_length(f.frase) desc
  limit 1
$$;

-- Os referrais de um webhook cru: Instagram/Messenger (3 sítios + changes[])
-- e WhatsApp Cloud API. Ecos (a nossa própria mensagem) não contam.
create or replace function public.lexia_referrais_do_webhook(p_corpo jsonb)
returns table (canal text, remetente text, anuncio_externo_id text, titulo text, caminho text, referral jsonb)
language sql
immutable
as $$
  with entradas as (
    select e.entry
    from jsonb_array_elements(case when jsonb_typeof(p_corpo -> 'entry') = 'array' then p_corpo -> 'entry' else '[]'::jsonb end) as e(entry)
  ),
  canal_meta as (
    select case p_corpo ->> 'object' when 'instagram' then 'instagram' when 'page' then 'messenger' end as c
  ),
  achados as (
    select cm.c as canal, m -> 'sender' ->> 'id' as remetente, r.caminho, r.ref
    from entradas, canal_meta cm,
      jsonb_array_elements(case when jsonb_typeof(entradas.entry -> 'messaging') = 'array' then entradas.entry -> 'messaging' else '[]'::jsonb end) as m,
      lateral (values
        ('message.referral', m -> 'message' -> 'referral'),
        ('messaging.referral', m -> 'referral'),
        ('postback.referral', m -> 'postback' -> 'referral')) as r(caminho, ref)
    where cm.c is not null
      and jsonb_typeof(r.ref) = 'object'
      and coalesce(m -> 'message' ->> 'is_echo', 'false') <> 'true'
    union all
    select cm.c, ch -> 'value' -> 'sender' ->> 'id', 'changes.messaging_referrals', ch -> 'value' -> 'referral'
    from entradas, canal_meta cm,
      jsonb_array_elements(case when jsonb_typeof(entradas.entry -> 'changes') = 'array' then entradas.entry -> 'changes' else '[]'::jsonb end) as ch
    where cm.c is not null
      and ch ->> 'field' = 'messaging_referrals'
      and jsonb_typeof(ch -> 'value' -> 'referral') = 'object'
  )
  select a.canal, nullif(btrim(coalesce(a.remetente, '')), ''),
    case when a.ref ->> 'ad_id' ~ '^\d{1,32}$' then a.ref ->> 'ad_id' end,
    nullif(btrim(coalesce(a.ref -> 'ads_context_data' ->> 'ad_title', '')), ''),
    a.caminho, a.ref
  from achados a
  union all
  select 'whatsapp', nullif(btrim(coalesce(msg ->> 'from', '')), ''),
    case when lower(coalesce(msg -> 'referral' ->> 'source_type', '')) = 'ad'
          and msg -> 'referral' ->> 'source_id' ~ '^\d{1,32}$' then msg -> 'referral' ->> 'source_id' end,
    nullif(btrim(coalesce(msg -> 'referral' ->> 'headline', '')), ''),
    'whatsapp.messages.referral', msg -> 'referral'
  from entradas,
    jsonb_array_elements(case when jsonb_typeof(entradas.entry -> 'changes') = 'array' then entradas.entry -> 'changes' else '[]'::jsonb end) as ch,
    jsonb_array_elements(case when jsonb_typeof(ch -> 'value' -> 'messages') = 'array' then ch -> 'value' -> 'messages' else '[]'::jsonb end) as msg
  where p_corpo ->> 'object' = 'whatsapp_business_account'
    and jsonb_typeof(msg -> 'referral') = 'object'
$$;

-- ---------------------------------------------------------------------------
-- 1. Webhook cru chegou → guarda o referral e liga-o à ficha, se já existir.
--    Um messaging_referrals NÃO é mensagem: aqui só se guarda a origem.
-- ---------------------------------------------------------------------------
create or replace function public.lexia_webhooks_meta_origem()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  conversa text;
  campanha text;
begin
  for r in
    select * from public.lexia_referrais_do_webhook(new.corpo)
    where anuncio_externo_id is not null and remetente is not null
  loop
    conversa := r.canal || ':' || r.remetente;

    insert into public.lexia_origens_pendentes as p
      (cliente_slug, identificador_conversa, canal, anuncio_externo_id, titulo, caminho, referral, webhook_id, recebido_em)
    values (new.cliente_slug, conversa, r.canal, r.anuncio_externo_id, r.titulo, r.caminho, r.referral, new.id, new.recebido_em)
    on conflict (cliente_slug, identificador_conversa) do update
      set anuncio_externo_id = excluded.anuncio_externo_id, titulo = excluded.titulo, caminho = excluded.caminho,
          referral = excluded.referral, webhook_id = excluded.webhook_id, recebido_em = excluded.recebido_em, canal = excluded.canal
      where excluded.recebido_em >= p.recebido_em;

    select a.campanha_externa_id into campanha
    from public.lexia_anuncios a
    where a.cliente_slug = new.cliente_slug and a.anuncio_externo_id = r.anuncio_externo_id
    limit 1;

    update public.lexia_contactos c
      set origem_tipo = public.lexia_tipo_de_anuncio(r.canal),
          origem_source_id = r.anuncio_externo_id,
          origem_titulo = r.titulo,
          origem_dados = jsonb_build_object('fonte', 'referral', 'caminho', r.caminho, 'canal', r.canal,
                                            'campanha_externa_id', campanha, 'referral', r.referral),
          origem_capturada_em = now()
    where c.cliente_slug = new.cliente_slug
      and c.identificador_conversa = conversa
      and public.lexia_origem_forca(c.origem_tipo, c.origem_source_id) < 3
      and c.criado_em >= new.recebido_em - interval '7 days';
  end loop;
  return null;
exception when others then
  raise warning 'lexia_webhooks_meta_origem: % (webhook %)', sqlerrm, new.id;
  return null;
end;
$$;

drop trigger if exists lexia_webhooks_meta_origem_trg on public.lexia_webhooks_meta;
create trigger lexia_webhooks_meta_origem_trg
  after insert on public.lexia_webhooks_meta
  for each row execute function public.lexia_webhooks_meta_origem();

-- ---------------------------------------------------------------------------
-- 2. Ficha a ser gravada (por qualquer agente ou pelo painel):
--    INSERT: junta o referral pendente, ou a frase da 1.ª mensagem já gravada.
--    UPDATE: a origem não desce.
-- ---------------------------------------------------------------------------
create or replace function public.lexia_contactos_origem()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  forca_velha integer;
  forca_nova integer;
  p record;
  fr record;
  primeira text;
  campanha text;
begin
  if tg_op = 'UPDATE' then
    forca_velha := public.lexia_origem_forca(old.origem_tipo, old.origem_source_id);
    forca_nova := public.lexia_origem_forca(new.origem_tipo, new.origem_source_id);
    if forca_nova < forca_velha then
      new.origem_tipo := old.origem_tipo;
      new.origem_source_id := old.origem_source_id;
      new.origem_titulo := old.origem_titulo;
      new.origem_url := old.origem_url;
      new.origem_dados := old.origem_dados;
      new.origem_capturada_em := old.origem_capturada_em;
    elsif forca_nova = forca_velha
      and new.origem_tipo is not distinct from old.origem_tipo
      and coalesce(new.origem_source_id, '') = coalesce(old.origem_source_id, '') then
      -- A mesma origem reescrita sem os pormenores (o agente regrava a ficha a
      -- cada mensagem): os pormenores ficam.
      new.origem_titulo := coalesce(new.origem_titulo, old.origem_titulo);
      new.origem_url := coalesce(new.origem_url, old.origem_url);
      new.origem_dados := coalesce(new.origem_dados, old.origem_dados);
      new.origem_capturada_em := coalesce(new.origem_capturada_em, old.origem_capturada_em);
    end if;
    return new;
  end if;

  if new.identificador_conversa is null or new.identificador_conversa like 'teste:%' then
    return new;
  end if;

  if public.lexia_origem_forca(new.origem_tipo, new.origem_source_id) < 3 then
    select * into p from public.lexia_origens_pendentes o
    where o.cliente_slug = new.cliente_slug
      and o.identificador_conversa = new.identificador_conversa
      and o.recebido_em >= coalesce(new.criado_em, now()) - interval '7 days';
    if found then
      select a.campanha_externa_id into campanha
      from public.lexia_anuncios a
      where a.cliente_slug = new.cliente_slug and a.anuncio_externo_id = p.anuncio_externo_id
      limit 1;
      new.origem_tipo := public.lexia_tipo_de_anuncio(p.canal);
      new.origem_source_id := p.anuncio_externo_id;
      new.origem_titulo := p.titulo;
      new.origem_dados := jsonb_build_object('fonte', 'referral', 'caminho', p.caminho, 'canal', p.canal,
                                             'campanha_externa_id', campanha, 'referral', p.referral);
      new.origem_capturada_em := now();
      return new;
    end if;
  end if;

  if public.lexia_origem_forca(new.origem_tipo, new.origem_source_id) < 2 then
    select m.conteudo into primeira from public.lexia_mensagens m
    where m.cliente_slug = new.cliente_slug
      and m.identificador_conversa = new.identificador_conversa
      and m.direccao = 'recebida'
    order by m.criado_em, m.id
    limit 1;
    if primeira is not null then
      select * into fr from public.lexia_frase_de_anuncio(new.cliente_slug, primeira);
      if found then
        new.origem_tipo := 'anuncio';
        new.origem_source_id := null;
        new.origem_titulo := null;
        new.origem_dados := jsonb_build_object('fonte', 'frase_pronta', 'frase', fr.frase,
                                               'campanha_externa_id', fr.campanha_externa_id);
        new.origem_capturada_em := now();
      end if;
    end if;
  end if;
  return new;
exception when others then
  raise warning 'lexia_contactos_origem: % (%)', sqlerrm, new.identificador_conversa;
  return new;
end;
$$;

drop trigger if exists lexia_contactos_origem_trg on public.lexia_contactos;
create trigger lexia_contactos_origem_trg
  before insert or update on public.lexia_contactos
  for each row execute function public.lexia_contactos_origem();

-- ---------------------------------------------------------------------------
-- 3. Primeira mensagem do cliente gravada → frase pronta? (a ficha costuma já
--    existir: o Detail cria-a antes de gravar a mensagem.)
-- ---------------------------------------------------------------------------
create or replace function public.lexia_mensagens_origem()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fr record;
begin
  if new.identificador_conversa is null or new.identificador_conversa like 'teste:%' then
    return null;
  end if;
  if exists (
    select 1 from public.lexia_mensagens m
    where m.cliente_slug = new.cliente_slug
      and m.identificador_conversa = new.identificador_conversa
      and m.direccao = 'recebida'
      and m.id <> new.id
      and (m.criado_em < new.criado_em or (m.criado_em = new.criado_em and m.id < new.id))
  ) then
    return null;
  end if;

  select * into fr from public.lexia_frase_de_anuncio(new.cliente_slug, new.conteudo);
  if not found then
    return null;
  end if;

  update public.lexia_contactos c
    set origem_tipo = 'anuncio',
        origem_source_id = null,
        origem_titulo = null,
        origem_dados = jsonb_build_object('fonte', 'frase_pronta', 'frase', fr.frase,
                                          'campanha_externa_id', fr.campanha_externa_id),
        origem_capturada_em = now()
  where c.cliente_slug = new.cliente_slug
    and c.identificador_conversa = new.identificador_conversa
    and public.lexia_origem_forca(c.origem_tipo, c.origem_source_id) < 2;
  return null;
exception when others then
  raise warning 'lexia_mensagens_origem: % (%)', sqlerrm, new.identificador_conversa;
  return null;
end;
$$;

drop trigger if exists lexia_mensagens_origem_trg on public.lexia_mensagens;
create trigger lexia_mensagens_origem_trg
  after insert on public.lexia_mensagens
  for each row
  when (new.direccao = 'recebida')
  execute function public.lexia_mensagens_origem();

revoke all on function public.lexia_webhooks_meta_origem() from public, anon, authenticated;
revoke all on function public.lexia_contactos_origem() from public, anon, authenticated;
revoke all on function public.lexia_mensagens_origem() from public, anon, authenticated;

commit;

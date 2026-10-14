-- Fase 1, correccao: acrescenta 'instagram_post' ao vocabulario de origem_tipo.
--
-- Porque existe: a 202610130001 assumiu que uma conversa originada em anuncio
-- Meta chega sempre com o bloco "referral" (ad_id + ads_context_data). Isso
-- confirmou-se no Click-to-WhatsApp, mas NAO no Instagram click-to-DM.
--
-- Payload real recebido em 2026-10-14 pelo webhook meta-mirandaskin-omni, de um
-- lead que veio de anuncio:
--
--   message.attachments[0].type    = 'ig_post'
--   message.attachments[0].payload = { ig_post_media_id, title, url }
--
-- Nao havia uma unica ocorrencia de "referral", "ad_id" ou "ads_context" no
-- JSON inteiro. Nenhuma expressao consegue extrair um ad_id que a Meta nao
-- enviou, e o lead era gravado como 'organico'.
--
-- O que se recupera: o ig_post_media_id identifica o POST, nao o anuncio. Para
-- anuncios feitos a partir de uma publicacao existente (ou posts impulsionados)
-- esse id mapeia-se a mao no Gestor de Anuncios. E atribuicao de fidelidade
-- menor, mas verdadeira -- e por isso merece um valor proprio em vez de ser
-- marcada como 'instagram_ad', que afirmaria uma origem paga que nao esta
-- provada: o mesmo post pode ter tido alcance organico.
--
-- Esta migration e aditiva: alarga o vocabulario, nao restringe nada. Nenhuma
-- linha existente deixa de ser valida. NOT VALID mantem-se para nao varrer a
-- tabela inteira, coerente com a 202610130001.

begin;

do $$
begin
  if to_regclass('public.lexia_contactos') is null then
    raise exception
      'lexia_contactos nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

alter table public.lexia_contactos
  drop constraint if exists lexia_contactos_origem_tipo_check;

alter table public.lexia_contactos
  add constraint lexia_contactos_origem_tipo_check
  check (
    origem_tipo is null or origem_tipo in (
      'ctwa',            -- clique em anuncio -> WhatsApp
      'instagram_ad',    -- clique em anuncio -> Instagram Direct (com referral)
      'messenger_ad',    -- clique em anuncio -> Messenger
      'meta_ad',         -- anuncio Meta sem app de origem identificado
      'instagram_post',  -- cartao ig_post: identifica o post, nao o anuncio
      'organico',        -- nenhum anuncio identificado (NAO prova origem organica)
      'indicacao',
      'desconhecido'
    )
  ) not valid;

comment on column public.lexia_contactos.origem_tipo is
  'Vocabulario fechado. Atencao: ''organico'' significa "nenhum anuncio identificado", '
  'nao "nao veio de anuncio" -- a Meta nao garante o bloco referral. Logo o CAC por '
  'campanha calculado a partir desta coluna e um limite INFERIOR, nunca um numero exacto. '
  '''instagram_post'' identifica a publicacao (ig_post_media_id), nao o anuncio.';

commit;

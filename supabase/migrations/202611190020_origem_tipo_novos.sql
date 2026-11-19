-- Atribuição padrão (19/11): aceitar os dois tipos novos de origem nas fichas.
alter table public.lexia_contactos drop constraint if exists lexia_contactos_origem_tipo_check;
alter table public.lexia_contactos add constraint lexia_contactos_origem_tipo_check
  check (origem_tipo is null or origem_tipo in ('organico', 'ctwa', 'instagram_ad', 'instagram_post', 'messenger_ad', 'anuncio'));

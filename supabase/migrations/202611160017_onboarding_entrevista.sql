-- Onboarding com entrevistadora (16/11/2026).
--
-- O QUE É
-- O onboarding novo de um cliente, dentro do painel, em 3 etapas: informações
-- gerais (a Lexia preenche), conversa com a entrevistadora (chat com áudio e
-- arquivos) e revisão. Substitui o formulário longo (forms.speedymediaus.com).
--
-- A REGRA QUE MANDA NESTE DESENHO: NUNCA PERDER DADOS
--  * lexia_onboarding_mensagens: cada mensagem é gravada no instante do envio,
--    antes de a IA a processar (`processada_em` nulo = ainda por processar).
--  * lexia_onboarding_campos é um DIÁRIO: só se acrescentam linhas. O valor
--    actual de um campo é a linha mais recente (view ..._campos_atual). Nada é
--    sobrescrito; dá para voltar atrás e ver quem disse o quê.
--  * lexia_onboarding_arquivos guarda o caminho do ORIGINAL (áudio, foto, PDF)
--    no bucket privado `onboarding`, além da transcrição ou descrição.
--
-- PORQUE FECHADA
-- RLS ligado, nenhuma policy, grants só para a service_role: o painel lê e
-- escreve pelo servidor, que confere a empresa da sessão.
--
-- Esta migration é aditiva: cria tabelas, uma view e um bucket; não toca em
-- nada existente. A tabela antiga lexia_onboarding_respostas fica como está.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

-- Um onboarding por cliente.
create table if not exists public.lexia_onboardings (
  id uuid primary key default extensions.gen_random_uuid(),
  cliente_slug text not null unique references public.lexia_clientes(slug)
    on update cascade on delete restrict,
  -- etapa1 → preparando (a IA lê as fontes) → conversa → revisao → aprovado
  estado text not null default 'etapa1'
    check (estado in ('etapa1', 'preparando', 'conversa', 'revisao', 'aprovado')),
  -- O que a Lexia preencheu na Etapa 1 (links, idiomas, tipo de negócio, notas).
  etapa1 jsonb not null default '{}'::jsonb,
  -- O que a leitura das fontes encontrou (resumo por fonte, para a tela).
  achados jsonb not null default '{}'::jsonb,
  -- Onde a conversa está (bloco, item, campo em pergunta): para retomar no mesmo ponto.
  cursor jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  aprovado_por uuid
);

-- Itens que se repetem: cada serviço, profissional, pergunta frequente, objeção, promoção.
create table if not exists public.lexia_onboarding_itens (
  id uuid primary key default extensions.gen_random_uuid(),
  onboarding_id uuid not null references public.lexia_onboardings(id) on delete cascade,
  cliente_slug text not null,
  grupo text not null check (grupo in ('servicos', 'profissionais', 'faqs', 'objecoes', 'promocoes')),
  ordem integer not null default 0,
  -- removido_em preenchido = o item saiu (nunca se apaga a linha).
  removido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists lexia_onboarding_itens_onb_idx on public.lexia_onboarding_itens (onboarding_id, grupo, ordem);

-- Arquivos: o original fica no bucket `onboarding`; aqui o que se sabe dele.
create table if not exists public.lexia_onboarding_arquivos (
  id uuid primary key default extensions.gen_random_uuid(),
  onboarding_id uuid not null references public.lexia_onboardings(id) on delete cascade,
  cliente_slug text not null,
  origem text not null check (origem in ('etapa1', 'conversa')),
  caminho text not null,
  nome text,
  mime text,
  tamanho bigint,
  duracao_s numeric,
  -- Áudio: a transcrição. Imagem/PDF: o que a IA leu nele.
  texto text,
  texto_em timestamptz,
  enviado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists lexia_onboarding_arquivos_onb_idx on public.lexia_onboarding_arquivos (onboarding_id, criado_em);

-- A conversa. Só se acrescenta.
create table if not exists public.lexia_onboarding_mensagens (
  id uuid primary key default extensions.gen_random_uuid(),
  onboarding_id uuid not null references public.lexia_onboardings(id) on delete cascade,
  cliente_slug text not null,
  autor text not null check (autor in ('cliente', 'entrevistadora', 'sistema', 'lexia')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'arquivo', 'cartao')),
  conteudo text not null default '',
  arquivo_id uuid references public.lexia_onboarding_arquivos(id) on delete set null,
  -- Cartões, respostas rápidas, o campo a que a pergunta se refere, "o que entendi".
  dados jsonb not null default '{}'::jsonb,
  -- Identificador gerado no aparelho: reenviar a mesma mensagem não a duplica.
  id_do_aparelho text,
  -- Mensagem do cliente ainda não lida pela IA = processada_em nulo.
  processada_em timestamptz,
  enviado_por uuid,
  criado_em timestamptz not null default now(),
  constraint lexia_onboarding_mensagens_aparelho_key unique (onboarding_id, id_do_aparelho)
);
create index if not exists lexia_onboarding_mensagens_onb_idx on public.lexia_onboarding_mensagens (onboarding_id, criado_em);

-- O caderno de respostas: um DIÁRIO de cada campo. Só se acrescenta.
create table if not exists public.lexia_onboarding_campos (
  id uuid primary key default extensions.gen_random_uuid(),
  onboarding_id uuid not null references public.lexia_onboardings(id) on delete cascade,
  cliente_slug text not null,
  -- A chave do campo no esquema (ex.: 'emojis', 'politica_de_cancelamento', 'valor').
  campo text not null check (campo ~ '^[a-z][a-z0-9_]{1,60}$'),
  -- Preenchido quando o campo é de um item que se repete (um serviço, uma FAQ…).
  item_id uuid references public.lexia_onboarding_itens(id) on delete cascade,
  valor jsonb,
  -- rascunho: a IA achou numa fonte · confirmado: a cliente confirmou o rascunho ·
  -- respondido: a cliente respondeu · nao_se_aplica · vago: respondeu sem dar para usar ·
  -- pulado: a cliente deixou para depois
  estado text not null check (estado in ('rascunho', 'confirmado', 'respondido', 'nao_se_aplica', 'vago', 'pulado')),
  fonte text not null check (fonte in ('site', 'instagram', 'google', 'arquivo', 'lexia', 'cliente', 'recomendacao')),
  -- De onde veio: a mensagem, o arquivo, o trecho, o endereço.
  evidencia jsonb not null default '{}'::jsonb,
  -- Quantas vezes este campo já foi perguntado (teto: 1 pergunta + 1 complemento).
  perguntas integer not null default 0,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists lexia_onboarding_campos_atual_idx on public.lexia_onboarding_campos (onboarding_id, campo, item_id, criado_em desc);

-- O valor actual de cada campo = a linha mais recente do diário.
create or replace view public.lexia_onboarding_campos_atual
with (security_invoker = true) as
select distinct on (onboarding_id, campo, item_id) *
from public.lexia_onboarding_campos
order by onboarding_id, campo, item_id, criado_em desc, id desc;

alter table public.lexia_onboardings enable row level security;
alter table public.lexia_onboarding_itens enable row level security;
alter table public.lexia_onboarding_arquivos enable row level security;
alter table public.lexia_onboarding_mensagens enable row level security;
alter table public.lexia_onboarding_campos enable row level security;

revoke all on public.lexia_onboardings, public.lexia_onboarding_itens, public.lexia_onboarding_arquivos,
  public.lexia_onboarding_mensagens, public.lexia_onboarding_campos, public.lexia_onboarding_campos_atual
  from anon, authenticated;
grant select, insert, update, delete on public.lexia_onboardings, public.lexia_onboarding_itens,
  public.lexia_onboarding_arquivos, public.lexia_onboarding_mensagens, public.lexia_onboarding_campos to service_role;
grant select on public.lexia_onboarding_campos_atual to service_role;

-- Bucket privado para áudios, fotos e PDFs do onboarding (50 MB por arquivo).
insert into storage.buckets (id, name, public, file_size_limit)
values ('onboarding', 'onboarding', false, 52428800)
on conflict (id) do nothing;

commit;

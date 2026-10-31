-- Fase 20: mídia das conversas guardada no Supabase Storage (bucket privado).
--
-- O PROBLEMA QUE RESOLVE
-- Quando o cliente manda áudio, imagem, vídeo ou PDF, a conversa no painel
-- não mostra o arquivo. A Carol do n8n grava só o texto que a IA tirou dele
-- (transcrição/descrição); o Detail grava o link do WhatsApp, que expira. O
-- agente em código passa a guardar o arquivo aqui e a gravar em
-- lexia_mensagens.conteudo uma linha de JSON com o caminho e o texto (formato
-- em lib/conversations/message-display.ts, parseMidiaGuardada).
--
-- PORQUE PRIVADO E SEM POLICIES
-- São fotos de pele, áudios e documentos de clientes. O bucket não é público
-- e não tem policies em storage.objects: nem o `anon` nem o `authenticated`
-- leem um arquivo. Só a service_role (o servidor do painel e o agente) lê e
-- escreve. O painel mostra a mídia com uma URL ASSINADA de 1 hora, gerada no
-- servidor e só para caminhos que começam pelo slug do cliente da página.
--
-- Limite de 25 MB por arquivo (o WhatsApp manda vídeos até 16 MB; documentos
-- até 100 MB, mas um PDF de cliente maior que 25 MB é raro e não justifica).
--
-- Esta migration é aditiva: cria um bucket e não toca em nada existente.

begin;

do $$
begin
  if to_regclass('public.lexia_clientes') is null then
    raise exception
      'lexia_clientes nao existe nesta base. Esta migration pertence ao Supabase CENTRAL da Lexia, nao ao projecto de um cliente.';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lexia-midia',
  'lexia-midia',
  false,
  26214400,
  array[
    'audio/*',
    'image/*',
    'video/*',
    'application/pdf',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = false;

commit;

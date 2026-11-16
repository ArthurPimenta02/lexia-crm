import { randomUUID } from "node:crypto";

import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { abrirOnboarding, BUCKET_ONBOARDING, pastaDoCliente, registarArquivo, TAMANHO_MAXIMO_ARQUIVO } from "@/lib/onboarding/dados";

export const dynamic = "force-dynamic";

/** Na conversa entram também os áudios gravados na tela. O teto do áudio é o que o transcritor aceita de uma vez. */
const AUDIO: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav", "audio/x-m4a": "m4a" };
const TETO_DO_AUDIO = 14 * 1024 * 1024;

const EXTENSAO: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "text/plain": "txt", "text/csv": "csv" };

/**
 * Arquivos do onboarding (Etapa 1 e conversa), sempre na pasta da empresa da sessão (ou da escolhida pela equipe da Lexia). Dois passos, porque a Vercel não
 * aceita corpos grandes: `preparar` devolve um endereço assinado para o
 * navegador subir direto ao bucket privado; `registar` grava a linha depois
 * de o arquivo lá estar. O caminho é decidido aqui, na pasta do cliente.
 */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const acesso = await acessoAoOnboarding(corpo.cliente);
  if (!acesso) return Response.json({ erro: "Acesso não autorizado." }, { status: 403 });
  const { admin, clienteSlug: slug } = acesso;

  const mime = String(corpo.mime ?? "").toLowerCase().split(";")[0];
  const tamanho = Number(corpo.tamanho ?? 0);
  const nome = String(corpo.nome ?? "arquivo").slice(0, 200);
  const origem = corpo.origem === "conversa" ? "conversa" : "etapa1";
  const extensao = EXTENSAO[mime] ?? (origem === "conversa" ? AUDIO[mime] : undefined);
  if (!extensao) return Response.json({ erro: origem === "conversa" ? "Aqui entram áudios, PDF, imagens (PNG, JPG, WEBP) e texto." : "Nesta etapa entram PDF, imagens (PNG, JPG, WEBP) e texto." }, { status: 400 });
  if (!(tamanho > 0) || tamanho > TAMANHO_MAXIMO_ARQUIVO) return Response.json({ erro: "O arquivo passa de 50 MB." }, { status: 400 });
  if (AUDIO[mime] && tamanho > TETO_DO_AUDIO) return Response.json({ erro: "O áudio ficou comprido demais. Grave em partes de até 10 minutos." }, { status: 400 });

  if (corpo.passo === "preparar") {
    const caminho = `${pastaDoCliente(slug)}${origem}/${randomUUID()}.${extensao}`;
    const { data, error } = await admin.storage.from(BUCKET_ONBOARDING).createSignedUploadUrl(caminho);
    if (error || !data) return Response.json({ erro: "Não foi possível preparar o envio do arquivo." }, { status: 500 });
    return Response.json({ caminho, token: data.token });
  }
  if (corpo.passo === "registar") {
    const caminho = String(corpo.caminho ?? "");
    if (!caminho.startsWith(`${pastaDoCliente(slug)}${origem}/`) || caminho.includes("..")) return Response.json({ erro: "Arquivo inválido." }, { status: 400 });
    // Só se regista o que chegou mesmo ao bucket.
    const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
    const { data: lista } = await admin.storage.from(BUCKET_ONBOARDING).list(pasta, { search: caminho.slice(pasta.length + 1) });
    if (!lista?.length) return Response.json({ erro: "O arquivo não chegou. Tente enviar de novo." }, { status: 400 });
    const onb = await abrirOnboarding(admin, slug);
    const id = await registarArquivo(admin, slug, onb.id, { origem, caminho, nome, mime, tamanho, enviadoPor: acesso.userId });
    return Response.json({ id });
  }
  return Response.json({ erro: "Pedido inválido." }, { status: 400 });
}

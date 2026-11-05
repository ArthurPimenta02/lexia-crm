/**
 * Caminho da mídia enviada pelo app no bucket privado `lexia-midia`.
 * Mesmo saneamento do agente (lexia-agente src/midia_storage.ts parteSegura)
 * e do serviço de envio da VPS: `<slug>/<conversa-saneada>/<ficheiro>`.
 * O painel só assina caminhos que começam pelo slug do cliente.
 */
export function parteSegura(valor: string) {
  return String(valor).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 120);
}

const EXTENSOES: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/aac": "m4a",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function extensaoDe(mime: string) {
  return EXTENSOES[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
}

export function tipoDaMidia(mime: string): "imagem" | "audio" | "video" | "documento" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "documento";
}

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

export function caminhoDoOriginal(clienteSlug: string, conversa: string, mime: string, id: string) {
  return `${clienteSlug}/${parteSegura(conversa)}/original-${parteSegura(id)}.${extensaoDe(mime)}`;
}

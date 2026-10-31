import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cofre das chaves das conexões (Fase 19).
 *
 * As chaves de WhatsApp, Meta, Redis e bases dos clientes ficam na tabela
 * `lexia_conexoes` CIFRADAS com AES-256-GCM. A chave de cifra vive fora da
 * base, na variável `LEXIA_CONEXOES_CHAVE` (32 bytes em base64), igual na
 * Vercel e na VPS do agente. Quem lê só a base — um backup, um export, alguém
 * com acesso ao painel do Supabase — vê texto cifrado e nada mais.
 *
 * O GCM também autentica: se alguém alterar um byte do texto cifrado, a
 * leitura falha em vez de devolver lixo que o agente usaria como token.
 *
 * Formato: `v1.<iv>.<tag>.<dados>`, cada parte em base64url. O `v1` deixa
 * trocar o algoritmo um dia sem ambiguidade sobre o que está gravado.
 */

const VERSAO = "v1";

function chaveDeCifra(chave = process.env.LEXIA_CONEXOES_CHAVE) {
  if (!chave?.trim()) {
    throw new Error(
      "LEXIA_CONEXOES_CHAVE não configurada: as conexões não podem ser lidas nem gravadas.",
    );
  }
  const bytes = Buffer.from(chave.trim(), "base64");
  if (bytes.length !== 32) {
    throw new Error("LEXIA_CONEXOES_CHAVE tem de ter 32 bytes em base64.");
  }
  return bytes;
}

export function cifrar(segredos: Record<string, string>, chave?: string) {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDeCifra(chave), iv);
  const dados = Buffer.concat([
    cifra.update(JSON.stringify(segredos), "utf8"),
    cifra.final(),
  ]);
  return [VERSAO, iv, cifra.getAuthTag(), dados]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decifrar(texto: string, chave?: string): Record<string, string> {
  const [versao, iv, tag, dados] = texto.split(".");
  if (versao !== VERSAO || !iv || !tag || !dados) {
    throw new Error("Segredo gravado num formato desconhecido.");
  }
  const decifra = createDecipheriv(
    "aes-256-gcm",
    chaveDeCifra(chave),
    Buffer.from(iv, "base64url"),
  );
  decifra.setAuthTag(Buffer.from(tag, "base64url"));
  const claro = Buffer.concat([
    decifra.update(Buffer.from(dados, "base64url")),
    decifra.final(),
  ]).toString("utf8");
  return JSON.parse(claro) as Record<string, string>;
}

/** Os últimos 4 caracteres, para a tela mostrar "termina em …a1b2" sem revelar a chave. */
export function finalDe(valor: string) {
  const limpo = valor.trim();
  return limpo.length <= 8 ? "…" : `…${limpo.slice(-4)}`;
}

/**
 * Transcrição dos áudios da conversa. O Claude não ouve áudio: quem transcreve
 * é o Gemini, com a chave da Lexia (conexão global "ia"). Só corre no servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decifrar } from "@/lib/conexoes/cifra";

const MODELO = "gemini-2.5-flash";

export async function chaveDoGemini(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from("lexia_conexoes").select("segredos").is("cliente_slug", null).eq("tipo", "ia").maybeSingle();
  const segredos = (data as { segredos: string | null } | null)?.segredos;
  return segredos ? (decifrar(segredos).gemini_api_key ?? null) : null;
}

const PEDIDO = `Transcreva este áudio palavra por palavra, no idioma em que foi falado (quase sempre português do Brasil, com nomes de serviços em inglês).
Não resuma, não corrija, não traduza e não acrescente nada. Escreva números e preços como foram ditos. Se houver um trecho que não dá para entender, escreva [inaudível].
Responda só com a transcrição.`;

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const FRASES_DO_PEDIDO = PEDIDO.split(/(?<=[.:])\s+|\n+/).map(normal).filter((f) => f.length > 8);

/**
 * Tira do início da transcrição o eco do PEDIDO. O Gemini às vezes devolve primeiro uma frase do pedido
 * ("Transcreva este áudio palavra por palavra.") e só depois o que foi dito — caso K-Glow, 24/11: o eco
 * ficou gravado como resposta da Kelly na variação de preço do Botox.
 */
export function semEcoDoPedido(texto: string): string {
  let resto = texto.trim();
  for (let i = 0; i < 4; i++) {
    const m = resto.match(/^[^\n.!?]*[.!?:]?\s*/);
    const frase = normal(m?.[0] ?? "");
    if (!frase || !FRASES_DO_PEDIDO.some((f) => f.startsWith(frase) || frase.startsWith(f.slice(0, Math.max(20, Math.floor(f.length * 0.8)))))) break;
    resto = resto.slice(m![0].length).trim();
  }
  return resto || texto.trim();
}

/** Transcreve um áudio (webm, mp4, ogg, mp3…). Repete até 3 vezes se o serviço falhar. */
export async function transcrever(chave: string, bytes: Buffer, mime: string): Promise<string> {
  const corpo = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: mime.split(";")[0], data: bytes.toString("base64") } }, { text: PEDIDO }] }],
    generationConfig: { temperature: 0 },
  });
  let ultimo = "o áudio não pôde ser transcrito";
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "content-type": "application/json" },
        body: corpo,
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
      if (r.ok) {
        const texto = semEcoDoPedido((j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim());
        if (texto) return texto;
        ultimo = "a transcrição veio vazia";
      } else {
        ultimo = j.error?.message ?? `HTTP ${r.status}`;
        if (r.status !== 429 && r.status < 500) break;
      }
    } catch (e) {
      ultimo = e instanceof Error ? e.message : ultimo;
    }
    await new Promise((ok) => setTimeout(ok, 1500 * t));
  }
  throw new Error(ultimo);
}

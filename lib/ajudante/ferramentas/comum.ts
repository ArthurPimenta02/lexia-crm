import "server-only";

import { textoLegivelDaMensagem } from "@/lib/conversations/message-display";
import { chaveDoDia } from "@/lib/movel/formato";
import { somarDias } from "@/lib/movel/hoje";
import { ErroDeIa, type ChaveDeIa } from "@/lib/onboarding/ia";

import type { Escopo } from "../ferramentas";

/**
 * Peças comuns às ferramentas de leitura do Analista (procurar nas conversas,
 * ler várias conversas, relatório). Mesmo formato das de `ferramentas.ts`;
 * ver `leitura.LEIA.md` para as registar.
 *
 * REGRA DE OURO (igual): a empresa vem SEMPRE do `Escopo` montado no servidor.
 */

export type SaidaLeitura = { dados: unknown };

export type DefinicaoLeitura = {
  descricao: string;
  executar: (escopo: Escopo, args: Record<string, unknown>) => Promise<SaidaLeitura>;
  parametros: Record<string, unknown>;
  rotulo: string;
};

export const objeto = (props: Record<string, unknown>, obrigatorios: string[] = []) => ({
  additionalProperties: false,
  properties: props,
  required: obrigatorios,
  type: "object",
});

export const DATA = { description: "Data AAAA-MM-DD no fuso da empresa", type: "string" };

export const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const diaOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Período pedido pelo modelo, limpo: datas válidas, no máximo `maxDias`, nunca invertido nem depois de hoje. */
export function periodoAte(args: Record<string, unknown>, hoje: string, padrao: number, maxDias: number) {
  let de = diaOk(args.de) ? args.de : somarDias(hoje, -(padrao - 1));
  let ate = diaOk(args.ate) ? args.ate : hoje;
  if (de > ate) [de, ate] = [ate, de];
  if (ate > hoje) ate = hoje;
  if (de > ate) de = ate;
  const minimo = somarDias(ate, -(maxDias - 1));
  if (de < minimo) de = minimo;
  return { ate, de };
}

export const hojeNoFuso = (e: Escopo, agora = new Date()) => chaveDoDia(agora, e.fuso);

/** Minúsculas, sem acentos, pontuação vira espaço. "Olá! Gostaria…" → "ola gostaria". */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Padrão ILIKE largo para a base: palavras ligadas por `%`, e as letras que
 * podem ter acento (vogais e c/ç) trocadas por `_` (um carácter qualquer).
 * Assim "ola" encontra "Olá" e vice-versa. É um pré-filtro: a confirmação
 * exata faz-se em código com `normalizar`.
 */
export function padraoLargo(termoNormalizado: string) {
  const palavras = termoNormalizado.split(" ").filter(Boolean);
  const largo = palavras.map((p) => [...p].map((c) => (/[a-z0-9]/.test(c) && !/[aeiouc]/.test(c) ? c : "_")).join(""));
  return `%${largo.join("%")}%`;
}

/** O texto que se lê numa mensagem (a mídia guardada traz o texto dentro de JSON). */
export function textoDaMensagem(conteudo: string | null | undefined) {
  return (textoLegivelDaMensagem(conteudo) ?? "").replace(/\s+/g, " ").trim();
}

export function quemEscreveu(direccao: string | null | undefined, origem: string | null | undefined): "cliente" | "agente" | "equipe" {
  if (direccao !== "enviada") return "cliente";
  return origem === "humano" ? "equipe" : "agente";
}

export function canalDaConversa(conversa: string): "whatsapp" | "instagram" | "messenger" {
  const c = conversa.split(":")[0];
  return c === "instagram" || c === "messenger" ? c : "whatsapp";
}

export const telefoneDaConversa = (conversa: string) => /^whatsapp:(\d{6,})$/.exec(conversa)?.[1] ?? null;

/** Corre `fn` sobre os itens com no máximo `n` ao mesmo tempo; a ordem do resultado é a dos itens. */
export async function emParalelo<T, R>(itens: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return saida;
}

// --- IA barata -----------------------------------------------------------------

/** Modelo barato para ler muitas conversas (Haiku 4.5: 1 US$ entrada / 5 US$ saída por milhão). */
export const MODELO_BARATO = "claude-haiku-4-5";
export const PRECO_BARATO = { entrada: 1, saida: 5 };
export const custoBarato = (entrada: number, saida: number) => (entrada * PRECO_BARATO.entrada + saida * PRECO_BARATO.saida) / 1e6;
/** Estimativa conservadora de tokens a partir de caracteres (português gasta ~1 token a cada 3-4 caracteres). */
export const tokensDe = (caracteres: number) => Math.ceil(caracteres / 3);

/**
 * Uma pergunta ao modelo barato, com a chave do PRÓPRIO cliente (quem chama
 * passa a `ChaveDeIa` que veio de `chaveDoCliente`). Resposta em JSON no
 * formato `esquema`. Repete uma vez quando a falha é do serviço.
 */
export async function perguntarBarato(
  ia: ChaveDeIa,
  pedido: { sistema: string; texto: string; esquema: Record<string, unknown>; maxTokens: number; timeoutMs?: number },
): Promise<{ json: unknown; entrada: number; saida: number }> {
  const corpo = {
    max_tokens: pedido.maxTokens,
    messages: [{ content: pedido.texto, role: "user" }],
    model: MODELO_BARATO,
    output_config: { format: { schema: pedido.esquema, type: "json_schema" } },
    system: pedido.sistema,
  };
  let ultimo: unknown = null;
  for (let t = 1; t <= 2; t++) {
    let r: Response;
    try {
      r = await fetch(`${ia.base}/v1/messages`, {
        body: JSON.stringify(corpo),
        headers: { "anthropic-version": "2023-06-01", "content-type": "application/json", "x-api-key": ia.chave },
        method: "POST",
        signal: AbortSignal.timeout(pedido.timeoutMs ?? 25_000),
      });
    } catch (e) {
      ultimo = new ErroDeIa(e instanceof Error ? e.message : "rede", 0);
      continue;
    }
    const j = (await r.json().catch(() => ({}))) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
      error?: { message?: string };
    };
    if (!r.ok) {
      const erro = new ErroDeIa(`HTTP ${r.status}: ${j.error?.message ?? ""}`.trim(), r.status);
      if (r.status !== 429 && r.status < 500) throw erro;
      ultimo = erro;
      if (t < 2) await new Promise((ok) => setTimeout(ok, 800));
      continue;
    }
    const u = j.usage ?? {};
    const entrada = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const saida = u.output_tokens ?? 0;
    if (j.stop_reason === "refusal") throw new ErroDeIa("recusado", 200);
    const bruto = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    let json: unknown = null;
    try {
      json = JSON.parse(bruto);
    } catch {
      const m = /\{[\s\S]*\}/.exec(bruto);
      try {
        json = m ? JSON.parse(m[0]) : null;
      } catch {
        json = null;
      }
    }
    return { entrada, json, saida };
  }
  throw ultimo instanceof Error ? ultimo : new ErroDeIa("a IA não respondeu", 0);
}

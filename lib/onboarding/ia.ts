/**
 * A IA do onboarding: o Claude, com a chave do PRÓPRIO cliente (conexão "ia"
 * em /admin/conexoes), pelo mesmo endereço de cache da Cloudflare que os
 * agentes usam. Só corre no servidor.
 *
 * Chamada HTTP direta à Messages API: o painel não tem o SDK da Anthropic
 * instalado e este é o único sítio que fala com ela.
 *
 * A resposta vem sempre no formato pedido (`output_config.format` com um
 * esquema JSON): não há "resposta ilegível" para tratar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decifrar } from "@/lib/conexoes/cifra";

export const MODELO_ONBOARDING = "claude-sonnet-5";

export type ChaveDeIa = { chave: string; base: string };

/** A chave Anthropic do cliente. Sem ela o onboarding não lê fontes nem entrevista. */
export async function chaveDoCliente(admin: SupabaseClient, clienteSlug: string): Promise<ChaveDeIa | null> {
  const { data, error } = await admin
    .from("lexia_conexoes")
    .select("campos, segredos")
    .eq("cliente_slug", clienteSlug)
    .eq("tipo", "ia")
    .maybeSingle();
  if (error || !data) return null;
  const linha = data as { campos: Record<string, string> | null; segredos: string | null };
  if (!linha.segredos) return null;
  const chave = decifrar(linha.segredos).anthropic_api_key;
  if (!chave) return null;
  return { chave, base: (linha.campos?.anthropic_base_url || "https://api.anthropic.com").replace(/\/+$/, "") };
}

export type Bloco =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export type PedidoIa = {
  sistema: string;
  conteudo: Bloco[];
  /** Esquema JSON da resposta. Com ele, `texto` é sempre JSON válido nesse formato. */
  esquema?: Record<string, unknown>;
  maxTokens?: number;
};

export type Uso = { entrada: number; saida: number; cache: number; escrita: number };

export class ErroDeIa extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

const TENTATIVAS = 3;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uma pergunta ao Claude. Repete até 3 vezes quando a falha é do serviço (429, 5xx, rede). */
export async function perguntar(ia: ChaveDeIa, pedido: PedidoIa): Promise<{ texto: string; uso: Uso }> {
  const corpo = {
    model: MODELO_ONBOARDING,
    max_tokens: pedido.maxTokens ?? 8000,
    system: [{ type: "text", text: pedido.sistema, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: pedido.conteudo }],
    ...(pedido.esquema ? { output_config: { format: { type: "json_schema", schema: pedido.esquema } } } : {}),
  };
  let ultimo: unknown = null;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const r = await fetch(`${ia.base}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": ia.chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(240_000),
      });
      const j = (await r.json().catch(() => ({}))) as {
        content?: { type: string; text?: string }[];
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        error?: { message?: string };
      };
      if (!r.ok) {
        const erro = new ErroDeIa(j.error?.message ?? `HTTP ${r.status}`, r.status);
        if (r.status === 429 || r.status >= 500) {
          ultimo = erro;
          await espera(1500 * t);
          continue;
        }
        throw erro;
      }
      if (j.stop_reason === "refusal") throw new ErroDeIa("a IA recusou este pedido", 200);
      const texto = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      if (j.stop_reason === "max_tokens") throw new ErroDeIa("a resposta ficou cortada (limite de tamanho)", 200);
      const u = j.usage ?? {};
      return { texto, uso: { entrada: u.input_tokens ?? 0, saida: u.output_tokens ?? 0, cache: u.cache_read_input_tokens ?? 0, escrita: u.cache_creation_input_tokens ?? 0 } };
    } catch (e) {
      if (e instanceof ErroDeIa && e.status !== 429 && e.status < 500) throw e;
      ultimo = e;
      await espera(1500 * t);
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("a IA não respondeu");
}

/** Custo em dólares de uma chamada (Sonnet 5: 2 / 10 por milhão; cache lido 0,2; escrito 2,5). */
export const custoUsd = (u: Uso) => (u.entrada * 2 + u.saida * 10 + u.cache * 0.2 + u.escrita * 2.5) / 1e6;

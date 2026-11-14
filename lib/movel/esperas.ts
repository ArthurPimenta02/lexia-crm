import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { esperasDe, JANELA_ESPERA_MS, type Espera, type MensagemCurta } from "./esperas-regra";

export { esperasDe, resolvidasDesde, type Espera, type MensagemCurta } from "./esperas-regra";

/**
 * A LISTA das conversas à espera de uma pessoa — uma regra só para o número
 * da aba Conversas, o chip "Esperando", o "Para fazer agora" do Hoje, a rota
 * /api/m/contagem e o número no ícone do iPhone (Arthur, 14/11: o ícone
 * mostrava um número que ele não encontrava em lado nenhum).
 *
 * Leve de propósito, porque corre a cada 30 s com o app aberto: lê só as
 * mensagens "recebida_na_pausa" das últimas 48 h e, dessas conversas, só as
 * enviadas no mesmo intervalo. A regra em si (pura, testada) está em
 * `esperas-regra.ts`.
 */
export async function lerMensagensDaEspera(clienteSlug: string, agora = new Date()) {
  const base = createAdminClient();
  const desde = new Date(agora.getTime() - JANELA_ESPERA_MS).toISOString();
  const { data: naPausa, error } = await base
    .from("lexia_mensagens")
    .select("identificador_conversa, criado_em")
    .eq("cliente_slug", clienteSlug)
    .eq("origem", "recebida_na_pausa")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: true })
    .limit(1000);
  if (error) throw new Error("Não foi possível ler as esperas.");
  const conversas = [...new Set((naPausa ?? []).map((m) => m.identificador_conversa as string))].filter((c) => !c.startsWith("teste:"));
  if (!conversas.length) return { enviadas: [] as MensagemCurta[], naPausa: (naPausa ?? []) as MensagemCurta[] };

  const enviadas: MensagemCurta[] = [];
  for (let i = 0; i < conversas.length; i += 200) {
    const { data } = await base
      .from("lexia_mensagens")
      .select("identificador_conversa, criado_em")
      .eq("cliente_slug", clienteSlug)
      .eq("direccao", "enviada")
      .gte("criado_em", desde)
      .in("identificador_conversa", conversas.slice(i, i + 200))
      .order("criado_em", { ascending: false })
      .limit(2000);
    enviadas.push(...((data ?? []) as MensagemCurta[]));
  }
  return { enviadas, naPausa: (naPausa ?? []) as MensagemCurta[] };
}

/** As conversas desta empresa à espera de uma pessoa (a mais antiga primeiro). */
export async function listarEsperas(clienteSlug: string, agora = new Date()): Promise<Espera[]> {
  const { enviadas, naPausa } = await lerMensagensDaEspera(clienteSlug, agora);
  return esperasDe(naPausa, enviadas, agora);
}

export async function contarEsperas(clienteSlug: string, agora = new Date()): Promise<number> {
  return (await listarEsperas(clienteSlug, agora)).length;
}

/**
 * Quantas conversas à espera em cada empresa (para a Lexia: o ícone soma
 * todas, como os avisos do admin, e o Hoje/Ajustes dizem onde estão).
 * Guardado 15 s, para o ícone não pedir à base 2 leituras por empresa a cada
 * 30 s de cada aparelho.
 */
export const esperasPorEmpresa = unstable_cache(
  async (slugs: string[]): Promise<Record<string, number>> => {
    const agora = new Date();
    const pares = await Promise.all(slugs.map(async (s) => [s, await contarEsperas(s, agora).catch(() => 0)] as const));
    return Object.fromEntries(pares);
  },
  ["m-esperas-empresas-v1"],
  { revalidate: 15 },
);

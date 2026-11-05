import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Quantas conversas estão à espera de uma pessoa (o número da aba Conversas e
 * do ícone). Leve de propósito, porque corre a cada 30 s com o app aberto:
 * lê só as mensagens "recebida_na_pausa" das últimas 48 h e, dessas
 * conversas, só as enviadas depois.
 */
export async function contarEsperas(clienteSlug: string, agora = new Date()): Promise<number> {
  const base = createAdminClient();
  const desde = new Date(agora.getTime() - 48 * 3600_000).toISOString();
  const { data: naPausa } = await base
    .from("lexia_mensagens")
    .select("identificador_conversa, criado_em")
    .eq("cliente_slug", clienteSlug)
    .eq("origem", "recebida_na_pausa")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: true })
    .limit(500);
  if (!naPausa?.length) return 0;

  const primeira = new Map<string, string>();
  for (const m of naPausa) if (!primeira.has(m.identificador_conversa)) primeira.set(m.identificador_conversa, m.criado_em);
  const { data: enviadas } = await base
    .from("lexia_mensagens")
    .select("identificador_conversa, criado_em")
    .eq("cliente_slug", clienteSlug)
    .eq("direccao", "enviada")
    .gte("criado_em", desde)
    .in("identificador_conversa", [...primeira.keys()])
    .order("criado_em", { ascending: false })
    .limit(1000);
  const ultimaEnviada = new Map<string, string>();
  for (const m of enviadas ?? []) if (!ultimaEnviada.has(m.identificador_conversa)) ultimaEnviada.set(m.identificador_conversa, m.criado_em);

  // À espera: houve "recebida na pausa" depois da última enviada.
  const ultimaNaPausa = new Map<string, string>();
  for (const m of naPausa) ultimaNaPausa.set(m.identificador_conversa, m.criado_em);
  let n = 0;
  for (const [conversa, quando] of ultimaNaPausa) {
    const env = ultimaEnviada.get(conversa);
    if (!env || env < quando) n++;
  }
  return n;
}

import "server-only";

import { chavePresenca, presencasDe } from "@/lib/agenda/presenca";
import { createAdminClient } from "@/lib/supabase/admin";

export type Sumido = { dias: number; nome: string; servico: string | null; telefone: string };

/**
 * Clientes sumidos (25/11): já vieram, a última visita foi há mais de `dias`
 * e não têm nada marcado para a frente. Lê o espelho da agenda do último ano,
 * pelo telefone (a mesma ponte da ficha). Uma falta não conta como visita.
 */
export async function clientesSumidos(clienteSlug: string, dias: number, agora = new Date()): Promise<Sumido[]> {
  const desde = new Date(agora.getTime() - 365 * 86_400_000).toISOString();
  const base = createAdminClient();
  const linhas: { calendario_id: string; event_id: string; inicio: string; nome_cliente: string | null; servico: string | null; telefone_digitos: string }[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await base
      .from("lexia_agendamentos")
      .select("calendario_id, event_id, inicio, nome_cliente, servico, telefone_digitos")
      .eq("cliente_slug", clienteSlug)
      .neq("estado", "cancelado")
      .eq("dia_inteiro", false)
      .not("telefone_digitos", "is", null)
      .gte("inicio", desde)
      .order("inicio", { ascending: true })
      .range(de, de + 999);
    if (error || !data?.length) break;
    linhas.push(...(data as typeof linhas));
    if (data.length < 1000) break;
  }
  const agoraIso = agora.toISOString();
  const passadas = linhas.filter((l) => l.inicio < agoraIso);
  const faltas = await presencasDe(clienteSlug, passadas);

  const porTelefone = new Map<string, { futura: boolean; ultima: (typeof linhas)[number] | null }>();
  for (const l of linhas) {
    if (!l.telefone_digitos || l.telefone_digitos.length < 6) continue;
    const p = porTelefone.get(l.telefone_digitos) ?? { futura: false, ultima: null };
    if (l.inicio >= agoraIso) p.futura = true;
    else if (faltas.get(chavePresenca(l.calendario_id, l.event_id)) !== "faltou") p.ultima = l;
    porTelefone.set(l.telefone_digitos, p);
  }

  const limite = agora.getTime() - dias * 86_400_000;
  const lista: Sumido[] = [];
  for (const [telefone, p] of porTelefone) {
    if (p.futura || !p.ultima || Date.parse(p.ultima.inicio) > limite) continue;
    lista.push({ dias: Math.floor((agora.getTime() - Date.parse(p.ultima.inicio)) / 86_400_000), nome: (p.ultima.nome_cliente ?? "").trim(), servico: p.ultima.servico, telefone });
  }
  return lista.sort((a, b) => a.dias - b.dias).slice(0, 150);
}

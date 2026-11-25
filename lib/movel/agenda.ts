import "server-only";

import { diasDoEvento } from "@/lib/agenda/read";
import { createAdminClient } from "@/lib/supabase/admin";

import { limitesDoDia, semanaDe, somarDias } from "./hoje";

export type EventoAgenda = {
  /** Dias depois do primeiro de um evento de vários dias (o carro de segunda a quarta). */
  continuaDeAntes: boolean;
  /** Dias antes do último de um evento de vários dias. */
  continuaDepois: boolean;
  conversa: string | null;
  estado: string;
  executor: string | null;
  fim: string;
  id: string;
  inicio: string;
  link: string | null;
  nome: string;
  origem: string;
  pendenteSinal: boolean;
  servico: string | null;
  telefone: string | null;
  valor: number | null;
};

/** Primeiro e último dia (AAAA-MM-DD) do mês de `dia`. */
export function mesDe(dia: string) {
  const [a, m] = dia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { fim: `${dia.slice(0, 8)}${String(ultimo).padStart(2, "0")}`, inicio: `${dia.slice(0, 8)}01` };
}

/** Os dias (AAAA-MM-DD) entre dois dias, inclusive. */
export function diasEntre(inicio: string, fim: string) {
  const out: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) out.push(d);
  return out;
}

export type Vista = "dia" | "semana" | "mes";

/**
 * Os eventos de um intervalo (no fuso do cliente): o dia, a semana ou o mês
 * de `dia`. `diasComEventos` serve os pontos da faixa de dias e o mês.
 */
export async function agendaDoDia(clienteSlug: string, fuso: string, dia: string, vista: Vista = "dia") {
  const base = createAdminClient();
  const semana = semanaDe(dia);
  const mes = mesDe(dia);
  const primeiro = vista === "mes" ? semanaDe(mes.inicio)[0] : semana[0];
  const ultimo = vista === "mes" ? semanaDe(mes.fim)[6] : semana[6];
  // Vai 31 dias para trás para apanhar o que começou antes e ainda está a
  // decorrer: sem isto a terça e a quarta de um carro de segunda a quarta
  // apareciam livres, embora o Google as mostre ocupadas.
  const lim = { fim: limitesDoDia(ultimo, fuso).fim, inicio: limitesDoDia(somarDias(primeiro, -31), fuso).inicio };
  const { data, error } = await base
    .from("lexia_agendamentos")
    .select("id, inicio, fim, titulo, nome_cliente, telefone_digitos, servico, executor, valor_previsto, estado, origem, dados, link_google, dia_inteiro")
    .eq("cliente_slug", clienteSlug)
    .gte("inicio", lim.inicio)
    .lt("inicio", lim.fim)
    .order("inicio", { ascending: true })
    .limit(3000);
  if (error) throw new Error("Não foi possível ler a agenda.");

  const linhas = (data ?? []).filter((l) => !l.dia_inteiro);
  // Cada evento entra em todos os dias que ocupa (dentro da grelha), não só no
  // dia em que começa.
  const porDias = linhas.flatMap((l) => {
    const { primeiro: p, ultimo: u } = diasDoEvento(l.inicio, l.fim, fuso);
    const dias: string[] = [];
    for (let k = p < primeiro ? primeiro : p; k <= u && k <= ultimo; k = somarDias(k, 1)) dias.push(k);
    return dias.map((k) => ({ continuaDeAntes: k > p, continuaDepois: k < u, k, l }));
  });
  const diasComEventos = [...new Set(porDias.filter(({ l }) => l.estado !== "cancelado").map(({ k }) => k))];
  const noIntervalo = (k: string) => (vista === "dia" ? k === dia : vista === "semana" ? semana.includes(k) : k >= mes.inicio && k <= mes.fim);
  const eventos: (EventoAgenda & { dia: string })[] = porDias
    .filter(({ k }) => noIntervalo(k))
    // Por dia e, dentro do dia, o que já vinha de trás primeiro e o resto pela hora.
    .sort((a, b) => a.k.localeCompare(b.k) || Number(b.continuaDeAntes) - Number(a.continuaDeAntes) || a.l.inicio.localeCompare(b.l.inicio))
    .map(({ continuaDeAntes, continuaDepois, k, l }) => ({
      continuaDeAntes,
      continuaDepois,
      dia: k,
      conversa: l.telefone_digitos ? `whatsapp:${l.telefone_digitos}` : null,
      estado: l.estado,
      executor: l.executor,
      fim: l.fim,
      id: l.id,
      inicio: l.inicio,
      link: l.link_google,
      nome: (l.nome_cliente || l.titulo || "").trim(),
      origem: l.origem,
      pendenteSinal: (l.dados as Record<string, unknown> | null)?.estado_cliente === "pendente_sinal",
      servico: l.servico,
      telefone: l.telefone_digitos,
      valor: l.valor_previsto === null ? null : Number(l.valor_previsto),
    }));
  const contagem: Record<string, number> = {};
  for (const { k, l } of porDias) if (l.estado !== "cancelado") contagem[k] = (contagem[k] ?? 0) + 1;
  return { contagem, diasComEventos, eventos, grelha: diasEntre(primeiro, ultimo), mes, semana };
}

export function diaValido(valor: unknown, hoje: string) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : hoje;
}

export { somarDias };

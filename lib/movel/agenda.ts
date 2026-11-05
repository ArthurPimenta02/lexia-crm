import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { chaveDoDia } from "./formato";
import { limitesDoDia, semanaDe, somarDias } from "./hoje";

export type EventoAgenda = {
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
  const lim = { fim: limitesDoDia(ultimo, fuso).fim, inicio: limitesDoDia(primeiro, fuso).inicio };
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
  const diasComEventos = [...new Set(linhas.filter((l) => l.estado !== "cancelado").map((l) => chaveDoDia(l.inicio, fuso)))];
  const noIntervalo = (k: string) => (vista === "dia" ? k === dia : vista === "semana" ? semana.includes(k) : k >= mes.inicio && k <= mes.fim);
  const eventos: (EventoAgenda & { dia: string })[] = linhas
    .filter((l) => noIntervalo(chaveDoDia(l.inicio, fuso)))
    .map((l) => ({
      dia: chaveDoDia(l.inicio, fuso),
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
  for (const l of linhas) if (l.estado !== "cancelado") { const k = chaveDoDia(l.inicio, fuso); contagem[k] = (contagem[k] ?? 0) + 1; }
  return { contagem, diasComEventos, eventos, grelha: diasEntre(primeiro, ultimo), mes, semana };
}

export function diaValido(valor: unknown, hoje: string) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : hoje;
}

export { somarDias };

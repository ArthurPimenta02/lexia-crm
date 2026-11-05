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

/** Os eventos de um dia (no fuso do cliente) e os dias da semana com eventos. */
export async function agendaDoDia(clienteSlug: string, fuso: string, dia: string) {
  const base = createAdminClient();
  const semana = semanaDe(dia);
  const lim = { fim: limitesDoDia(semana[6], fuso).fim, inicio: limitesDoDia(semana[0], fuso).inicio };
  const { data, error } = await base
    .from("lexia_agendamentos")
    .select("id, inicio, fim, titulo, nome_cliente, telefone_digitos, servico, executor, valor_previsto, estado, origem, dados, link_google, dia_inteiro")
    .eq("cliente_slug", clienteSlug)
    .gte("inicio", lim.inicio)
    .lt("inicio", lim.fim)
    .order("inicio", { ascending: true })
    .limit(800);
  if (error) throw new Error("Não foi possível ler a agenda.");

  const linhas = (data ?? []).filter((l) => !l.dia_inteiro);
  const diasComEventos = [...new Set(linhas.filter((l) => l.estado !== "cancelado").map((l) => chaveDoDia(l.inicio, fuso)))];
  const eventos: EventoAgenda[] = linhas
    .filter((l) => chaveDoDia(l.inicio, fuso) === dia)
    .map((l) => ({
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
  return { diasComEventos, eventos, semana };
}

export function diaValido(valor: unknown, hoje: string) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? valor : hoje;
}

export { somarDias };

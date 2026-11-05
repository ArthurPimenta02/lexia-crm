import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { chaveDoDia } from "./formato";
import { limitesDoDia, semanaDe, somarDias } from "./hoje";

/**
 * Os números da tela "Mais": quantas marcações o agente fez em cada dia desta
 * semana e quantas marcações houve neste mês (para a meta do mês). Conta pela
 * data em que a marcação foi CRIADA, como os Resultados.
 */
export type DadosMais = {
  semana: { dia: string; agente: number }[];
  mes: { todos: number; agente: number; ultimoDia: string };
};

export async function dadosMais(clienteSlug: string, fuso: string, agora = new Date()): Promise<DadosMais> {
  const hoje = chaveDoDia(agora, fuso);
  const semana = semanaDe(hoje);
  const primeiroDoMes = `${hoje.slice(0, 8)}01`;
  const desde = semana[0] < primeiroDoMes ? semana[0] : primeiroDoMes;
  const { data, error } = await createAdminClient()
    .from("lexia_agendamentos")
    .select("criado_no_google, origem")
    .eq("cliente_slug", clienteSlug)
    .neq("estado", "cancelado")
    .eq("dia_inteiro", false)
    .gte("criado_no_google", limitesDoDia(desde, fuso).inicio)
    .lt("criado_no_google", limitesDoDia(hoje, fuso).fim)
    .limit(5000);
  if (error) throw new Error(error.message);

  const linhas = (data ?? []).map((l) => ({ agente: l.origem === "agente", dia: chaveDoDia(l.criado_no_google, fuso) }));
  const doMes = linhas.filter((l) => l.dia >= primeiroDoMes);
  const [a, m] = hoje.split("-").map(Number);
  const ultimoDia = somarDias(new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10), -1);

  return {
    mes: { agente: doMes.filter((l) => l.agente).length, todos: doMes.length, ultimoDia },
    semana: semana.map((dia) => ({ agente: linhas.filter((l) => l.agente && l.dia === dia).length, dia })),
  };
}

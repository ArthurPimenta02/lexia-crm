import "server-only";

import { getMoedaDoCliente } from "@/lib/servicos/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { chaveDoDia, moedaDoCliente } from "./formato";
import { limitesDoDia, semanaDe, somarDias } from "./hoje";

/**
 * Os números da tela "Mais": quantas marcações o agente fez em cada dia desta
 * semana e quantas marcações houve neste mês (para a meta do mês). Conta pela
 * data em que a marcação foi CRIADA, como os Resultados.
 */
export type DadosMais = {
  /** Gasto em anúncios dos últimos 7 dias (o mesmo período do cartão do Hoje). */
  anuncios: { gasto: number; moeda: string } | null;
  semana: { dia: string; agente: number }[];
  mes: { todos: number; agente: number; ultimoDia: string };
};

export async function dadosMais(clienteSlug: string, fuso: string, agora = new Date()): Promise<DadosMais> {
  const hoje = chaveDoDia(agora, fuso);
  const semana = semanaDe(hoje);
  const primeiroDoMes = `${hoje.slice(0, 8)}01`;
  const desde = semana[0] < primeiroDoMes ? semana[0] : primeiroDoMes;
  const base = createAdminClient();
  const custos = base.from("lexia_campanha_custos").select("gasto, moeda").eq("cliente_slug", clienteSlug).gte("dia", somarDias(hoje, -7)).lte("dia", somarDias(hoje, -1)).limit(2000);
  const { data, error } = await base
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

  const { data: linhasCusto } = await custos;
  return {
    anuncios: linhasCusto?.length
      ? { gasto: linhasCusto.reduce((a, x) => a + Number(x.gasto || 0), 0), moeda: (linhasCusto[0].moeda as string) || moedaDoCliente(getMoedaDoCliente(clienteSlug), fuso) }
      : null,
    mes: { agente: doMes.filter((l) => l.agente).length, todos: doMes.length, ultimoDia },
    semana: semana.map((dia) => ({ agente: linhas.filter((l) => l.agente && l.dia === dia).length, dia })),
  };
}

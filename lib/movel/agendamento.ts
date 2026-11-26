import "server-only";

import { agendasDe } from "@/lib/agenda/google";
import { chavePresenca, presencasDe, type Presenca } from "@/lib/agenda/presenca";
import { createAdminClient } from "@/lib/supabase/admin";

export type DetalheAgendamento = {
  conversa: string | null;
  estado: string;
  executor: string | null;
  /** Como está no espelho (a chave da configuração: "martim", "Samuel"). */
  executorChave: string | null;
  fim: string;
  gerido: boolean;
  id: string;
  inicio: string;
  link: string | null;
  nome: string;
  origem: string;
  presenca: Presenca | null;
  servico: string | null;
  telefone: string | null;
  titulo: string;
  valor: number | null;
};

/** Um agendamento da empresa da sessão, com o compareceu/faltou. */
export async function lerAgendamento(clienteSlug: string, id: string): Promise<DetalheAgendamento | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: l } = await createAdminClient()
    .from("lexia_agendamentos")
    .select("id, calendario_id, event_id, inicio, fim, titulo, nome_cliente, telefone_digitos, servico, executor, valor_previsto, estado, origem, link_google")
    .eq("cliente_slug", clienteSlug)
    .eq("id", id)
    .maybeSingle();
  if (!l) return null;
  const presencas = await presencasDe(clienteSlug, [{ calendario_id: String(l.calendario_id), event_id: String(l.event_id) }]);
  const executor = l.executor ? String(l.executor) : null;
  return {
    conversa: l.telefone_digitos ? `whatsapp:${l.telefone_digitos}` : null,
    estado: String(l.estado),
    executor: executor ? executor.charAt(0).toUpperCase() + executor.slice(1) : null,
    executorChave: executor,
    fim: String(l.fim),
    gerido: Object.values(agendasDe(clienteSlug)).includes(String(l.calendario_id)),
    id: String(l.id),
    inicio: String(l.inicio),
    link: (l.link_google as string | null) ?? null,
    nome: String(l.nome_cliente ?? "").trim(),
    origem: String(l.origem ?? ""),
    presenca: presencas.get(chavePresenca(String(l.calendario_id), String(l.event_id))) ?? null,
    servico: (l.servico as string | null) ?? null,
    telefone: (l.telefone_digitos as string | null) ?? null,
    titulo: String(l.titulo ?? "").trim(),
    valor: l.valor_previsto === null ? null : Number(l.valor_previsto),
  };
}

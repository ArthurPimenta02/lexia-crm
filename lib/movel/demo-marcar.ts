import "server-only";

import { ehContaDemo, instanteNoFuso, SERVICOS_DEMO } from "@/lib/movel/demo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Conta demo (revisor da Apple): a marcação grava só na base da Lexia, sem
 * Google, para o fluxo inteiro poder ser visto. Saiu de app/m/agenda/acoes.ts
 * a 25/11, quando o Novo agendamento passou a ter tela própria.
 */
export async function marcarDemo({ clienteSlug, contactoId, dia, duracaoMinutos, executor, fuso, hora, servicoId }: {
  clienteSlug: string; contactoId: string; dia: string; duracaoMinutos: number; executor: string; fuso: string; hora: string; servicoId: string;
}): Promise<string | null> {
  if (!ehContaDemo(clienteSlug)) return "Só na conta de demonstração.";
  const servico = SERVICOS_DEMO.find((s) => s.id === servicoId);
  const exec = servico?.executores.find((e) => e.chave === executor);
  const inicio = instanteNoFuso(dia, hora, fuso);
  if (!servico || !exec || inicio === null) return "Faltam dados para agendar.";
  const base = createAdminClient();
  const { data: contacto } = await base.from("lexia_contactos").select("nome, telefone").eq("cliente_slug", clienteSlug).eq("id", contactoId).maybeSingle();
  if (!contacto) return "Faltam dados para agendar.";
  const agora = new Date().toISOString();
  const minutos = duracaoMinutos > 0 ? duracaoMinutos : exec.duracaoMinutos;
  const { error } = await base.from("lexia_agendamentos").insert({
    cliente_slug: clienteSlug, calendario_id: `demo-${exec.chave}@demo.uselexia.app`, event_id: `demo-app-${crypto.randomUUID()}`,
    inicio: new Date(inicio).toISOString(), fim: new Date(inicio + minutos * 60_000).toISOString(), dia_inteiro: false, fuso,
    titulo: `${servico.nome} — ${contacto.nome ?? ""}`, estado: "confirmado", nome_cliente: contacto.nome, telefone: contacto.telefone,
    servico: servico.nome, origem: "manual", executor: exec.chave, valor_previsto: servico.precoBase,
    criado_no_google: agora, actualizado_no_google: agora, sincronizado_em: agora, dados: { demo: true },
  });
  return error ? "Não foi possível marcar." : null;
}

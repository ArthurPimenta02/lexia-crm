import "server-only";

import { agendasDe, apagarEvento, criarEvento, mudarHorarioDoEvento, ocupadoEntre } from "@/lib/agenda/google";
import { getClientTimezone, instanteNoFuso } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Remarcar, cancelar e bloquear pelo app (25/11/2026).
 *
 * Como em marcar.ts: o Google é a fonte e escreve-se lá PRIMEIRO; o espelho
 * (lexia_agendamentos) é atualizado logo a seguir para a tela não esperar pela
 * sincronização. A autorização é a leitura do agendamento pelo `cliente_slug`
 * da sessão e a agenda ser uma das que a Lexia gere para essa empresa.
 */

type Agendamento = {
  calendario_id: string;
  estado: string;
  event_id: string;
  fim: string;
  id: string;
  inicio: string;
};

type Resultado = { conflitos?: { fim: string | null; inicio: string | null; titulo: string | null }[]; erro: string | null; ok: boolean };

export async function lerAgendamentoDaEmpresa(clienteSlug: string, id: string): Promise<Agendamento | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient()
    .from("lexia_agendamentos")
    .select("id, calendario_id, event_id, inicio, fim, estado")
    .eq("cliente_slug", clienteSlug)
    .eq("id", id)
    .maybeSingle();
  return (data as Agendamento | null) ?? null;
}

/** Só mexe em agendas que a Lexia gere para esta empresa (nunca numa de outra). */
function agendaDaEmpresa(clienteSlug: string, calendarioId: string) {
  return Object.values(agendasDe(clienteSlug)).includes(calendarioId);
}

export async function remarcarAgendamento({ clienteSlug, dia, hora, id, ignorarConflito }: { clienteSlug: string; dia: string; hora: string; id: string; ignorarConflito: boolean }): Promise<Resultado> {
  const ag = await lerAgendamentoDaEmpresa(clienteSlug, id);
  if (!ag) return { erro: "Agendamento não encontrado.", ok: false };
  if (ag.estado === "cancelado") return { erro: "Este agendamento foi cancelado.", ok: false };
  if (!agendaDaEmpresa(clienteSlug, ag.calendario_id)) return { erro: "Esta agenda não está ligada à Lexia.", ok: false };

  const fuso = getClientTimezone(clienteSlug);
  const inicioIso = instanteNoFuso(dia, hora, fuso);
  if (!inicioIso) return { erro: "Essa data e hora não existem.", ok: false };
  if (Date.parse(inicioIso) < Date.now()) return { erro: "Esta hora já passou.", ok: false };
  const duracao = Math.max(15 * 60_000, Date.parse(ag.fim) - Date.parse(ag.inicio));
  const fimIso = new Date(Date.parse(inicioIso) + duracao).toISOString();

  try {
    if (!ignorarConflito) {
      const conflitos = (await ocupadoEntre(ag.calendario_id, inicioIso, fimIso)).filter(
        // O próprio evento não conta como conflito (remarcar 30 min para a frente).
        (c) => !(c.inicio && Date.parse(c.inicio) === Date.parse(ag.inicio)),
      );
      if (conflitos.length) return { conflitos, erro: null, ok: false };
    }
    await mudarHorarioDoEvento(ag.calendario_id, ag.event_id, { fimIso, fuso, inicioIso });
  } catch (e) {
    console.error("[agenda] remarcar", e);
    return { erro: "A agenda não respondeu a tempo. Confira no Google antes de tentar de novo.", ok: false };
  }

  const agora = new Date().toISOString();
  await createAdminClient()
    .from("lexia_agendamentos")
    .update({ actualizado_no_google: agora, fim: fimIso, inicio: inicioIso, sincronizado_em: agora })
    .eq("cliente_slug", clienteSlug)
    .eq("id", id);
  return { erro: null, ok: true };
}

export async function cancelarAgendamento({ clienteSlug, id }: { clienteSlug: string; id: string }): Promise<Resultado> {
  const ag = await lerAgendamentoDaEmpresa(clienteSlug, id);
  if (!ag) return { erro: "Agendamento não encontrado.", ok: false };
  if (ag.estado === "cancelado") return { erro: null, ok: true };
  if (!agendaDaEmpresa(clienteSlug, ag.calendario_id)) return { erro: "Esta agenda não está ligada à Lexia.", ok: false };

  try {
    await apagarEvento(ag.calendario_id, ag.event_id);
  } catch (e) {
    console.error("[agenda] cancelar", e);
    return { erro: "A agenda não respondeu a tempo. Confira no Google antes de tentar de novo.", ok: false };
  }

  const agora = new Date().toISOString();
  await createAdminClient()
    .from("lexia_agendamentos")
    .update({ actualizado_no_google: agora, estado: "cancelado", sincronizado_em: agora })
    .eq("cliente_slug", clienteSlug)
    .eq("id", id);
  return { erro: null, ok: true };
}

/**
 * Bloquear um horário: um evento no Google com "Bloqueado" no título. O agente
 * já não marca por cima de nada que ocupe a agenda, por isso não precisa de
 * saber que é um bloqueio. Numa agenda partilhada (Samuel e Bruna) o bloqueio
 * ocupa a agenda da clínica, logo vale para os dois no agente.
 */
export async function bloquearHorario({ clienteSlug, dia, executor, fim, inicio, motivo }: { clienteSlug: string; dia: string; executor: string; fim: string; inicio: string; motivo: string }): Promise<Resultado> {
  const agendas = agendasDe(clienteSlug);
  const alvo = executor === "*" ? [...new Set(Object.values(agendas))] : agendas[executor] ? [agendas[executor]] : [];
  if (!alvo.length) return { erro: "Este profissional ainda não tem agenda do Google ligada à Lexia.", ok: false };

  const fuso = getClientTimezone(clienteSlug);
  const inicioIso = instanteNoFuso(dia, inicio, fuso);
  const fimIso = instanteNoFuso(dia, fim, fuso);
  if (!inicioIso || !fimIso || Date.parse(fimIso) <= Date.parse(inicioIso)) return { erro: "O fim tem de ser depois do início.", ok: false };

  const quem = executor === "*" ? "" : ` (${executor})`;
  const titulo = `Bloqueado — ${motivo.trim().slice(0, 60) || "Indisponível"}${quem}`;
  const base = createAdminClient();
  const agora = new Date().toISOString();
  try {
    for (const calendarioId of alvo) {
      const criado = await criarEvento(calendarioId, { descricao: "Horário bloqueado pela plataforma LEXIA.", fimIso, fuso, inicioIso, titulo });
      await base.from("lexia_agendamentos").upsert(
        {
          calendario_id: calendarioId, cliente_slug: clienteSlug, criado_no_google: agora, actualizado_no_google: agora, dados: { bloqueio: true },
          descricao: "Horário bloqueado pela plataforma LEXIA.", dia_inteiro: false, estado: "confirmado", event_id: criado.eventId,
          executor: executor === "*" ? null : executor, fim: fimIso, fuso, inicio: inicioIso, link_google: criado.link, origem: "manual",
          sincronizado_em: agora, titulo,
        },
        { onConflict: "cliente_slug,calendario_id,event_id" },
      );
    }
  } catch (e) {
    console.error("[agenda] bloquear", e);
    return { erro: "A agenda não respondeu a tempo. Confira no Google antes de tentar de novo.", ok: false };
  }
  return { erro: null, ok: true };
}

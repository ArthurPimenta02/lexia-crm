import { Suspense } from "react";

import {
  deleteAdminSimulatedHandoff,
  updateAdminHandoffStatus,
  type AdminHandoffStatus,
} from "@/app/admin/handoffs/actions";
import { AgentLocksSection } from "@/app/components/agent-locks-section";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import {
  HandoffCard,
  HandoffEmptyState,
  HandoffSectionHeader,
  SimulatedHandoffCard,
  handoffGridClass,
} from "@/app/components/handoff-cards";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getAgentLocksClientSlugs } from "@/lib/redis/agent-locks";
import { createClient } from "@/lib/supabase/server";

type AdminHandoff = {
  id: string;
  cliente_slug: string;
  criado_em: string | null;
  nome_contacto: string | null;
  telefone: string | null;
  motivo: string | null;
  prioridade: "baixa" | "normal" | "alta" | null;
  status: AdminHandoffStatus | null;
  resumo: string | null;
  origem: string | null;
};

type AdminSimulatedHandoff = {
  id: string;
  cliente_slug: string;
  criado_em: string | null;
  origem: string | null;
  mensagem_teste: string | null;
  resposta_obtida: string | null;
  mensagens: unknown;
  session_id: string | null;
};

function stringifyMessage(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      content?: unknown;
      message?: unknown;
      resposta?: unknown;
    };

    for (const item of [
      candidate.text,
      candidate.content,
      candidate.message,
      candidate.resposta,
    ]) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
    }
  }

  return "";
}

function getAgentResponseText(execution: AdminSimulatedHandoff) {
  const fallback = execution.resposta_obtida ? [execution.resposta_obtida] : [];
  const source = execution.mensagens;

  if (Array.isArray(source)) {
    const messages = source.map(stringifyMessage).filter(Boolean);

    return (messages.length > 0 ? messages : fallback).join("\n\n");
  }

  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source) as unknown;

      if (Array.isArray(parsed)) {
        const messages = parsed.map(stringifyMessage).filter(Boolean);

        return (messages.length > 0 ? messages : fallback).join("\n\n");
      }
    } catch {
      // Mensagens em texto simples seguem para o fallback abaixo.
    }
  }

  return stringifyMessage(source) || fallback.join("\n\n");
}

const statusActions: { label: string; status: AdminHandoffStatus }[] = [
  { label: "Em atendimento", status: "em_atendimento" },
  { label: "Resolvido", status: "resolvido" },
  { label: "Perdido", status: "perdido" },
];

const deleteButtonClass =
  "h-10 w-full rounded-full border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-auto sm:text-xs";

export default async function AdminHandoffsPage() {
  // As pausas leem o Redis com credenciais de servidor, por isso a página
  // confirma o papel e o status aqui, sem depender apenas do layout.
  const { profile } = await getLoggedInUserProfile();
  const canManageAgentLocks =
    profile?.role === "lexia_admin" && profile.status === "ativo";
  const supabase = await createClient();
  const [
    { data: handoffsData, error: handoffsError },
    { data: simulatedData, error: simulatedError },
  ] = await Promise.all([
    supabase
      .from("lexia_handoffs")
      .select(
        "id, cliente_slug, criado_em, nome_contacto, telefone, motivo, prioridade, status, resumo, origem",
      )
      .order("criado_em", { ascending: false }),
    supabase
      .from("lexia_testes_execucoes")
      .select(
        "id, cliente_slug, criado_em, origem, mensagem_teste, resposta_obtida, mensagens, session_id",
      )
      .eq("rota", "handoff_atendimento")
      .order("criado_em", { ascending: false }),
  ]);

  if (handoffsError) {
    throw new Error("Não foi possível buscar os handoffs.");
  }

  if (simulatedError) {
    throw new Error("Não foi possível buscar os handoffs simulados.");
  }

  const handoffs = (handoffsData ?? []) as AdminHandoff[];
  const simulatedHandoffs =
    (simulatedData ?? []) as AdminSimulatedHandoff[];

  return (
    <section className="flex w-full min-w-0 max-w-7xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Handoffs
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 sm:text-base">
          Pausas do agente e handoffs recebidos em todos os clientes da Lexia.
        </p>
      </div>

      {canManageAgentLocks
        ? getAgentLocksClientSlugs().map((clienteSlug) => (
            <Suspense fallback={null} key={clienteSlug}>
              <AgentLocksSection
                clienteSlug={clienteSlug}
                conversationsPath="/admin/conversas"
                includeClientParam
                title={`Agente pausado · ${clienteSlug}`}
              />
            </Suspense>
          ))
        : null}

      <section className="flex w-full min-w-0 flex-col gap-4">
        <HandoffSectionHeader
          count={handoffs.length}
          description="Handoffs reais gravados pelos workflows em todos os clientes."
          title="Handoffs recebidos"
        />
        {handoffs.length > 0 ? (
          <div className={handoffGridClass}>
            {handoffs.map((handoff) => (
              <HandoffCard
                actions={statusActions.map((item) => ({
                  ...item,
                  action: updateAdminHandoffStatus.bind(
                    null,
                    handoff.id,
                    item.status,
                  ),
                }))}
                clientLabel={handoff.cliente_slug}
                criadoEm={handoff.criado_em}
                key={handoff.id}
                motivo={handoff.motivo}
                nome={handoff.nome_contacto}
                origem={handoff.origem}
                prioridade={handoff.prioridade}
                resumo={handoff.resumo}
                status={handoff.status}
                telefone={handoff.telefone}
              />
            ))}
          </div>
        ) : (
          <HandoffEmptyState>Nenhum handoff recebido ainda.</HandoffEmptyState>
        )}
      </section>

      <details className="group w-full min-w-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 [&::-webkit-details-marker]:hidden">
          <span>Handoffs simulados em testes ({simulatedHandoffs.length})</span>
          <span
            aria-hidden="true"
            className="text-zinc-400 transition group-open:rotate-90"
          >
            ›
          </span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm leading-6 text-zinc-600">
            Execuções de teste que acionaram a rota de handoff sem criar
            handoff real.
          </p>
          {simulatedHandoffs.length > 0 ? (
            <div className={handoffGridClass}>
              {simulatedHandoffs.map((handoff) => (
                <SimulatedHandoffCard
                  clientLabel={`${handoff.cliente_slug}${
                    handoff.origem ? ` · ${handoff.origem.replaceAll("_", " ")}` : ""
                  }`}
                  criadoEm={handoff.criado_em}
                  deleteButton={
                    <ConfirmActionButton
                      action={deleteAdminSimulatedHandoff.bind(
                        null,
                        handoff.id,
                        handoff.cliente_slug,
                      )}
                      className={deleteButtonClass}
                      confirmMessage="Excluir este handoff simulado? Isso não afeta handoffs reais de produção."
                    >
                      Excluir simulado
                    </ConfirmActionButton>
                  }
                  key={handoff.id}
                  mensagem={handoff.mensagem_teste}
                  resposta={getAgentResponseText(handoff)}
                />
              ))}
            </div>
          ) : (
            <HandoffEmptyState>Nenhum handoff simulado ainda.</HandoffEmptyState>
          )}
        </div>
      </details>
    </section>
  );
}

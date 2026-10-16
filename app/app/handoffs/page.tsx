import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  deleteClientSimulatedHandoff,
  updateHandoffStatus,
  type HandoffStatus,
} from "@/app/app/handoffs/actions";
import { AgentLocksSection } from "@/app/components/agent-locks-section";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import {
  HandoffCard,
  HandoffEmptyState,
  HandoffSectionHeader,
  SimulatedHandoffCard,
  handoffGridClass,
} from "@/app/components/handoff-cards";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { createClient } from "@/lib/supabase/server";

type Handoff = {
  id: string;
  criado_em: string | null;
  nome_contacto: string | null;
  telefone: string | null;
  motivo: string | null;
  prioridade: "baixa" | "normal" | "alta" | null;
  status: HandoffStatus | null;
  resumo: string | null;
};

type SimulatedHandoff = {
  id: string;
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

function getAgentResponseText(execution: SimulatedHandoff) {
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

const statusActions: { label: string; status: HandoffStatus }[] = [
  { label: "Em atendimento", status: "em_atendimento" },
  { label: "Resolvido", status: "resolvido" },
  { label: "Perdido", status: "perdido" },
];

const deleteButtonClass =
  "h-10 w-full rounded-full border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-auto sm:text-xs";

export default async function ClientHandoffsPage() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const timeZone = getClientTimezone(profile.cliente_slug);
  const supabase = await createClient();
  const [
    { data: handoffsData, error: handoffsError },
    { data: simulatedData, error: simulatedError },
  ] = await Promise.all([
    supabase
      .from("lexia_handoffs")
      .select(
        "id, criado_em, nome_contacto, telefone, motivo, prioridade, status, resumo",
      )
      .eq("cliente_slug", profile.cliente_slug)
      .order("criado_em", { ascending: false }),
    supabase
      .from("lexia_testes_execucoes")
      .select(
        "id, criado_em, origem, mensagem_teste, resposta_obtida, mensagens, session_id",
      )
      .eq("cliente_slug", profile.cliente_slug)
      .eq("rota", "handoff_atendimento")
      .order("criado_em", { ascending: false }),
  ]);

  if (handoffsError) {
    throw new Error("Não foi possível buscar os handoffs.");
  }

  if (simulatedError) {
    throw new Error("Não foi possível buscar os handoffs simulados.");
  }

  const handoffs = (handoffsData ?? []) as Handoff[];
  const simulatedHandoffs = (simulatedData ?? []) as SimulatedHandoff[];

  return (
    <section className="flex w-full min-w-0 max-w-7xl flex-col gap-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.32em] text-zinc-500 uppercase sm:text-sm">
          Agente
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          Atendimento humano
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Veja onde o agente está pausado e os pedidos encaminhados para a
          equipa.
        </p>
      </div>

      {profile.status === "ativo" ? (
        <Suspense fallback={null}>
          <AgentLocksSection
            clienteSlug={profile.cliente_slug}
            conversationsPath="/app/conversas"
          />
        </Suspense>
      ) : null}

      <section className="flex w-full min-w-0 flex-col gap-4">
        <HandoffSectionHeader
          count={handoffs.length}
          description="Pedidos em que o agente encaminhou a conversa para acompanhamento da equipa."
          title="Pedidos de atendimento"
        />
        {handoffs.length > 0 ? (
          <div className={handoffGridClass}>
            {handoffs.map((handoff) => (
              <HandoffCard
                actions={statusActions.map((item) => ({
                  ...item,
                  action: updateHandoffStatus.bind(
                    null,
                    handoff.id,
                    item.status,
                  ),
                }))}
                criadoEm={handoff.criado_em}
                key={handoff.id}
                motivo={handoff.motivo}
                nome={handoff.nome_contacto}
                prioridade={handoff.prioridade}
                resumo={handoff.resumo}
                status={handoff.status}
                telefone={handoff.telefone}
                timeZone={timeZone}
              />
            ))}
          </div>
        ) : (
          <HandoffEmptyState>
            Ainda não há pedidos de atendimento humano.
          </HandoffEmptyState>
        )}
      </section>

      <details className="group w-full min-w-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 [&::-webkit-details-marker]:hidden">
          <span>Pedidos simulados em testes ({simulatedHandoffs.length})</span>
          <span
            aria-hidden="true"
            className="text-zinc-400 transition group-open:rotate-90"
          >
            ›
          </span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm leading-6 text-zinc-600">
            Simulações da Área de Testes que indicaram necessidade de
            atendimento humano. Não afetam pedidos reais.
          </p>
          {simulatedHandoffs.length > 0 ? (
            <div className={handoffGridClass}>
              {simulatedHandoffs.map((handoff) => (
                <SimulatedHandoffCard
                  criadoEm={handoff.criado_em}
                  deleteButton={
                    <ConfirmActionButton
                      action={deleteClientSimulatedHandoff.bind(
                        null,
                        handoff.id,
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
                  timeZone={timeZone}
                />
              ))}
            </div>
          ) : (
            <HandoffEmptyState>Ainda não há pedidos simulados.</HandoffEmptyState>
          )}
        </div>
      </details>
    </section>
  );
}

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
  handoffAberto,
  handoffListClass,
} from "@/app/components/handoff-cards";
import { CabecalhoTela, FiltroTrilho } from "@/app/components/tela";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";
import { AtualizacaoAutomatica } from "@/app/components/atualizacao-automatica";
import { sinalDaTela } from "@/lib/sinais/sinal-da-tela";

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
  "ds-botao ds-botao-perigo ds-botao-p w-full disabled:cursor-not-allowed sm:w-auto";

/** O filtro da lista de pedidos. Abre nos abertos, que é o que pede ação. */
const filtros = [
  { chave: "abertos", label: "Abertos" },
  { chave: "resolvido", label: "Resolvidos" },
  { chave: "perdido", label: "Perdidos" },
  { chave: "todos", label: "Todos" },
] as const;
type Filtro = (typeof filtros)[number]["chave"];

function passaNoFiltro(status: string | null, filtro: Filtro) {
  if (filtro === "todos") return true;
  if (filtro === "abertos") return handoffAberto(status);
  return status === filtro;
}

export default async function ClientHandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/handoffs");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const t = await getT();
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
  const pedido = (await searchParams).status;
  const filtro: Filtro =
    filtros.find((f) => f.chave === (Array.isArray(pedido) ? pedido[0] : pedido))?.chave ??
    "abertos";
  const contagem = (f: Filtro) =>
    handoffs.filter((handoff) => passaNoFiltro(handoff.status, f)).length;
  const abertos = contagem("abertos");
  const visiveis = handoffs.filter((handoff) => passaNoFiltro(handoff.status, filtro));

  return (
    <section className="flex w-full min-w-0 max-w-6xl flex-col gap-8">
      <AtualizacaoAutomatica segundos={15} sinal={sinalDaTela.bind(null, "handoffs", null)} />
      <CabecalhoTela
        acoes={
          handoffs.length === 0 ? undefined : <FiltroTrilho
            opcoes={filtros.map((f) => ({
              ativo: f.chave === filtro,
              href: f.chave === "abertos" ? "/app/handoffs" : `/app/handoffs?status=${f.chave}`,
              label: t(f.label),
              quantidade: contagem(f.chave),
            }))}
            rotulo={t("Situação")}
          />
        }
        destaque={
          abertos === 0
            ? undefined
            : abertos === 1
              ? t("1 pessoa")
              : t("{n} pessoas", { n: abertos })
        }
        resto={
          abertos === 0
            ? t("Nenhum pedido de atendimento aberto.")
            : abertos === 1
              ? t("pediu para falar com alguém.")
              : t("pediram para falar com alguém.")
        }
        sobretitulo={t("Handoffs · quando o agente chama a equipe")}
      />

      {/* Sem pedidos abertos, as conversas pausadas sobem para o topo. */}
      <section
        className={`flex w-full min-w-0 flex-col gap-4 ${abertos === 0 ? "order-2" : ""}`}
      >
        <HandoffSectionHeader
          dica={t(
            "Pedidos em que o agente encaminhou a conversa para acompanhamento da equipe.",
          )}
          title={t("Pedidos de atendimento")}
        />
        {visiveis.length > 0 ? (
          <div className={handoffListClass}>
            {visiveis.map((handoff) => (
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
          <HandoffEmptyState
            texto={t("Quando o agente passar uma conversa para a equipe, ela aparece aqui.")}
          >
            {handoffs.length === 0
              ? t("Ainda não há pedidos de atendimento humano.")
              : t("Nenhum pedido nesta situação.")}
          </HandoffEmptyState>
        )}
      </section>

      {profile.status === "ativo" ? (
        <Suspense fallback={null}>
          <AgentLocksSection
            clienteSlug={profile.cliente_slug}
            conversationsPath="/app/conversas"
          />
        </Suspense>
      ) : null}


      <details className="group order-3 w-full min-w-0">
        <summary className="ds-bloco flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span>
            {t("Pedidos simulados em testes ({n})", {
              n: simulatedHandoffs.length,
            })}
          </span>
          <span
            aria-hidden="true"
            className="text-muted-foreground/60 transition group-open:rotate-90"
          >
            ›
          </span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          {simulatedHandoffs.length > 0 ? (
            <div className={handoffListClass}>
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
                      confirmMessage={t(
                        "Excluir este handoff simulado? Isso não afeta handoffs reais de produção.",
                      )}
                      pendingLabel={t("Aguarde...")}
                    >
                      {t("Excluir simulado")}
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
            <HandoffEmptyState>
              {t("Ainda não há pedidos simulados.")}
            </HandoffEmptyState>
          )}
        </div>
      </details>
    </section>
  );
}

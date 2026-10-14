import { redirect } from "next/navigation";

import { TestChat } from "@/app/app/area-testes/test-chat";
import {
  type TestFeedback,
  type TestExecution,
  type TestSession,
  type TestWorkflow,
} from "@/app/app/area-testes/actions";
import { requireClientPanelAccess } from "@/lib/auth/access-context";
import { createClient } from "@/lib/supabase/server";
import { listClientTestWorkflows } from "@/lib/workflows/private-config";

type ClientTestAreaPageProps = {
  searchParams: Promise<{
    session?: string;
  }>;
};

export default async function ClientTestAreaPage({
  searchParams,
}: ClientTestAreaPageProps) {
  const { profile, user } = await requireClientPanelAccess().catch(() =>
    redirect("/login"),
  );

  const { session } = await searchParams;
  const supabase = await createClient();
  const [
    { data: sessionsData, error: sessionsError },
    workflows,
  ] = await Promise.all([
    supabase
      .from("lexia_testes_sessoes")
      .select("id, session_id, cliente_slug, origem, status, nome, criado_em")
      .eq("cliente_slug", profile.cliente_slug)
      .eq("origem", "painel_cliente")
      .order("criado_em", { ascending: false }),
    listClientTestWorkflows(),
  ]);

  if (sessionsError) {
    throw new Error("Não foi possível buscar as sessões de teste.");
  }

  const sessions = (sessionsData ?? []) as TestSession[];
  const selectedSessionId =
    sessions.find((testSession) => testSession.session_id === session)
      ?.session_id ??
    sessions[0]?.session_id ??
    null;

  const { data: executionsData, error: executionsError } = selectedSessionId
    ? await supabase
        .from("lexia_testes_execucoes")
        .select(
          "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
        )
        .eq("cliente_slug", profile.cliente_slug)
        .eq("session_id", selectedSessionId)
        .eq("origem", "painel_cliente")
        .order("criado_em", { ascending: true })
    : { data: [], error: null };

  if (executionsError) {
    throw new Error("Não foi possível buscar as mensagens da sessão.");
  }

  const executions = (executionsData ?? []) as TestExecution[];
  const executionIds = executions.map((execution) => execution.id);
  const { data: feedbacksData, error: feedbacksError } = executionIds.length
    ? await supabase
        .from("lexia_feedbacks")
        .select("id, teste_execucao_id, avaliacao")
        .eq("cliente_slug", profile.cliente_slug)
        .eq("criado_por", user.id)
        .in("teste_execucao_id", executionIds)
    : { data: [], error: null };

  if (feedbacksError) {
    throw new Error("Não foi possível buscar os feedbacks da sessão.");
  }

  return (
    <section className="flex w-full max-w-7xl flex-col gap-6">
      <div>
        <p className="text-sm font-semibold tracking-[0.32em] text-zinc-500 uppercase">
          Agente
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Testar agente
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Simule conversas e avalie as respostas antes de activar o atendimento
          em produção.
        </p>
      </div>

      <TestChat
        executions={executions}
        feedbacks={(feedbacksData ?? []) as TestFeedback[]}
        key={selectedSessionId ?? "sem-sessao"}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        workflows={workflows as TestWorkflow[]}
      />
    </section>
  );
}

import { redirect } from "next/navigation";

import { PaginaCabecalho } from "@/app/components/painel-ui";
import { TestChat } from "@/app/app/area-testes/test-chat";
import {
  type TestFeedback,
  type TestExecution,
  type TestSession,
  type TestWorkflow,
} from "@/app/app/area-testes/actions";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type ClientTestAreaPageProps = {
  searchParams: Promise<{
    session?: string;
  }>;
};

export default async function ClientTestAreaPage({
  searchParams,
}: ClientTestAreaPageProps) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/area-testes");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const { session } = await searchParams;
  const supabase = await createClient();
  const [
    { data: sessionsData, error: sessionsError },
    { data: workflowsData, error: workflowsError },
  ] = await Promise.all([
    supabase
      .from("lexia_testes_sessoes")
      .select("id, session_id, cliente_slug, origem, status, nome, criado_em")
      .eq("cliente_slug", profile.cliente_slug)
      .eq("origem", "painel_cliente")
      .order("criado_em", { ascending: false }),
    supabase
      .from("lexia_workflows")
      .select("id, nome, tipo, webhook_url")
      .eq("cliente_slug", profile.cliente_slug)
      .eq("status", "ativo")
      .order("nome"),
  ]);

  if (sessionsError) {
    throw new Error("Não foi possível buscar as sessões de teste.");
  }

  if (workflowsError) {
    throw new Error("Não foi possível buscar os workflows ativos.");
  }

  const sessions = (sessionsData ?? []) as TestSession[];
  const workflows = (workflowsData ?? []) as TestWorkflow[];
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
      <PaginaCabecalho titulo="Área de testes" />

      <TestChat
        executions={executions}
        feedbacks={(feedbacksData ?? []) as TestFeedback[]}
        key={selectedSessionId ?? "sem-sessao"}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        workflows={workflows}
      />
    </section>
  );
}

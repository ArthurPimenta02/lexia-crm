import { redirect } from "next/navigation";

import { TestChat, type ResumoSessao } from "@/app/app/area-testes/test-chat";
import {
  type TestFeedback,
  type TestExecution,
  type TestSession,
  type TestWorkflow,
} from "@/app/app/area-testes/actions";
import { exigirEcra, temOPainelInteiro } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
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

  const t = await getT();
  const { session } = await searchParams;
  const supabase = await createClient();
  const [
    { data: sessionsData, error: sessionsError },
    { data: workflowsData, error: workflowsError },
    { data: clienteData },
    { data: contagemData },
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
    // Só o nome, para o cabeçalho do chat.
    supabase
      .from("lexia_clientes")
      .select("nome")
      .eq("slug", profile.cliente_slug)
      .maybeSingle(),
    // Leve: só os ids, para contar mensagens e feedbacks de cada conversa.
    supabase
      .from("lexia_testes_execucoes")
      .select("id, session_id, criado_em")
      .eq("cliente_slug", profile.cliente_slug)
      .eq("origem", "painel_cliente"),
  ]);

  if (sessionsError) {
    throw new Error(t("Não foi possível buscar as sessões de teste."));
  }

  if (workflowsError) {
    throw new Error(t("Não foi possível buscar os workflows ativos."));
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
    throw new Error(t("Não foi possível buscar as mensagens da sessão."));
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
    throw new Error(t("Não foi possível buscar os feedbacks da sessão."));
  }

  // Resumo de cada conversa: quantas mensagens, quantos feedbacks e quando.
  // Se a contagem falhar, a lista mostra só o nome (não trava a tela).
  const contagem = (contagemData ?? []) as {
    id: string;
    session_id: string;
    criado_em: string | null;
  }[];
  const { data: todosFeedbacksData } = contagem.length
    ? await supabase
        .from("lexia_feedbacks")
        .select("teste_execucao_id")
        .eq("cliente_slug", profile.cliente_slug)
        .eq("criado_por", user.id)
        .not("teste_execucao_id", "is", null)
    : { data: [] };
  const sessaoDaExecucao = new Map(
    contagem.map((linha) => [linha.id, linha.session_id]),
  );
  const timeZone = getClientTimezone(profile.cliente_slug);
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const formatoHora = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const formatoDia = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    timeZone,
  });
  const diaDe = (data: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(data);
  const hoje = diaDe(new Date());
  const resumos: Record<string, ResumoSessao> = {};
  const ultimaData: Record<string, string> = {};

  for (const testSession of sessions) {
    resumos[testSession.session_id] = {
      feedbacks: 0,
      mensagens: 0,
      quando: null,
    };
    if (testSession.criado_em) {
      ultimaData[testSession.session_id] = testSession.criado_em;
    }
  }

  for (const linha of contagem) {
    const resumo = resumos[linha.session_id];
    if (!resumo) continue;
    resumo.mensagens += 1;
    if (
      linha.criado_em &&
      linha.criado_em > (ultimaData[linha.session_id] ?? "")
    ) {
      ultimaData[linha.session_id] = linha.criado_em;
    }
  }

  for (const feedback of (todosFeedbacksData ?? []) as {
    teste_execucao_id: string | null;
  }[]) {
    const sessaoId = feedback.teste_execucao_id
      ? sessaoDaExecucao.get(feedback.teste_execucao_id)
      : undefined;
    if (sessaoId && resumos[sessaoId]) resumos[sessaoId].feedbacks += 1;
  }

  for (const [sessaoId, iso] of Object.entries(ultimaData)) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime()) || !resumos[sessaoId]) continue;
    resumos[sessaoId].quando =
      diaDe(data) === hoje ? formatoHora.format(data) : formatoDia.format(data);
  }

  const nomeCliente =
    (clienteData as { nome?: string | null } | null)?.nome ??
    profile.cliente_slug;

  return (
    <section className="flex w-full max-w-7xl flex-col gap-6">
      <TestChat
        executions={executions}
        feedbacks={(feedbacksData ?? []) as TestFeedback[]}
        key={selectedSessionId ?? "sem-sessao"}
        nomeCliente={nomeCliente}
        resumos={resumos}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        semEscolhaDeCanal={
          !temOPainelInteiro(profile.cliente_slug) && workflows.length === 1
        }
        workflows={workflows}
      />
    </section>
  );
}

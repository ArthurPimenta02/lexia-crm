import { AdminTestChat } from "@/app/admin/area-testes/admin-test-chat";
import {
  type AdminTestExecution,
  type AdminTestSession,
  type AdminTestWorkflow,
} from "@/app/admin/area-testes/actions";
import { CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";

type AdminClient = {
  id: string;
  nome: string | null;
  slug: string;
};

type AdminTestAreaPageProps = {
  searchParams: Promise<{
    cliente?: string;
    session?: string;
  }>;
};

export default async function AdminTestAreaPage({
  searchParams,
}: AdminTestAreaPageProps) {
  const t = await getT();
  const { cliente, session } = await searchParams;
  const supabase = await createClient();
  const { data: clientsData, error: clientsError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug")
    .order("nome");

  if (clientsError) {
    throw new Error(t("Não foi possível buscar os clientes."));
  }

  const clients = (clientsData ?? []) as AdminClient[];
  const selectedClient = clients.find((client) => client.slug === cliente);

  const [
    { data: sessionsData, error: sessionsError },
    { data: workflowsData, error: workflowsError },
  ] = selectedClient
    ? await Promise.all([
        supabase
          .from("lexia_testes_sessoes")
          .select(
            "id, session_id, cliente_slug, origem, status, nome, criado_em",
          )
          .eq("cliente_slug", selectedClient.slug)
          .eq("origem", "painel_admin")
          .order("criado_em", { ascending: false }),
        supabase
          .from("lexia_workflows")
          .select("id, nome, tipo, webhook_url")
          .eq("cliente_slug", selectedClient.slug)
          .eq("status", "ativo")
          .order("nome"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (sessionsError) {
    throw new Error(t("Não foi possível buscar as sessões de teste."));
  }

  if (workflowsError) {
    throw new Error(t("Não foi possível buscar os workflows ativos."));
  }

  const sessions = (sessionsData ?? []) as AdminTestSession[];
  const workflows = (workflowsData ?? []) as AdminTestWorkflow[];
  const selectedSessionId =
    sessions.find((testSession) => testSession.session_id === session)
      ?.session_id ??
    sessions[0]?.session_id ??
    null;

  const { data: executionsData, error: executionsError } =
    selectedClient && selectedSessionId
      ? await supabase
          .from("lexia_testes_execucoes")
          .select(
            "id, run_id, session_id, cliente_slug, origem, mensagem_teste, mensagens, resposta_obtida, criado_em",
          )
          .eq("cliente_slug", selectedClient.slug)
          .eq("session_id", selectedSessionId)
          .eq("origem", "painel_admin")
          .order("criado_em", { ascending: true })
      : { data: [], error: null };

  if (executionsError) {
    throw new Error(t("Não foi possível buscar as mensagens da sessão."));
  }

  const nomeSelecionado = selectedClient
    ? (selectedClient.nome ?? selectedClient.slug)
    : null;

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        destaque={nomeSelecionado ?? undefined}
        resto={
          nomeSelecionado
            ? t("no simulador. Nada sai para clientes.")
            : t("Escolha o cliente para testar o agente.")
        }
        sobretitulo={t("Área de testes")}
        subtitulo={
          selectedClient
            ? sessions.length === 1
              ? t("1 conversa de teste")
              : t("{n} conversas de teste", { n: sessions.length })
            : undefined
        }
      />

      <FiltroTrilho
        opcoes={clients.map((client) => ({
          ativo: client.slug === selectedClient?.slug,
          href: `/admin/area-testes?cliente=${encodeURIComponent(client.slug)}`,
          label: client.nome ?? client.slug,
        }))}
        rotulo={t("Cliente")}
      />

      {!selectedClient ? (
        <div className="ds-bloco">
          <VazioTela
            texto={t("Escolha um cliente na barra acima.")}
            titulo={t("Selecione um cliente para iniciar o teste.")}
          />
        </div>
      ) : (
        <AdminTestChat
          clienteSlug={selectedClient.slug}
          executions={(executionsData ?? []) as AdminTestExecution[]}
          key={`${selectedClient.slug}:${selectedSessionId ?? "sem-sessao"}`}
          nomeCliente={nomeSelecionado ?? selectedClient.slug}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          workflows={workflows}
        />
      )}
    </section>
  );
}

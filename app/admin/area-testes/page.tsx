import Form from "next/form";

import { AdminTestChat } from "@/app/admin/area-testes/admin-test-chat";
import {
  type AdminTestExecution,
  type AdminTestSession,
  type AdminTestWorkflow,
} from "@/app/admin/area-testes/actions";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { requireLexiaAdmin } from "@/lib/auth/access-context";
import { createClient } from "@/lib/supabase/server";
import { listAdminTestWorkflows } from "@/lib/workflows/private-config";

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
  await requireLexiaAdmin();
  const { cliente, session } = await searchParams;
  const supabase = await createClient();
  const { data: clientsData, error: clientsError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug")
    .order("nome");

  if (clientsError) {
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clients = (clientsData ?? []) as AdminClient[];
  const selectedClient = clients.find((client) => client.slug === cliente);

  const [
    { data: sessionsData, error: sessionsError },
    workflows,
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
        listAdminTestWorkflows(selectedClient.slug),
      ])
    : [
        { data: [], error: null },
        [],
      ];

  if (sessionsError) {
    throw new Error("Não foi possível buscar as sessões de teste.");
  }

  const sessions = (sessionsData ?? []) as AdminTestSession[];
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
    throw new Error("Não foi possível buscar as mensagens da sessão.");
  }

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Área de Testes</h1>
        <p className="mt-2 text-zinc-600">
          Teste o workflow de qualquer cliente da Lexia.
        </p>
      </div>

      <Form
        action="/admin/area-testes"
        className="flex flex-wrap items-end gap-3"
        replace
        scroll={false}
      >
        <div className="flex min-w-72 flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="cliente">
            Cliente
          </label>
          <select
            className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
            defaultValue={selectedClient?.slug ?? ""}
            id="cliente"
            name="cliente"
          >
            <option value="">Selecione um cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.slug}>
                {client.nome ?? client.slug} ({client.slug})
              </option>
            ))}
          </select>
        </div>
        <FormSubmitButton
          className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          pendingLabel="Selecionando..."
        >
          Selecionar
        </FormSubmitButton>
      </Form>

      {!selectedClient ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          Selecione um cliente para iniciar o teste.
        </div>
      ) : (
        <AdminTestChat
          clienteSlug={selectedClient.slug}
          executions={(executionsData ?? []) as AdminTestExecution[]}
          key={`${selectedClient.slug}:${selectedSessionId ?? "sem-sessao"}`}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          workflows={workflows as AdminTestWorkflow[]}
        />
      )}
    </section>
  );
}

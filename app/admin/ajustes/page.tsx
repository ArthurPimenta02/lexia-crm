import Form from "next/form";
import { redirect } from "next/navigation";

import {
  createAgentAdjustment,
  updateAgentAdjustment,
  updateAgentAdjustmentStatus,
} from "@/app/admin/ajustes/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ExpandableText } from "@/app/components/expandable-text";
import { parseFeedbackComentario } from "@/app/components/feedback-conversation-utils";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
import { createClient } from "@/lib/supabase/server";

type AdminAdjustmentsPageProps = {
  searchParams: Promise<{
    cliente?: string | string[];
    feedback?: string | string[];
    mensagem?: string | string[];
    modulo?: string | string[];
    status?: string | string[];
  }>;
};

type AdminClient = {
  id: string;
  nome: string | null;
  slug: string;
};

type AgentAdjustment = {
  id: string;
  cliente_slug: string;
  modulo: string;
  titulo: string | null;
  gatilho: string | null;
  comportamento_correto: string | null;
  prioridade: number | null;
  activo: boolean | null;
  origem_feedback_id: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

type FeedbackPrefill = {
  id: string;
  cliente_slug: string;
  avaliacao: string | null;
  mensagem_cliente: string | null;
  resposta_agente: string | null;
  comentario: string | null;
};

const moduleFilters = [
  { label: "Todos", value: "" },
  { label: "geral", value: "geral" },
  { label: "detailing", value: "detailing" },
  { label: "venda_veiculo", value: "venda_veiculo" },
  { label: "indefinido", value: "indefinido" },
];
const allowedModules = moduleFilters.map((item) => item.value).filter(Boolean);

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatLabel(value: string | null) {
  if (!value) {
    return "Sem valor";
  }

  return value.replaceAll("_", " ");
}

function getStatusMessage(status: string, mensagem: string) {
  if (status === "criado") {
    return "Ajuste criado com sucesso.";
  }

  if (status === "actualizado") {
    return "Ajuste actualizado com sucesso.";
  }

  if (status === "erro") {
    return mensagem || "Não foi possível guardar o ajuste.";
  }

  return "";
}

function getFeedbackTitle(feedback: FeedbackPrefill | null) {
  if (!feedback) {
    return "";
  }

  const parsed = parseFeedbackComentario(feedback.comentario);
  const category = parsed.categoria ?? formatLabel(feedback.avaliacao);

  return `Ajuste: ${category}`.slice(0, 120);
}

function getFeedbackBehavior(feedback: FeedbackPrefill | null) {
  if (!feedback) {
    return "";
  }

  const parsed = parseFeedbackComentario(feedback.comentario);

  return (
    parsed.observacao || feedback.comentario || feedback.resposta_agente || ""
  );
}

function AdjustmentForm({
  action,
  clients,
  defaultValues,
  title,
}: {
  action: (formData: FormData) => void | Promise<void>;
  clients: AdminClient[];
  defaultValues: {
    cliente_slug: string;
    modulo: string;
    titulo: string;
    gatilho: string;
    comportamento_correto: string;
    prioridade: number;
    activo: boolean;
    origem_feedback_id: string;
  };
  title: string;
}) {
  /*
   * O `*:min-w-0` não é decoração: sem ele este formulário rebenta o cartão
   * no telemóvel.
   *
   * Um item de grelha tem `min-width: auto`, ou seja, recusa-se a encolher
   * abaixo do seu conteúdo mínimo. O conteúdo mínimo de um `<select>` é a
   * sua opção mais comprida — aqui "Detail by Cordeiro (detail_by_cordeiro)"
   * — e isso empurrava os campos todos para fora da borda a 375px. Pôr o
   * mínimo a zero nos filhos directos deixa-os seguir a largura do cartão.
   */
  return (
    <form action={action} className="grid gap-4 *:min-w-0">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="grid gap-4 *:min-w-0 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
          Cliente
          <select
            className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={defaultValues.cliente_slug}
            name="cliente_slug"
            required
          >
            <option value="">Seleccione um cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.slug}>
                {client.nome ?? client.slug} ({client.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
          Módulo
          <select
            className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={defaultValues.modulo}
            name="modulo"
            required
          >
            {allowedModules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
        Título
        <input
          className="h-10 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
          defaultValue={defaultValues.titulo}
          name="titulo"
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
        Gatilho
        <textarea
          className="min-h-24 rounded-lg border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-foreground"
          defaultValue={defaultValues.gatilho}
          name="gatilho"
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
        Comportamento correcto
        <textarea
          className="min-h-28 rounded-lg border border-border-strong px-3 py-2 text-sm outline-none transition focus:border-foreground"
          defaultValue={defaultValues.comportamento_correto}
          name="comportamento_correto"
          required
        />
      </label>

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
          Prioridade
          <input
            className="h-10 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={defaultValues.prioridade}
            max={100}
            min={0}
            name="prioridade"
            required
            type="number"
          />
        </label>

        <label className="flex items-end gap-2 text-sm font-medium text-muted-foreground">
          <input
            className="h-4 w-4 rounded border-border-strong"
            defaultChecked={defaultValues.activo}
            name="activo"
            type="checkbox"
          />
          Activo
        </label>
      </div>

      {defaultValues.origem_feedback_id ? (
        <input
          name="origem_feedback_id"
          type="hidden"
          value={defaultValues.origem_feedback_id}
        />
      ) : null}

      <FormSubmitButton
        className="h-10 w-fit rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        pendingLabel="Guardando..."
      >
        Guardar ajuste
      </FormSubmitButton>
    </form>
  );
}

export default async function AdminAdjustmentsPage({
  searchParams,
}: AdminAdjustmentsPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const params = await searchParams;
  const selectedClient = getSearchValue(params.cliente);
  const requestedModule = getSearchValue(params.modulo);
  const selectedModule = allowedModules.includes(requestedModule)
    ? requestedModule
    : "";
  const feedbackId = getSearchValue(params.feedback);
  const status = getSearchValue(params.status);
  const message = getSearchValue(params.mensagem);
  const supabase = await createClient();

  const [
    { data: clientsData, error: clientsError },
    { data: feedbackData, error: feedbackError },
  ] = await Promise.all([
    supabase.from("lexia_clientes").select("id, nome, slug").order("nome"),
    feedbackId && selectedClient
      ? supabase
          .from("lexia_feedbacks")
          .select(
            "id, cliente_slug, avaliacao, mensagem_cliente, resposta_agente, comentario",
          )
          .eq("id", feedbackId)
          .eq("cliente_slug", selectedClient)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clientsError) {
    throw new Error("Não foi possível buscar os clientes.");
  }

  if (feedbackError) {
    throw new Error("Não foi possível buscar o feedback informado.");
  }

  const clients = (clientsData ?? []) as AdminClient[];
  const feedback = (feedbackData ?? null) as FeedbackPrefill | null;

  let adjustmentsQuery = supabase
    .from("lexia_ajustes_agente")
    .select(
      "id, cliente_slug, modulo, titulo, gatilho, comportamento_correto, prioridade, activo, origem_feedback_id, criado_em, atualizado_em",
    )
    .order("atualizado_em", { ascending: false });

  if (selectedClient) {
    adjustmentsQuery = adjustmentsQuery.eq("cliente_slug", selectedClient);
  }

  if (selectedModule) {
    adjustmentsQuery = adjustmentsQuery.eq("modulo", selectedModule);
  }

  const { data: adjustmentsData, error: adjustmentsError } =
    await adjustmentsQuery;

  if (adjustmentsError) {
    throw new Error("Não foi possível buscar os ajustes do agente.");
  }

  const adjustments = (adjustmentsData ?? []) as AgentAdjustment[];
  const statusMessage = getStatusMessage(status, message);
  const defaultClient = feedback?.cliente_slug ?? selectedClient;
  const createDefaults = {
    cliente_slug: defaultClient,
    modulo: selectedModule || "geral",
    titulo: getFeedbackTitle(feedback),
    gatilho: feedback?.mensagem_cliente ?? "",
    comportamento_correto: getFeedbackBehavior(feedback),
    prioridade: 50,
    activo: true,
    origem_feedback_id: feedback?.id ?? "",
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo="Ajustes do agente" />

      {statusMessage ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            status === "erro"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {statusMessage}
        </div>
      ) : null}

      <Form
        action="/admin/ajustes"
        className="rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        {/* Mesmo motivo do formulário de baixo: a opção mais comprida do
            selector de cliente alargava a coluna para lá do cartão. */}
        <div className="grid gap-4 *:min-w-0 md:grid-cols-[1fr_220px_auto]">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="cliente"
            >
              Cliente
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={selectedClient}
              id="cliente"
              name="cliente"
            >
              <option value="">Todos</option>
              {clients.map((client) => (
                <option key={client.id} value={client.slug}>
                  {client.nome ?? client.slug} ({client.slug})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="modulo"
            >
              Módulo
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={selectedModule}
              id="modulo"
              name="modulo"
            >
              {moduleFilters.map((module) => (
                <option key={module.label} value={module.value}>
                  {module.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <FormSubmitButton
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              pendingLabel="Filtrando..."
            >
              Filtrar
            </FormSubmitButton>
          </div>
        </div>
      </Form>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <AdjustmentForm
          action={createAgentAdjustment}
          clients={clients}
          defaultValues={createDefaults}
          title="Novo ajuste"
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Ajustes registados</h2>
        </div>

        {adjustments.length > 0 ? (
          <div className="divide-y divide-border">
            {adjustments.map((adjustment) => (
              <article className="px-5 py-5" key={adjustment.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {adjustment.modulo}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          adjustment.activo
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {adjustment.activo ? "Activo" : "Inactivo"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Prioridade {adjustment.prioridade ?? 0}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground">
                      {adjustment.titulo ?? "Sem título"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {adjustment.cliente_slug}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ConfirmActionButton
                      action={updateAgentAdjustmentStatus.bind(
                        null,
                        adjustment.id,
                        !adjustment.activo,
                      )}
                      className="h-9 rounded-lg border border-border-strong px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                      confirmMessage={
                        adjustment.activo
                          ? "Desactivar este ajuste?"
                          : "Activar este ajuste?"
                      }
                    >
                      {adjustment.activo ? "Desactivar" : "Activar"}
                    </ConfirmActionButton>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground/60">
                      Gatilho
                    </p>
                    <div className="mt-1 text-sm text-muted-foreground">
                      <ExpandableText
                        emptyText="Sem gatilho"
                        text={adjustment.gatilho}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground/60">
                      Comportamento correcto
                    </p>
                    <div className="mt-1 text-sm text-muted-foreground">
                      <ExpandableText
                        emptyText="Sem comportamento"
                        text={adjustment.comportamento_correto}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground/60">
                  <span>
                    Criado em{" "}
                    {formatDateInTimezone(
                      adjustment.criado_em,
                      getClientTimezone(adjustment.cliente_slug),
                    )}
                  </span>
                  <span>
                    Actualizado em{" "}
                    {formatDateInTimezone(
                      adjustment.atualizado_em,
                      getClientTimezone(adjustment.cliente_slug),
                    )}
                  </span>
                  {adjustment.origem_feedback_id ? (
                    <span>Feedback: {adjustment.origem_feedback_id}</span>
                  ) : null}
                </div>

                <details className="mt-4 rounded-2xl border border-border bg-surface-muted p-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Editar ajuste
                  </summary>
                  <div className="mt-4">
                    <AdjustmentForm
                      action={updateAgentAdjustment.bind(null, adjustment.id)}
                      clients={clients}
                      defaultValues={{
                        cliente_slug: adjustment.cliente_slug,
                        modulo: adjustment.modulo,
                        titulo: adjustment.titulo ?? "",
                        gatilho: adjustment.gatilho ?? "",
                        comportamento_correto:
                          adjustment.comportamento_correto ?? "",
                        prioridade: adjustment.prioridade ?? 0,
                        activo: Boolean(adjustment.activo),
                        origem_feedback_id: adjustment.origem_feedback_id ?? "",
                      }}
                      title="Editar ajuste"
                    />
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Ainda não há ajustes registados para este cliente.
          </div>
        )}
      </section>
    </section>
  );
}

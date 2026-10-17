import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { TechnicalDetailsModal } from "@/app/admin/execucoes/technical-details-modal";
import { ExpandableText } from "@/app/components/expandable-text";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
import { createClient } from "@/lib/supabase/server";

type AdminExecutionsPageProps = {
  searchParams: Promise<{
    cliente?: string | string[];
    rota?: string | string[];
    estado?: string | string[];
  }>;
};

type AdminTestExecution = {
  id: string;
  cliente_slug: string;
  session_id: string | null;
  run_id: string | null;
  teste_id: string | null;
  criado_em: string | null;
  origem: string | null;
  rota: string | null;
  mensagem_teste: string | null;
  resposta_obtida: string | null;
  mensagens: unknown;
  raw_agente: unknown;
  raw_contexto: unknown;
  raw_handoff: unknown;
  erro: string | null;
};

type ExecutionOptions = {
  cliente_slug: string | null;
};

const routeFilters = [
  { label: "Todas", value: "" },
  { label: "indefinido", value: "indefinido" },
  { label: "detailing", value: "detailing" },
  { label: "venda_veiculo", value: "venda_veiculo" },
  { label: "venda_fotos_indefinido", value: "venda_fotos_indefinido" },
  { label: "venda_fotos", value: "venda_fotos" },
  { label: "handoff_detailing", value: "handoff_detailing" },
  { label: "handoff_venda", value: "handoff_venda" },
];
const routeValues = routeFilters.map((item) => item.value).filter(Boolean);
const stateFilters = ["todas", "sucesso", "erro"];

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getUniqueClients(rows: ExecutionOptions[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.cliente_slug)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function hasError(execution: Pick<AdminTestExecution, "erro">) {
  return Boolean(execution.erro?.trim());
}

function formatLabel(value: string | null) {
  if (!value) {
    return "Sem valor";
  }

  return value.replaceAll("_", " ");
}

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

function stringifyRaw(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getAgentResponseText(execution: AdminTestExecution) {
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

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "green" | "neutral" | "red";
}) {
  /*
   * Só duas cores, e ambas respondem à pergunta que traz alguém a este ecrã:
   * correu bem ou rebentou. A rota e a origem eram azul e violeta sem
   * dizerem nada com isso — o texto da etiqueta já as distingue.
   */
  const classes = {
    green: "border-border bg-muted text-positive",
    neutral: "border-border bg-muted text-muted-foreground",
    red: "border-border bg-muted text-danger",
  };

  return (
    <span
      className={`inline-flex max-w-full rounded-full border px-2 py-1 text-xs font-medium ${classes[tone]}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

export default async function AdminExecutionsPage({
  searchParams,
}: AdminExecutionsPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const params = await searchParams;
  const selectedCliente = getSearchValue(params.cliente);
  const requestedRota = getSearchValue(params.rota);
  const selectedRota = routeValues.includes(requestedRota) ? requestedRota : "";
  const requestedEstado = getSearchValue(params.estado);
  const selectedEstado = stateFilters.includes(requestedEstado)
    ? requestedEstado
    : "todas";

  const supabase = await createClient();
  const [
    { data: optionsData, error: optionsError },
    { data: executionsData, error: executionsError },
  ] = await Promise.all([
    supabase
      .from("lexia_testes_execucoes")
      .select("cliente_slug")
      .order("cliente_slug"),
    (() => {
      let query = supabase
        .from("lexia_testes_execucoes")
        .select(
          "id, cliente_slug, session_id, run_id, teste_id, criado_em, origem, rota, mensagem_teste, resposta_obtida, mensagens, raw_agente, raw_contexto, raw_handoff, erro",
        )
        .order("criado_em", { ascending: false });

      if (selectedCliente) {
        query = query.eq("cliente_slug", selectedCliente);
      }

      if (selectedRota) {
        query = query.eq("rota", selectedRota);
      }

      return query;
    })(),
  ]);

  if (optionsError) {
    throw new Error("Não foi possível buscar as opções de filtro.");
  }

  if (executionsError) {
    throw new Error("Não foi possível buscar as execuções de teste.");
  }

  const clientes = getUniqueClients((optionsData ?? []) as ExecutionOptions[]);
  const executions = ((executionsData ?? []) as AdminTestExecution[]).filter(
    (execution) => {
      if (selectedEstado === "erro") {
        return hasError(execution);
      }

      if (selectedEstado === "sucesso") {
        return !hasError(execution);
      }

      return true;
    },
  );

  const summaryCards = [
    { title: "Total de execuções", value: executions.length },
    {
      title: "Sucesso",
      value: executions.filter((item) => !hasError(item)).length,
    },
    { title: "Erro", value: executions.filter(hasError).length },
    {
      title: "Painel cliente",
      value: executions.filter(
        (execution) => execution.origem === "painel_cliente",
      ).length,
    },
  ];

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho
        acoes={
          <Link
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
            href="/admin/area-testes"
          >
            Executar novo teste
          </Link>
        }
        titulo="Execuções"
      />

      <GrupoMetricas
        itens={summaryCards.map((card) => ({
          label: card.title,
          valor: card.value,
        }))}
      />

      <Form
        action="/admin/execucoes"
        className="rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_auto_auto]">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="cliente"
            >
              Cliente
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={selectedCliente}
              id="cliente"
              name="cliente"
            >
              <option value="">Todos</option>
              {clientes.map((cliente) => (
                <option key={cliente} value={cliente}>
                  {cliente}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="rota"
            >
              Rota
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={selectedRota}
              id="rota"
              name="rota"
            >
              {routeFilters.map((rota) => (
                <option key={rota.label} value={rota.value}>
                  {rota.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="estado"
            >
              Estado
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={selectedEstado}
              id="estado"
              name="estado"
            >
              <option value="todas">Todas</option>
              <option value="sucesso">Sucesso</option>
              <option value="erro">Erro</option>
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

          <div className="flex items-end">
            <Link
              className="flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted"
              href="/admin/execucoes"
            >
              Limpar
            </Link>
          </div>
        </div>
      </Form>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {executions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="w-[110px] border-b border-border px-3 py-3 font-medium">
                    Data
                  </th>
                  <th className="w-[140px] border-b border-border px-3 py-3 font-medium">
                    Cliente
                  </th>
                  <th className="w-[130px] border-b border-border px-3 py-3 font-medium">
                    Rota
                  </th>
                  <th className="w-[130px] border-b border-border px-3 py-3 font-medium">
                    Origem
                  </th>
                  <th className="w-[220px] border-b border-border px-3 py-3 font-medium">
                    Mensagem enviada
                  </th>
                  <th className="w-[260px] border-b border-border px-3 py-3 font-medium">
                    Resposta obtida
                  </th>
                  <th className="w-[120px] border-b border-border px-3 py-3 font-medium">
                    Estado
                  </th>
                  <th className="w-[170px] border-b border-border px-3 py-3 font-medium">
                    Sessão
                  </th>
                  <th className="w-[170px] border-b border-border px-3 py-3 font-medium">
                    Detalhes
                  </th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr className="border-b border-border" key={execution.id}>
                    <td className="break-words px-3 py-4 align-top text-muted-foreground">
                      {formatDateInTimezone(
                        execution.criado_em,
                        getClientTimezone(execution.cliente_slug),
                      )}
                    </td>
                    <td className="break-words px-3 py-4 align-top font-medium text-foreground">
                      {execution.cliente_slug}
                    </td>
                    <td className="px-3 py-4 align-top">
                      <Badge>{execution.rota ?? "Sem rota"}</Badge>
                    </td>
                    <td className="px-3 py-4 align-top">
                      <Badge>{formatLabel(execution.origem)}</Badge>
                    </td>
                    <td className="break-words px-3 py-4 align-top text-muted-foreground">
                      <ExpandableText
                        emptyText="Sem mensagem"
                        maxLength={100}
                        text={execution.mensagem_teste}
                      />
                    </td>
                    <td className="break-words px-3 py-4 align-top text-muted-foreground">
                      <ExpandableText
                        emptyText="Sem resposta"
                        maxLength={120}
                        text={getAgentResponseText(execution)}
                      />
                    </td>
                    <td className="px-3 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Badge tone={hasError(execution) ? "red" : "green"}>
                          {hasError(execution) ? "Erro" : "Sucesso"}
                        </Badge>
                        {hasError(execution) ? (
                          <div className="text-xs text-muted-foreground">
                            <ExpandableText
                              emptyText="Sem erro"
                              maxLength={60}
                              text={execution.erro}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {/*
                      Uma linha por identificador, cortada no fim.
                      Três UUIDs a partir-se letra a letra davam 249px de
                      altura à linha inteira, mais do que a resposta do agente,
                      que é o que se vem aqui ler. O valor completo fica no
                      `title` e nos detalhes técnicos da coluna ao lado.
                    */}
                    <td className="px-3 py-4 align-top font-mono text-xs text-muted-foreground">
                      <p
                        className="truncate"
                        title={execution.session_id ?? ""}
                      >
                        {execution.session_id ?? "Sem session_id"}
                      </p>
                      {execution.run_id ? (
                        <p
                          className="mt-1.5 truncate text-muted-foreground/60"
                          title={execution.run_id}
                        >
                          run: {execution.run_id}
                        </p>
                      ) : null}
                      {execution.teste_id ? (
                        <p
                          className="mt-1.5 truncate text-muted-foreground/60"
                          title={execution.teste_id}
                        >
                          teste: {execution.teste_id}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 align-top">
                      <TechnicalDetailsModal
                        rawAgente={stringifyRaw(execution.raw_agente)}
                        rawContexto={stringifyRaw(execution.raw_contexto)}
                        rawHandoff={stringifyRaw(execution.raw_handoff)}
                        runId={execution.run_id}
                        sessionId={execution.session_id}
                        testeId={execution.teste_id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Ainda não há execuções registadas.
          </div>
        )}
      </div>
    </section>
  );
}

import { redirect } from "next/navigation";

import {
  Building2,
  ChevronDown,
  Clock,
  Pencil,
  Plus,
  SlidersHorizontal,
} from "lucide-react";

import {
  createAgentAdjustment,
  updateAgentAdjustment,
  updateAgentAdjustmentStatus,
} from "@/app/admin/ajustes/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ExpandableText } from "@/app/components/expandable-text";
import { parseFeedbackComentario } from "@/app/components/feedback-conversation-utils";
import { CartaoMetrica } from "@/app/components/cartoes";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import {
  AvisoLinha,
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

function formatLabel(value: string | null, t: FuncaoT) {
  if (!value) {
    return t("Sem valor");
  }

  return value.replaceAll("_", " ");
}

function getStatusMessage(status: string, mensagem: string, t: FuncaoT) {
  if (status === "criado") {
    return t("Ajuste criado com sucesso.");
  }

  if (status === "actualizado") {
    return t("Ajuste atualizado com sucesso.");
  }

  if (status === "erro") {
    return mensagem || t("Não foi possível salvar o ajuste.");
  }

  return "";
}

function getFeedbackTitle(feedback: FeedbackPrefill | null, t: FuncaoT) {
  if (!feedback) {
    return "";
  }

  const parsed = parseFeedbackComentario(feedback.comentario);
  const category = parsed.categoria ?? formatLabel(feedback.avaliacao, t);

  return t("Ajuste: {categoria}", { categoria: category }).slice(0, 120);
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
  t,
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
  t: FuncaoT;
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
      <div className="grid gap-4 *:min-w-0 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
          {t("Cliente")}
          <select
            className="ds-campo"
            defaultValue={defaultValues.cliente_slug}
            name="cliente_slug"
            required
          >
            <option value="">{t("Selecione um cliente")}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.slug}>
                {client.nome ?? client.slug} ({client.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
          {t("Módulo")}
          <select
            className="ds-campo"
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

      <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
        {t("Título")}
        <input
          className="ds-campo"
          defaultValue={defaultValues.titulo}
          name="titulo"
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
        {t("Gatilho")}
        <textarea
          className="ds-campo min-h-24"
          style={{ paddingBlock: "0.5rem" }}
          defaultValue={defaultValues.gatilho}
          name="gatilho"
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
        {t("Comportamento correto")}
        <textarea
          className="ds-campo min-h-28"
          style={{ paddingBlock: "0.5rem" }}
          defaultValue={defaultValues.comportamento_correto}
          name="comportamento_correto"
          required
        />
      </label>

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <label className="flex flex-col gap-2 text-[0.8125rem] font-medium text-foreground">
          {t("Prioridade")}
          <input
            className="ds-campo"
            defaultValue={defaultValues.prioridade}
            max={100}
            min={0}
            name="prioridade"
            required
            type="number"
          />
        </label>

        <label className="flex h-10 cursor-pointer items-center gap-2 self-end text-sm font-medium text-foreground">
          <input
            className="h-4 w-4 rounded border-border-strong accent-primary"
            defaultChecked={defaultValues.activo}
            name="activo"
            type="checkbox"
          />
          {t("Ativo")}
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
        className="ds-botao ds-botao-primario w-fit"
        pendingLabel={t("Salvando...")}
      >
        {t("Salvar ajuste")}
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
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const formatDateInTimezone = (date: string | null, zona: string) =>
    date
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: zona,
        }).format(new Date(date))
      : t("Sem data");
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
  const statusMessage = getStatusMessage(status, message, t);
  const defaultClient = feedback?.cliente_slug ?? selectedClient;
  const createDefaults = {
    cliente_slug: defaultClient,
    modulo: selectedModule || "geral",
    titulo: getFeedbackTitle(feedback, t),
    gatilho: feedback?.mensagem_cliente ?? "",
    comportamento_correto: getFeedbackBehavior(feedback),
    prioridade: 50,
    activo: true,
    origem_feedback_id: feedback?.id ?? "",
  };

  const ativos = adjustments.filter((a) => a.activo).length;
  const nomeDoCliente = (slug: string) =>
    clients.find((c) => c.slug === slug)?.nome ?? slug;
  const filtroHref = (cliente: string, modulo: string) => {
    const q = new URLSearchParams();
    if (cliente) q.set("cliente", cliente);
    if (modulo) q.set("modulo", modulo);
    const texto = q.toString();
    return texto ? `/admin/ajustes?${texto}` : "/admin/ajustes";
  };
  const abrirNovo = Boolean(feedback) || adjustments.length === 0;

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <a className="ds-botao ds-botao-primario ds-botao-p" href="#novo-ajuste">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t("Novo ajuste")}
          </a>
        }
        destaque={
          ativos > 0
            ? ativos === 1
              ? t("1 ajuste ativo")
              : t("{n} ajustes ativos", { n: ativos })
            : undefined
        }
        resto={ativos > 0 ? t("corrigindo o agente.") : t("Nenhum ajuste ativo.")}
        sobretitulo={`${t("Ajustes do agente")} · ${
          selectedClient ? nomeDoCliente(selectedClient) : t("Todos os clientes")
        }`}
      />

      {statusMessage ? (
        <AvisoLinha tom={status === "erro" ? "perigo" : "info"}>{statusMessage}</AvisoLinha>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FiltroTrilho
          opcoes={[
            { slug: "", nome: t("Todos") },
            ...clients.map((c) => ({ slug: c.slug, nome: c.nome ?? c.slug })),
          ].map((c) => ({
            ativo: c.slug === selectedClient,
            href: filtroHref(c.slug, selectedModule),
            label: c.nome,
          }))}
          rotulo={t("Cliente")}
        />
        <FiltroTrilho
          opcoes={moduleFilters.map((m) => ({
            ativo: m.value === selectedModule,
            href: filtroHref(selectedClient, m.value),
            label: m.value ? m.label : t("Todos os módulos"),
          }))}
          rotulo={t("Módulo")}
        />
      </div>

      {adjustments.length > 0 ? (
        <GradeMetricas colunas={3}>
          <CartaoMetrica
            cor="var(--ds-acao)"
            icone={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
            nota={
              adjustments.length - ativos > 0
                ? t("{n} inativos", { n: adjustments.length - ativos })
                : undefined
            }
            rotulo={t("Ajustes registrados")}
            valor={String(adjustments.length)}
          />
          <CartaoMetrica
            cor="var(--ds-info)"
            icone={<Building2 aria-hidden="true" className="h-4 w-4" />}
            rotulo={t("Clientes com ajuste")}
            valor={String(new Set(adjustments.map((a) => a.cliente_slug)).size)}
          />
          <CartaoMetrica
            cor="var(--ds-ouro)"
            icone={<Clock aria-hidden="true" className="h-4 w-4" />}
            nota={nomeDoCliente(adjustments[0].cliente_slug)}
            rotulo={t("Última atualização")}
            valor={
              adjustments[0].atualizado_em
                ? new Intl.DateTimeFormat(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: getClientTimezone(adjustments[0].cliente_slug),
                  }).format(new Date(adjustments[0].atualizado_em))
                : "--"
            }
          />
        </GradeMetricas>
      ) : null}

      <details className="ds-bloco group scroll-mt-6" id="novo-ajuste" open={abrirNovo}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <Plus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <span className="ds-titulo-3 flex-1 text-foreground">{t("Novo ajuste")}</span>
          {feedback ? (
            <span className="ds-selo ds-selo-ouro">{t("a partir de um feedback")}</span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="px-5 pb-5">
          <AdjustmentForm
            action={createAgentAdjustment}
            clients={clients}
            defaultValues={createDefaults}
            t={t}
          />
        </div>
      </details>

      <section className="ds-bloco min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          <h2 className="ds-titulo-3 flex-1 text-foreground">{t("Ajustes registrados")}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{adjustments.length}</span>
        </div>

        {adjustments.length > 0 ? (
          <div className="tela-lista px-1.5 pb-2">
            {adjustments.map((adjustment) => (
              <article className="tela-linha items-start" key={adjustment.id}>
                <span
                  className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    adjustment.activo
                      ? "bg-[var(--ds-acao-fundo)] text-[var(--ds-acao-forte)]"
                      : "bg-[color-mix(in_oklab,var(--ds-texto)_6%,transparent)] text-muted-foreground"
                  }`}
                >
                  <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        {adjustment.titulo ?? t("Sem título")}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`ds-selo ds-selo-ponto ${
                            adjustment.activo ? "ds-selo-verde" : "ds-selo-neutro"
                          }`}
                        >
                          {adjustment.activo ? t("Ativo") : t("Inativo")}
                        </span>
                        <span className="ds-selo ds-selo-neutro">{adjustment.modulo}</span>
                        <span className="ds-selo ds-selo-neutro tabular-nums">
                          {t("Prioridade {n}", { n: adjustment.prioridade ?? 0 })}
                        </span>
                        {!selectedClient ? (
                          <span className="text-xs text-muted-foreground">
                            {nomeDoCliente(adjustment.cliente_slug)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ConfirmActionButton
                      action={updateAgentAdjustmentStatus.bind(
                        null,
                        adjustment.id,
                        !adjustment.activo,
                      )}
                      className="ds-botao ds-botao-secundario ds-botao-p w-fit shrink-0"
                      confirmMessage={
                        adjustment.activo
                          ? t("Desativar este ajuste?")
                          : t("Ativar este ajuste?")
                      }
                    >
                      {adjustment.activo ? t("Desativar") : t("Ativar")}
                    </ConfirmActionButton>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[12px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)] px-3 py-2.5">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t("Gatilho")}
                      </p>
                      <div className="mt-1 text-sm text-foreground">
                        <ExpandableText
                          emptyText={t("Sem gatilho")}
                          text={adjustment.gatilho}
                        />
                      </div>
                    </div>
                    <div className="rounded-[12px] bg-[var(--ds-acao-fundo)] px-3 py-2.5">
                      <p className="text-xs font-semibold text-[var(--ds-acao-forte)]">
                        {t("Comportamento correto")}
                      </p>
                      <div className="mt-1 text-sm text-foreground">
                        <ExpandableText
                          emptyText={t("Sem comportamento")}
                          text={adjustment.comportamento_correto}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("Criado em {data}", {
                        data: formatDateInTimezone(
                          adjustment.criado_em,
                          getClientTimezone(adjustment.cliente_slug),
                        ),
                      })}
                    </span>
                    <span>
                      {t("Atualizado em {data}", {
                        data: formatDateInTimezone(
                          adjustment.atualizado_em,
                          getClientTimezone(adjustment.cliente_slug),
                        ),
                      })}
                    </span>
                    {adjustment.origem_feedback_id ? (
                      <span className="truncate">
                        {t("Feedback: {id}", { id: adjustment.origem_feedback_id })}
                      </span>
                    ) : null}
                  </div>

                  <details className="group/editar mt-2">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      {t("Editar ajuste")}
                    </summary>
                    <div className="mt-3 rounded-[14px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)] p-4">
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
                        t={t}
                      />
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <VazioTela
            acao={
              <a className="ds-botao ds-botao-primario ds-botao-p" href="#novo-ajuste">
                {t("Novo ajuste")}
              </a>
            }
            texto={t("Quando o agente errar, registre aqui o que ele deve fazer.")}
            titulo={t("Ainda não há ajustes registrados para este cliente.")}
          />
        )}
      </section>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  ArrowUpRight,
  ChevronDown,
  FlaskConical,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Send,
  Star,
  Trash2,
  UserPlus,
  UserRound,
  Workflow,
} from "lucide-react";

import { textoLegivelDaMensagem } from "@/lib/conversations/message-display";

import {
  clearClientTestData,
  updateClientUserStatus,
} from "@/app/admin/clientes/[slug]/actions";
import { CartaoMetrica } from "@/app/components/cartoes";
import { ChannelIcon } from "@/app/components/channel-brand";
import { Barra } from "@/app/components/ds";
import {
  AvatarCanal,
  CabecalhoTela,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import { ClientUserForm } from "@/app/admin/clientes/[slug]/client-user-form";
import { ClientSettingsForm } from "@/app/admin/clientes/[slug]/settings-form";
import { FollowupsLongosBloco } from "@/app/admin/clientes/[slug]/followups-longos";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ExpandableText } from "@/app/components/expandable-text";
import {
  buildAdminConversationHref,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { createClient } from "@/lib/supabase/server";

type ClientDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type LexiaClient = {
  id: string;
  nome: string | null;
  slug: string;
  status: string | null;
  modo_teste: boolean | null;
  cor_principal: string | null;
};

type LexiaWorkflow = {
  id: string;
  nome: string | null;
  tipo: string | null;
  webhook_url: string | null;
  status: string | null;
};

type LatestExecution = {
  id: string;
  criado_em: string | null;
  origem: string | null;
  rota: string | null;
  mensagem_teste: string | null;
  mensagens: unknown;
  resposta_obtida: string | null;
};

type LatestFeedback = {
  id: string;
  criado_em: string | null;
  avaliacao: string | null;
  mensagem_cliente: string | null;
  resposta_agente: string | null;
  comentario: string | null;
  status: string | null;
};

type LatestHandoff = {
  id: string;
  criado_em: string | null;
  nome_contacto: string | null;
  motivo: string | null;
  prioridade: string | null;
  status: string | null;
};

type ClientUser = {
  user_id: string;
  role: string | null;
  status: string | null;
  criado_em: string | null;
};

type ConversationContact = {
  id: string;
  canal: string | null;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
  atualizado_em: string | null;
};

type ConversationMessage = {
  id: string;
  identificador_conversa: string;
  direccao: string | null;
  tipo: string | null;
  conteudo: string | null;
  criado_em: string | null;
};

function formatLabel(value: string | null, t: FuncaoT) {
  if (!value) {
    return t("Sem valor");
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

function getAgentResponseText(execution: LatestExecution) {
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
      // Mensagens em texto simples seguem para o tratamento abaixo.
    }
  }

  return stringifyMessage(source) || fallback.join("\n\n");
}

async function getCount(table: string, clienteSlug: string, status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("cliente_slug", clienteSlug);

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Não foi possível buscar contagem em ${table}.`);
  }

  return count ?? 0;
}

async function getRealCount(
  table: "lexia_contactos" | "lexia_mensagens",
  clienteSlug: string,
  filters?: {
    canal?: string;
    direccao?: string;
  },
) {
  const supabase = await createClient();
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("cliente_slug", clienteSlug)
    .not("identificador_conversa", "like", "teste:%");

  if (filters?.canal && table === "lexia_contactos") {
    query = query.eq("canal", filters.canal);
  }

  if (filters?.direccao && table === "lexia_mensagens") {
    query = query.eq("direccao", filters.direccao);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Não foi possível buscar contagem real em ${table}.`);
  }

  return count ?? 0;
}

function getMessagePreview(
  message: ConversationMessage | null | undefined,
  t: FuncaoT,
) {
  if (!message) {
    return t("Sem mensagens registradas.");
  }

  if (message.tipo === "imagem") {
    return t("Imagem");
  }

  return textoLegivelDaMensagem(message.conteudo) || t("Sem conteúdo.");
}

/** Um bloco da ficha: título, legenda pequena e, à direita, um extra. */
function Bloco({
  children,
  extra,
  legenda,
  titulo,
}: {
  children: ReactNode;
  extra?: ReactNode;
  legenda?: ReactNode;
  titulo: ReactNode;
}) {
  return (
    <section className="ds-bloco min-w-0 overflow-hidden">
      <div className="flex min-h-14 items-center gap-2 px-5 pt-4 pb-2">
        <h2 className="ds-titulo-3 min-w-0 flex-1 truncate text-foreground">
          {titulo}
          {legenda ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{legenda}</span>
          ) : null}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const { slug } = await params;
  const timeZone = getClientTimezone(slug);
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
  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug, status, modo_teste, cor_principal")
    .eq("slug", slug)
    .maybeSingle();

  if (clientError) {
    throw new Error("Não foi possível buscar o cliente.");
  }

  if (!client) {
    return (
      <section className="ds-bloco flex w-full min-w-0 flex-col">
        <VazioTela
          acao={
            <Link className="ds-botao ds-botao-primario ds-botao-p" href="/admin">
              {t("Voltar ao dashboard")}
            </Link>
          }
          titulo={t("Cliente não encontrado.")}
        />
      </section>
    );
  }

  const clientData = client as LexiaClient;

  const [
    { data: workflowsData, error: workflowsError },
    sessoesCount,
    execucoesCount,
    feedbacksPendentes,
    handoffsPendentes,
    totalConversas,
    whatsappConversas,
    messengerConversas,
    instagramConversas,
    mensagensRecebidas,
    mensagensEnviadas,
    { data: latestExecutionsData, error: latestExecutionsError },
    { data: latestFeedbacksData, error: latestFeedbacksError },
    { data: latestHandoffsData, error: latestHandoffsError },
    { data: latestContactsData, error: latestContactsError },
    { data: clientUsersData, error: clientUsersError },
  ] = await Promise.all([
    supabase
      .from("lexia_workflows")
      .select("id, nome, tipo, webhook_url, status")
      .eq("cliente_slug", clientData.slug)
      .order("nome"),
    getCount("lexia_testes_sessoes", clientData.slug),
    getCount("lexia_testes_execucoes", clientData.slug),
    getCount("lexia_feedbacks", clientData.slug, "pendente"),
    getCount("lexia_handoffs", clientData.slug, "pendente"),
    getRealCount("lexia_contactos", clientData.slug),
    getRealCount("lexia_contactos", clientData.slug, { canal: "whatsapp" }),
    getRealCount("lexia_contactos", clientData.slug, { canal: "messenger" }),
    getRealCount("lexia_contactos", clientData.slug, { canal: "instagram" }),
    getRealCount("lexia_mensagens", clientData.slug, { direccao: "recebida" }),
    getRealCount("lexia_mensagens", clientData.slug, { direccao: "enviada" }),
    supabase
      .from("lexia_testes_execucoes")
      .select(
        "id, criado_em, origem, rota, mensagem_teste, mensagens, resposta_obtida",
      )
      .eq("cliente_slug", clientData.slug)
      .order("criado_em", { ascending: false })
      .limit(5),
    supabase
      .from("lexia_feedbacks")
      .select(
        "id, criado_em, avaliacao, mensagem_cliente, resposta_agente, comentario, status",
      )
      .eq("cliente_slug", clientData.slug)
      .order("criado_em", { ascending: false })
      .limit(5),
    supabase
      .from("lexia_handoffs")
      .select("id, criado_em, nome_contacto, motivo, prioridade, status")
      .eq("cliente_slug", clientData.slug)
      .order("criado_em", { ascending: false })
      .limit(5),
    supabase
      .from("lexia_contactos")
      .select(
        "id, canal, identificador_conversa, nome, telefone, atualizado_em",
      )
      .eq("cliente_slug", clientData.slug)
      .not("identificador_conversa", "like", "teste:%")
      .order("atualizado_em", { ascending: false })
      .limit(5),
    supabase
      .from("lexia_usuarios_clientes")
      .select("user_id, role, status, criado_em")
      .eq("cliente_slug", clientData.slug)
      .order("criado_em", { ascending: false }),
  ]);

  if (workflowsError) {
    throw new Error("Não foi possível buscar os workflows.");
  }

  if (latestExecutionsError) {
    throw new Error("Não foi possível buscar as últimas execuções.");
  }

  if (latestFeedbacksError) {
    throw new Error("Não foi possível buscar os últimos feedbacks.");
  }

  if (latestHandoffsError) {
    throw new Error("Não foi possível buscar os últimos handoffs.");
  }

  if (latestContactsError) {
    throw new Error("Não foi possível buscar as últimas conversas.");
  }

  if (clientUsersError) {
    throw new Error("Não foi possível buscar os usuários do cliente.");
  }

  const workflows = (workflowsData ?? []) as LexiaWorkflow[];
  const activeWorkflows = workflows.filter(
    (workflow) => workflow.status === "ativo",
  );
  const activeWorkflow = activeWorkflows[0] ?? null;
  const editableWorkflow = activeWorkflow ?? workflows[0] ?? null;
  const latestExecutions = (latestExecutionsData ?? []) as LatestExecution[];
  const latestFeedbacks = (latestFeedbacksData ?? []) as LatestFeedback[];
  const latestHandoffs = (latestHandoffsData ?? []) as LatestHandoff[];
  const latestContacts = (latestContactsData ?? []) as ConversationContact[];
  const clientUsers = (clientUsersData ?? []) as ClientUser[];
  const conversationIds = latestContacts.map(
    (contact) => contact.identificador_conversa,
  );
  const { data: latestMessagesData, error: latestMessagesError } =
    conversationIds.length > 0
      ? await supabase
          .from("lexia_mensagens")
          .select(
            "id, identificador_conversa, direccao, tipo, conteudo, criado_em",
          )
          .eq("cliente_slug", clientData.slug)
          .in("identificador_conversa", conversationIds)
          .order("criado_em", { ascending: true })
          .order("id", { ascending: true })
      : { data: [], error: null };

  if (latestMessagesError) {
    throw new Error("Não foi possível buscar previews das conversas.");
  }

  const latestMessages = (latestMessagesData ?? []) as ConversationMessage[];
  const lastMessageByConversation = new Map<string, ConversationMessage>();

  for (const message of latestMessages) {
    lastMessageByConversation.set(message.identificador_conversa, message);
  }

  const numero = new Intl.NumberFormat(locale);
  const pendentes = feedbacksPendentes + handoffsPendentes;
  const nomeCliente = clientData.nome ?? clientData.slug;
  const porCanal = [
    { canal: "whatsapp", nome: "WhatsApp", valor: whatsappConversas },
    { canal: "messenger", nome: "Messenger", valor: messengerConversas },
    { canal: "instagram", nome: "Instagram", valor: instagramConversas },
  ];
  const canaisComConversa = porCanal.filter((c) => c.valor > 0);
  const maiorCanal = Math.max(1, ...porCanal.map((c) => c.valor));
  const seloStatus =
    clientData.status === "ativo"
      ? { classe: "ds-selo-verde", texto: t("Ativo") }
      : clientData.status === "suspenso"
        ? { classe: "ds-selo-alerta", texto: t("Suspenso") }
        : clientData.status === "inativo"
          ? { classe: "ds-selo-neutro", texto: t("Inativo") }
          : null;

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <>
            <Link
              className="ds-botao ds-botao-secundario ds-botao-p"
              href="/admin/feedbacks"
            >
              {t("Ver feedbacks")}
            </Link>
            <Link
              className="ds-botao ds-botao-primario ds-botao-p"
              href={`/admin/conversas?cliente=${encodeURIComponent(clientData.slug)}`}
            >
              {t("Ver conversas")}
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </>
        }
        destaque={
          pendentes > 0
            ? pendentes === 1
              ? t("1 pendência")
              : t("{n} pendências", { n: numero.format(pendentes) })
            : t("{n} conversas", { n: numero.format(totalConversas) })
        }
        resto={
          pendentes > 0
            ? t("esperando a equipe Lexia.")
            : t("atendidas, nada pendente.")
        }
        sobretitulo={t("Admin Lexia · ficha do cliente")}
      />

      {/* Quem é o cliente: inicial na cor dele, nome, canais e estado. */}
      <div className="ds-bloco ds-entrar flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-lg font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
            style={{ background: clientData.cor_principal || "var(--ds-acao)" }}
          >
            {nomeCliente.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="ds-titulo-3 truncate text-foreground">{nomeCliente}</p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              <span className="font-mono text-xs">{clientData.slug}</span>
              {canaisComConversa.length > 0
                ? ` · ${canaisComConversa.map((c) => c.nome).join(", ")}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seloStatus ? (
            <span className={`ds-selo ds-selo-ponto ${seloStatus.classe}`}>
              {seloStatus.texto}
            </span>
          ) : null}
          {clientData.modo_teste ? (
            <span className="ds-selo ds-selo-alerta">{t("Modo teste")}</span>
          ) : null}
          <span className="ds-selo ds-selo-neutro">
            {activeWorkflows.length === 0
              ? t("Sem workflow ativo")
              : activeWorkflows.length === 1
                ? t("1 workflow ativo")
                : t("{n} workflows ativos", { n: activeWorkflows.length })}
          </span>
        </div>
      </div>

      <GradeMetricas>
        <CartaoMetrica
          cor="var(--ds-acao)"
          icone={<MessagesSquare aria-hidden="true" className="h-4 w-4" />}
          nota={t("todo o histórico")}
          rotulo={t("Conversas")}
          valor={numero.format(totalConversas)}
        />
        <CartaoMetrica
          cor="var(--ds-info)"
          icone={<MessageCircle aria-hidden="true" className="h-4 w-4" />}
          nota={t("todo o histórico")}
          rotulo={t("Mensagens recebidas")}
          valor={numero.format(mensagensRecebidas)}
        />
        <CartaoMetrica
          cor="var(--ds-destaque)"
          icone={<Send aria-hidden="true" className="h-4 w-4" />}
          nota={t("todo o histórico")}
          rotulo={t("Respostas enviadas")}
          valor={numero.format(mensagensEnviadas)}
        />
        <CartaoMetrica
          cor="var(--ds-ouro)"
          href="/admin/feedbacks"
          icone={<Star aria-hidden="true" className="h-4 w-4" />}
          nota={
            handoffsPendentes > 0
              ? t("{n} handoffs pendentes", { n: numero.format(handoffsPendentes) })
              : undefined
          }
          rotulo={t("Feedbacks pendentes")}
          valor={numero.format(feedbacksPendentes)}
        />
      </GradeMetricas>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Bloco
          extra={
            <Link
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              href={`/admin/conversas?cliente=${encodeURIComponent(clientData.slug)}`}
            >
              {t("Ver todas")}
            </Link>
          }
          titulo={t("Últimas conversas reais")}
        >
          {latestContacts.length > 0 ? (
            <div className="tela-lista p-1.5">
              {latestContacts.map((contact) => {
                const lastMessage = lastMessageByConversation.get(
                  contact.identificador_conversa,
                );
                const nome = contact.nome || contact.telefone || t("Sem nome");

                return (
                  <Link
                    className="tela-linha items-start"
                    href={buildAdminConversationHref(
                      clientData.slug,
                      contact.identificador_conversa,
                      lastMessage?.id ?? null,
                    )}
                    key={contact.id}
                  >
                    <AvatarCanal canal={contact.canal} nome={nome} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {nome}
                        </p>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatDateInTimezone(contact.atualizado_em, timeZone)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {getMessagePreview(lastMessage, t)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <VazioTela
              texto={t("Quando alguém escrever para o agente, a conversa aparece aqui.")}
              titulo={t("Ainda não há conversas reais registradas.")}
            />
          )}
        </Bloco>

        <Bloco
          legenda={t("todo o histórico")}
          titulo={t("Conversas por canal")}
        >
          <ul className="flex flex-col gap-4 px-5 pt-1 pb-5">
            {porCanal.map((c) => (
              <li className="flex items-center gap-3" key={c.canal}>
                <ChannelIcon channel={c.canal} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground">{c.nome}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {numero.format(c.valor)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Barra valor={(c.valor / maiorCanal) * 100} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Bloco>
      </div>

      <Bloco titulo={t("Configurações do cliente")}
      >
        {workflows.length > 0 ? (
          <div className="tela-lista px-1.5">
            {workflows.map((workflow) => (
              <div className="tela-linha items-start" key={workflow.id}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ds-acao-fundo)] text-[var(--ds-acao-forte)]">
                  <Workflow aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 font-semibold text-foreground">
                      <ExpandableText
                        emptyText={t("Sem nome")}
                        maxLength={80}
                        text={workflow.nome}
                      />
                    </span>
                    <span
                      className={`ds-selo ds-selo-ponto ${
                        workflow.status === "ativo"
                          ? "ds-selo-verde"
                          : workflow.status === "teste"
                            ? "ds-selo-alerta"
                            : "ds-selo-neutro"
                      }`}
                    >
                      {workflow.status === "ativo"
                        ? t("Ativo")
                        : workflow.status === "teste"
                          ? t("Teste")
                          : workflow.status === "inativo"
                            ? t("Inativo")
                            : (workflow.status ?? t("Sem status"))}
                    </span>
                    {workflow.tipo ? (
                      <span className="ds-selo ds-selo-neutro">{workflow.tipo}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    <ExpandableText
                      emptyText={t("Sem webhook")}
                      maxLength={90}
                      text={workflow.webhook_url}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 pb-2 text-sm text-muted-foreground">
            {t("Nenhum workflow configurado para este cliente.")}
          </p>
        )}

        <details className="group mx-5 mt-3 mb-5 rounded-[14px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <Pencil aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{t("Editar dados e workflow")}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="px-4 pt-1 pb-4">
            <ClientSettingsForm
              clienteSlug={clientData.slug}
              workflowId={editableWorkflow?.id ?? null}
              initialValues={{
                nome: clientData.nome ?? "",
                status: clientData.status ?? "ativo",
                modo_teste: Boolean(clientData.modo_teste),
                cor_principal: clientData.cor_principal ?? "",
                workflow_nome: editableWorkflow?.nome ?? "",
                workflow_tipo: editableWorkflow?.tipo ?? "",
                webhook_url: editableWorkflow?.webhook_url ?? "",
                workflow_status: editableWorkflow?.status ?? "inativo",
              }}
            />
          </div>
        </details>
      </Bloco>

      <FollowupsLongosBloco clienteSlug={clientData.slug} locale={locale} timeZone={timeZone} />

      <Bloco
        legenda={
          clientUsers.length === 1
            ? t("1 pessoa")
            : t("{n} pessoas", { n: clientUsers.length })
        }
        titulo={t("Usuários do cliente")}
      >
        {clientUsers.length > 0 ? (
          <div className="tela-lista px-1.5">
            {clientUsers.map((clientUser) => {
              const ativo = clientUser.status === "ativo";
              const novoStatus = ativo ? "inativo" : "ativo";
              const alternar = updateClientUserStatus.bind(
                null,
                clientData.slug,
                clientUser.user_id,
                novoStatus,
              );

              return (
                <div
                  className="tela-linha flex-wrap sm:flex-nowrap"
                  key={clientUser.user_id}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--ds-texto)_6%,transparent)] text-muted-foreground">
                    <UserRound aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-foreground">
                      {clientUser.user_id}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatLabel(clientUser.role, t)} ·{" "}
                      {t("Criado em {data}", {
                        data: formatDateInTimezone(clientUser.criado_em, timeZone),
                      })}
                    </p>
                  </div>
                  <span
                    className={`ds-selo ds-selo-ponto ${ativo ? "ds-selo-verde" : "ds-selo-neutro"}`}
                  >
                    {ativo
                      ? t("Ativo")
                      : clientUser.status === "inativo"
                        ? t("Inativo")
                        : formatLabel(clientUser.status, t)}
                  </span>
                  <form action={alternar}>
                    <FormSubmitButton
                      className="ds-botao ds-botao-secundario ds-botao-p"
                      pendingLabel={ativo ? t("Inativando...") : t("Ativando...")}
                    >
                      {ativo ? t("Inativar") : t("Ativar")}
                    </FormSubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        ) : (
          <VazioTela
            texto={t("Crie o primeiro acesso abaixo para o cliente entrar no painel.")}
            titulo={t("Nenhum usuário vinculado a este cliente ainda.")}
          />
        )}

        <details className="group mx-5 mt-3 mb-5 rounded-[14px] bg-[color-mix(in_oklab,var(--ds-texto)_3%,transparent)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <UserPlus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{t("Criar usuário do cliente")}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="px-4 pb-4">
            <ClientUserForm clienteSlug={clientData.slug} />
          </div>
        </details>
      </Bloco>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <Bloco
          extra={
            <span className="ds-selo ds-selo-neutro tabular-nums">
              {t("{sessoes} sessões · {execucoes} execuções", {
                execucoes: numero.format(execucoesCount),
                sessoes: numero.format(sessoesCount),
              })}
            </span>
          }
          titulo={t("Últimas execuções de teste")}
        >
          {latestExecutions.length > 0 ? (
            <div className="tela-lista px-1.5 pb-2">
              {latestExecutions.map((execution) => (
                <div className="tela-linha items-start" key={execution.id}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ds-info-fundo)] text-[var(--ds-info)]">
                    <FlaskConical aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="ds-selo ds-selo-neutro">
                        {formatLabel(execution.origem, t)}
                      </span>
                      {execution.rota ? (
                        <span className="ds-selo ds-selo-neutro">{execution.rota}</span>
                      ) : null}
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatDateInTimezone(execution.criado_em, timeZone)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-foreground">
                      <ExpandableText
                        emptyText={t("Sem mensagem")}
                        maxLength={120}
                        text={execution.mensagem_teste}
                      />
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      <ExpandableText
                        emptyText={t("Sem resposta")}
                        maxLength={160}
                        text={getAgentResponseText(execution)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <VazioTela
              acao={
                <Link className="ds-botao ds-botao-secundario ds-botao-p" href="/admin/area-testes">
                  {t("Abrir a área de testes")}
                </Link>
              }
              titulo={t("Nenhuma execução de teste encontrada.")}
            />
          )}
        </Bloco>

        <Bloco
          extra={
            feedbacksPendentes > 0 ? (
              <span className="ds-selo ds-selo-ouro tabular-nums">
                {t("{n} pendentes", { n: numero.format(feedbacksPendentes) })}
              </span>
            ) : null
          }
          titulo={t("Últimos feedbacks")}
        >
          {latestFeedbacks.length > 0 ? (
            <div className="tela-lista px-1.5 pb-2">
              {latestFeedbacks.map((feedback) => {
                const parsed = parseFeedbackComentario(feedback.comentario);
                const conversationHref = parsed.conversa
                  ? buildAdminConversationHref(
                      clientData.slug,
                      parsed.conversa,
                      parsed.messageId,
                    )
                  : null;
                const pendente = feedback.status === "pendente";

                return (
                  <div className="tela-linha items-start" key={feedback.id}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ds-ouro-fundo)] text-[var(--ds-ouro)]">
                      <Star aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="ds-selo ds-selo-neutro">
                          {parsed.categoria ?? formatLabel(feedback.avaliacao, t)}
                        </span>
                        <span
                          className={`ds-selo ds-selo-ponto ${pendente ? "ds-selo-ouro" : "ds-selo-verde"}`}
                        >
                          {formatLabel(feedback.status, t)}
                        </span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {formatDateInTimezone(feedback.criado_em, timeZone)}
                        </span>
                      </div>
                      {parsed.observacao ? (
                        <div className="mt-1.5 text-foreground">
                          <ExpandableText
                            emptyText={t("Sem observação")}
                            maxLength={120}
                            text={parsed.observacao}
                          />
                        </div>
                      ) : null}
                      <div className="mt-1 text-muted-foreground">
                        <ExpandableText
                          emptyText={t("Mensagem do cliente não registrada.")}
                          maxLength={120}
                          text={feedback.mensagem_cliente}
                        />
                      </div>
                      <details className="mt-1 text-muted-foreground">
                        <summary className="cursor-pointer text-xs font-semibold text-foreground">
                          {t("Resposta marcada")}
                        </summary>
                        <div className="mt-1">
                          <ExpandableText
                            emptyText={t("Resposta marcada não registrada.")}
                            text={feedback.resposta_agente}
                          />
                        </div>
                      </details>
                      <Link
                        className="mt-1.5 inline-block text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                        href={conversationHref ?? "/admin/feedbacks"}
                      >
                        {conversationHref ? t("Ver conversa") : t("Ver feedback")}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <VazioTela
              pose="feliz"
              titulo={t("Ainda não há feedbacks registrados.")}
            />
          )}
        </Bloco>
      </div>

      <Bloco
        extra={
          handoffsPendentes > 0 ? (
            <span className="ds-selo ds-selo-alerta tabular-nums">
              {t("{n} pendentes", { n: numero.format(handoffsPendentes) })}
            </span>
          ) : null
        }
        titulo={t("Últimos handoffs")}
      >
        {latestHandoffs.length > 0 ? (
          <div className="tela-lista px-1.5 pb-2">
            {latestHandoffs.map((handoff) => {
              const nome = handoff.nome_contacto ?? t("Sem nome");
              return (
                <div className="tela-linha items-start" key={handoff.id}>
                  <AvatarCanal nome={nome} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 truncate font-semibold text-foreground">
                        {nome}
                      </span>
                      {handoff.prioridade ? (
                        <span
                          className={`ds-selo ${
                            handoff.prioridade === "alta" || handoff.prioridade === "urgente"
                              ? "ds-selo-perigo"
                              : "ds-selo-neutro"
                          }`}
                        >
                          {formatLabel(handoff.prioridade, t)}
                        </span>
                      ) : null}
                      <span
                        className={`ds-selo ds-selo-ponto ${
                          handoff.status === "pendente" ? "ds-selo-alerta" : "ds-selo-verde"
                        }`}
                      >
                        {formatLabel(handoff.status, t)}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatDateInTimezone(handoff.criado_em, timeZone)}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      <ExpandableText
                        emptyText={t("Sem motivo")}
                        maxLength={160}
                        text={handoff.motivo}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <VazioTela pose="feliz" titulo={t("Nenhum handoff encontrado.")} />
        )}
      </Bloco>

      <div className="tela-aviso tela-aviso-perigo flex flex-col gap-3 sm:flex-row sm:items-center">
        <Trash2 aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("Limpeza de dados de teste")}</p>
          <p className="mt-0.5 text-[0.8125rem] font-normal opacity-90">
            {t(
              "Remove sessões, execuções, feedbacks ligados a testes, mensagens e contatos de teste deste cliente. Handoffs reais de produção não serão apagados.",
            )}
          </p>
        </div>
        <ConfirmActionButton
          action={clearClientTestData.bind(null, clientData.slug)}
          className="ds-botao ds-botao-perigo ds-botao-p w-fit shrink-0"
          confirmMessage={t(
            "Tem certeza? Isso vai apagar sessões de teste, execuções de teste, feedbacks ligados a testes, mensagens e contatos de teste deste cliente. Handoffs reais de produção não serão apagados.",
          )}
        >
          {t("Limpar dados de teste deste cliente")}
        </ConfirmActionButton>
      </div>
    </section>
  );
}

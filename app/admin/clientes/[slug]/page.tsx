import Link from "next/link";
import { redirect } from "next/navigation";

import {
  clearClientTestData,
  retryPendingClientUserLink,
  updateClientUserStatus,
} from "@/app/admin/clientes/[slug]/actions";
import { ClientUserForm } from "@/app/admin/clientes/[slug]/client-user-form";
import { ClientSettingsForm } from "@/app/admin/clientes/[slug]/settings-form";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ExpandableText } from "@/app/components/expandable-text";
import {
  buildAdminConversationHref,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { requireLexiaAdmin } from "@/lib/auth/access-context";
import { listPendingUserLinksAsAdmin } from "@/lib/auth/user-link-pending";
import { createClient } from "@/lib/supabase/server";
import {
  listAdminWorkflowConfigurations,
} from "@/lib/workflows/private-config";

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

function formatDate(date: string | null) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
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

async function getCount(
  table: string,
  clienteSlug: string,
  status?: string,
) {
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

function getMessagePreview(message: ConversationMessage | null | undefined) {
  if (!message) {
    return "Sem mensagens registadas.";
  }

  if (message.tipo === "imagem") {
    return "Imagem";
  }

  return message.conteudo || "Sem conteúdo.";
}

function InfoItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-500">{label}</p>
      <div className="mt-1 font-medium text-zinc-950">{children}</div>
    </div>
  );
}

export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  await requireLexiaAdmin().catch(() => redirect("/login"));

  const { slug } = await params;
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
      <section className="flex w-full min-w-0 flex-col gap-6">
        <h1 className="text-3xl font-semibold">Cliente não encontrado.</h1>
      </section>
    );
  }

  const clientData = client as LexiaClient;

  const [
    workflows,
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
    pendingUserLinks,
  ] = await Promise.all([
    listAdminWorkflowConfigurations(clientData.slug),
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
      .select("id, canal, identificador_conversa, nome, telefone, atualizado_em")
      .eq("cliente_slug", clientData.slug)
      .not("identificador_conversa", "like", "teste:%")
      .order("atualizado_em", { ascending: false })
      .limit(5),
    supabase
      .from("lexia_usuarios_clientes")
      .select("user_id, role, status, criado_em")
      .eq("cliente_slug", clientData.slug)
      .order("criado_em", { ascending: false }),
    listPendingUserLinksAsAdmin(clientData.slug),
  ]);

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

  const activeWorkflows = workflows.filter(
    (workflow) => workflow.status === "ativo",
  );
  const activeWorkflow =
    activeWorkflows[0] ?? null;
  const editableWorkflow = activeWorkflow ?? workflows[0] ?? null;
  const latestExecutions =
    (latestExecutionsData ?? []) as LatestExecution[];
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

  const cards = [
    { title: "Conversas", value: totalConversas },
    { title: "Mensagens recebidas", value: mensagensRecebidas },
    { title: "Respostas enviadas", value: mensagensEnviadas },
    { title: "Feedbacks pendentes", value: feedbacksPendentes },
    { title: "WhatsApp", value: whatsappConversas },
    { title: "Messenger", value: messengerConversas },
    { title: "Instagram", value: instagramConversas },
  ];
  const testCards = [
    { title: "Sessões de teste", value: sessoesCount },
    { title: "Execuções de teste", value: execucoesCount },
    { title: "Handoffs pendentes", value: handoffsPendentes },
  ];

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">
          {clientData.nome ?? "Cliente"}
        </h1>
        <p className="mt-2 text-zinc-600">Resumo do cliente na Lexia.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            href={`/admin/conversas?cliente=${encodeURIComponent(clientData.slug)}`}
          >
            Ver conversas
          </Link>
          <Link
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            href="/admin/feedbacks"
          >
            Ver feedbacks
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <InfoItem label="Slug">{clientData.slug}</InfoItem>
          <InfoItem label="Status">{clientData.status ?? "Sem status"}</InfoItem>
          <InfoItem label="Modo teste">
            {clientData.modo_teste ? "Ativo" : "Inativo"}
          </InfoItem>
          <InfoItem label="Cor principal">
            <div className="flex items-center gap-2">
              {clientData.cor_principal ? (
                <span
                  className="h-4 w-4 rounded-full border border-zinc-300"
                  style={{ backgroundColor: clientData.cor_principal }}
                />
              ) : null}
              <span>{clientData.cor_principal ?? "Sem cor"}</span>
            </div>
          </InfoItem>
          <InfoItem
            label={
              activeWorkflows.length > 1
                ? "Workflows ativos"
                : "Workflow ativo"
            }
          >
            {activeWorkflows.length === 0 ? (
              "Sem workflow ativo"
            ) : activeWorkflows.length === 1 ? (
              <ExpandableText
                emptyText="Sem workflow ativo"
                text={activeWorkflows[0].nome ?? null}
                maxLength={80}
              />
            ) : (
              <div className="space-y-1">
                <p>{activeWorkflows.length} workflows ativos</p>
                <ul className="space-y-1 text-xs text-zinc-600">
                  {activeWorkflows.map((workflow) => (
                    <li key={workflow.id}>
                      {workflow.nome ?? "Workflow"} (
                      {workflow.tipo ?? "sem tipo"})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </InfoItem>
          <InfoItem label="Workflow status">
            {activeWorkflows.length > 1
              ? `${activeWorkflows.length} ativos`
              : activeWorkflow?.status ?? "Sem workflow"}
          </InfoItem>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            className="rounded-md border border-zinc-200 bg-white p-5"
            key={card.title}
          >
            <p className="text-sm font-medium text-zinc-500">{card.title}</p>
            <p className="mt-3 text-2xl font-semibold text-zinc-950">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {testCards.map((card) => (
          <div
            className="rounded-md border border-zinc-200 bg-white p-5"
            key={card.title}
          >
            <p className="text-sm font-medium text-zinc-500">{card.title}</p>
            <p className="mt-3 text-2xl font-semibold text-zinc-950">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Últimas conversas reais</h2>
        </div>
        {latestContacts.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {latestContacts.map((contact) => {
              const lastMessage = lastMessageByConversation.get(
                contact.identificador_conversa,
              );

              return (
                <Link
                  className="block px-5 py-4 transition hover:bg-zinc-50"
                  href={buildAdminConversationHref(
                    clientData.slug,
                    contact.identificador_conversa,
                    lastMessage?.id ?? null,
                  )}
                  key={contact.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">
                        {contact.nome || contact.telefone || "Sem nome"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {contact.telefone ?? "Sem telefone"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {formatLabel(contact.canal)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                    {getMessagePreview(lastMessage)}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {formatDate(contact.atualizado_em)}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Ainda não há conversas reais registadas.
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Configurações do cliente</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Edite os dados básicos do cliente e o workflow usado nos testes.
          </p>
        </div>
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
            webhook_url: "",
            webhook_configured: Boolean(editableWorkflow?.webhookConfigured),
            workflow_status: editableWorkflow?.status ?? "inativo",
          }}
        />
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Usuários do cliente</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Crie usuários vinculados ao cliente e controle o status de acesso.
          </p>
        </div>

        <div className="p-5">
          <h3 className="font-semibold text-zinc-950">
            Criar usuário do cliente
          </h3>
          <ClientUserForm clienteSlug={clientData.slug} />
        </div>

        {clientUsers.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="w-[34%] border-y border-zinc-200 px-3 py-3 font-medium">
                  User ID
                </th>
                <th className="w-[18%] border-y border-zinc-200 px-3 py-3 font-medium">
                  Role
                </th>
                <th className="w-[14%] border-y border-zinc-200 px-3 py-3 font-medium">
                  Status
                </th>
                <th className="w-[18%] border-y border-zinc-200 px-3 py-3 font-medium">
                  Criado em
                </th>
                <th className="w-[16%] border-y border-zinc-200 px-3 py-3 font-medium">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {clientUsers.map((clientUser) => {
                const activateAction = updateClientUserStatus.bind(
                  null,
                  clientData.slug,
                  clientUser.user_id,
                  "ativo",
                );
                const deactivateAction = updateClientUserStatus.bind(
                  null,
                  clientData.slug,
                  clientUser.user_id,
                  "inativo",
                );

                return (
                  <tr
                    className="border-b border-zinc-100"
                    key={clientUser.user_id}
                  >
                    <td className="break-words px-3 py-3 align-top font-mono text-[11px] text-zinc-600 sm:text-xs">
                      {clientUser.user_id}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatLabel(clientUser.role)}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatLabel(clientUser.status)}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatDate(clientUser.criado_em)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <form action={activateAction}>
                          <FormSubmitButton
                            className="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                            disabled={clientUser.status === "ativo"}
                            pendingLabel="Ativando..."
                          >
                            Ativar
                          </FormSubmitButton>
                        </form>
                        <form action={deactivateAction}>
                          <FormSubmitButton
                            className="h-9 w-full rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                            disabled={clientUser.status === "inativo"}
                            pendingLabel="Inativando..."
                          >
                            Inativar
                          </FormSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="border-t border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
            Nenhum usuário vinculado a este cliente ainda.
          </div>
        )}

        {pendingUserLinks.length > 0 ? (
          <div className="border-t border-amber-200 bg-amber-50/60 p-5">
            <h3 className="font-semibold text-zinc-950">
              Vínculos pendentes de recuperação
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              O usuário do Auth foi preservado. A recuperação nunca exclui nem
              reassocia automaticamente um vínculo conflitante.
            </p>
            <div className="mt-4 grid gap-3">
              {pendingUserLinks.map((pending) => (
                <div
                  className="flex flex-col gap-3 rounded-md border border-amber-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  key={pending.id}
                >
                  <div className="min-w-0 text-sm text-zinc-600">
                    <p className="break-all font-mono text-xs text-zinc-800">
                      {pending.user_id}
                    </p>
                    <p className="mt-1">
                      {formatLabel(pending.role)} · {formatLabel(pending.status_perfil)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {pending.erro_resumo} · {formatDate(pending.criado_em)}
                    </p>
                  </div>
                  <form
                    action={retryPendingClientUserLink.bind(
                      null,
                      clientData.slug,
                      pending.id,
                    )}
                  >
                    <FormSubmitButton
                      className="h-9 rounded-md border border-amber-300 bg-white px-3 text-xs font-medium text-amber-900 transition hover:bg-amber-50"
                      pendingLabel="Tentando..."
                    >
                      Tentar vínculo novamente
                    </FormSubmitButton>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Workflow</h2>
        {workflows.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {workflows.map((workflow) => (
              <div
                className="rounded-md border border-zinc-200 p-4"
                key={workflow.id}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem label="Nome">
                    <ExpandableText
                      emptyText="Sem nome"
                      text={workflow.nome}
                      maxLength={80}
                    />
                  </InfoItem>
                  <InfoItem label="Tipo">{workflow.tipo ?? "Sem tipo"}</InfoItem>
                  <InfoItem label="Status">
                    {workflow.status ?? "Sem status"}
                  </InfoItem>
                  <InfoItem label="Webhook">
                    {workflow.webhookConfigured
                      ? "Destino privado configurado"
                      : "Sem destino configurado"}
                  </InfoItem>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Nenhum workflow configurado para este cliente.
          </p>
        )}
      </section>

      <section className="rounded-md border border-red-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Limpeza de dados de teste
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Remove sessões, execuções, feedbacks ligados a testes, mensagens
              e contactos de teste deste cliente. Handoffs reais de produção
              não serão apagados.
            </p>
          </div>
          <div>
            <ConfirmActionButton
              action={clearClientTestData.bind(null, clientData.slug)}
              className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
              confirmMessage="Tem certeza? Isso vai apagar sessões de teste, execuções de teste, feedbacks ligados a testes, mensagens e contactos de teste deste cliente. Handoffs reais de produção não serão apagados."
            >
              Limpar dados de teste deste cliente
            </ConfirmActionButton>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Últimas execuções de teste</h2>
        </div>
        {latestExecutions.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="w-[13%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Data
                </th>
                <th className="w-[12%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Origem
                </th>
                <th className="w-[12%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Rota
                </th>
                <th className="w-[28%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Mensagem
                </th>
                <th className="w-[35%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Resposta
                </th>
              </tr>
            </thead>
            <tbody>
              {latestExecutions.map((execution) => (
                <tr className="border-b border-zinc-100" key={execution.id}>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {formatDate(execution.criado_em)}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {formatLabel(execution.origem)}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {execution.rota ?? "Sem rota"}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    <ExpandableText
                      emptyText="Sem mensagem"
                      text={execution.mensagem_teste}
                    />
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    <ExpandableText
                      emptyText="Sem resposta"
                      text={getAgentResponseText(execution)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Nenhuma execução de teste encontrada.
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Últimos feedbacks</h2>
        </div>
        {latestFeedbacks.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="w-[13%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Data
                </th>
                <th className="w-[15%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Categoria
                </th>
                <th className="w-[24%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Mensagem do cliente
                </th>
                <th className="w-[24%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Resposta marcada
                </th>
                <th className="w-[14%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Status
                </th>
                <th className="w-[10%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {latestFeedbacks.map((feedback) => {
                const parsed = parseFeedbackComentario(feedback.comentario);
                const conversationHref = parsed.conversa
                  ? buildAdminConversationHref(
                      clientData.slug,
                      parsed.conversa,
                      parsed.messageId,
                    )
                  : null;

                return (
                  <tr className="border-b border-zinc-100" key={feedback.id}>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatDate(feedback.criado_em)}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      <div className="flex flex-col gap-2">
                        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                          {parsed.categoria ?? formatLabel(feedback.avaliacao)}
                        </span>
                        {parsed.observacao ? (
                          <ExpandableText
                            emptyText="Sem observação"
                            text={parsed.observacao}
                            maxLength={90}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      <ExpandableText
                        emptyText="Mensagem do cliente não registada."
                        text={feedback.mensagem_cliente}
                      />
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      <ExpandableText
                        emptyText="Resposta marcada não registada."
                        text={feedback.resposta_agente}
                      />
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatLabel(feedback.status)}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {conversationHref ? (
                        <Link
                          className="text-xs font-medium text-zinc-950 underline-offset-2 hover:underline"
                          href={conversationHref}
                        >
                          Ver conversa
                        </Link>
                      ) : (
                        <Link
                          className="text-xs font-medium text-zinc-950 underline-offset-2 hover:underline"
                          href="/admin/feedbacks"
                        >
                          Ver feedback
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Ainda não há feedbacks registados.
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Últimos handoffs</h2>
        </div>
        {latestHandoffs.length > 0 ? (
          <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="w-[18%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Data
                </th>
                <th className="w-[18%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Nome
                </th>
                <th className="w-[34%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Motivo
                </th>
                <th className="w-[15%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Prioridade
                </th>
                <th className="w-[15%] border-b border-zinc-200 px-3 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {latestHandoffs.map((handoff) => (
                <tr className="border-b border-zinc-100" key={handoff.id}>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {formatDate(handoff.criado_em)}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {handoff.nome_contacto ?? "Sem nome"}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    <ExpandableText
                      emptyText="Sem motivo"
                      text={handoff.motivo}
                    />
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {formatLabel(handoff.prioridade)}
                  </td>
                  <td className="break-words px-3 py-3 align-top text-zinc-600">
                    {formatLabel(handoff.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Nenhum handoff encontrado.
          </div>
        )}
      </section>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  createAdminTestSession,
  deleteAdminTestSession,
  getAdminExecutionByRunId,
  getAdminSessionExecutions,
  sendAdminTestMessage,
  type AdminTestExecution,
  type AdminTestSession,
  type AdminTestWorkflow,
} from "@/app/admin/area-testes/actions";
import {
  Loader2,
  MessageSquare,
  Plus,
  SendHorizontal,
  Trash2,
} from "lucide-react";

import { useIdioma } from "@/app/components/idioma";
import { AvatarMascote } from "@/app/components/mascote";
import { AvisoLinha, VazioTela } from "@/app/components/tela";

type AdminTestChatProps = {
  clienteSlug: string;
  /** Nome do cliente, para o topo do chat. */
  nomeCliente: string;
  sessions: AdminTestSession[];
  executions: AdminTestExecution[];
  selectedSessionId: string | null;
  workflows: AdminTestWorkflow[];
};

type ChatMessage = {
  id: string;
  role: "admin" | "agent";
  text: string;
};

type PendingRun = {
  sessionId: string;
  runId: string;
  text: string;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45;

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

function normalizeAgentMessages(execution: AdminTestExecution) {
  const source = execution.mensagens;
  const fallback = execution.resposta_obtida ? [execution.resposta_obtida] : [];

  if (Array.isArray(source)) {
    const messages = source.map(stringifyMessage).filter(Boolean);

    return messages.length > 0 ? messages : fallback;
  }

  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source) as unknown;

      if (Array.isArray(parsed)) {
        const messages = parsed.map(stringifyMessage).filter(Boolean);

        return messages.length > 0 ? messages : fallback;
      }
    } catch {
      // Mensagens em texto simples seguem para o tratamento abaixo.
    }
  }

  const directMessage = stringifyMessage(source);

  if (directMessage) {
    return [directMessage];
  }

  return fallback;
}

function buildChatMessages(executions: AdminTestExecution[]) {
  return executions.flatMap((execution) => {
    const messages: ChatMessage[] = [];

    if (execution.mensagem_teste) {
      messages.push({
        id: `${execution.id}-admin`,
        role: "admin",
        text: execution.mensagem_teste,
      });
    }

    for (const [index, text] of normalizeAgentMessages(execution).entries()) {
      messages.push({
        id: `${execution.id}-agent-${index}`,
        role: "agent",
        text,
      });
    }

    return messages;
  });
}

export function AdminTestChat({
  clienteSlug,
  nomeCliente,
  sessions,
  executions,
  selectedSessionId,
  workflows,
}: AdminTestChatProps) {
  const { t } = useIdioma();
  const router = useRouter();
  const [isCreating, startCreating] = useTransition();
  const [isSending, startSending] = useTransition();
  const [isChecking, startChecking] = useTransition();
  const [message, setMessage] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    workflows.length === 1 ? workflows[0].id : "",
  );
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [localExecutions, setLocalExecutions] = useState(executions);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [lastPendingRun, setLastPendingRun] = useState<PendingRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = useMemo(
    () => buildChatMessages(localExecutions),
    [localExecutions],
  );
  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) => !deletedSessionIds.has(session.session_id)),
    [deletedSessionIds, sessions],
  );
  const selectedWorkflow = workflows.find(
    (workflow) => workflow.id === selectedWorkflowId,
  );

  useEffect(() => {
    // Rola só a caixa do chat, não a página inteira.
    const caixa = messagesEndRef.current?.parentElement;
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, [chatMessages.length, pendingText]);

  function sessionHref(sessionId: string) {
    return `/admin/area-testes?cliente=${encodeURIComponent(
      clienteSlug,
    )}&session=${encodeURIComponent(sessionId)}`;
  }

  function handleCreateSession() {
    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await createAdminTestSession(clienteSlug);

      if (result.error || !result.data) {
        setError(
          result.error ?? t("Não foi possível criar a sessão de teste."),
        );
        return;
      }

      router.push(sessionHref(result.data.session_id));
      router.refresh();
    });
  }

  function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm(
      t(
        "Tem certeza que deseja excluir esta conversa de teste admin? As execuções e feedbacks ligados a ela também serão removidos.",
      ),
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await deleteAdminTestSession(clienteSlug, sessionId);

      if (!result.ok) {
        setError(result.error ?? t("Não foi possível excluir a sessão."));
        return;
      }

      setDeletedSessionIds((current) => new Set(current).add(sessionId));

      if (selectedSessionId === sessionId) {
        setLocalExecutions([]);
        setPendingText(null);
        setLastPendingRun(null);
        router.push(
          `/admin/area-testes?cliente=${encodeURIComponent(clienteSlug)}`,
        );
      }

      router.refresh();
    });
  }

  async function updateChatFromExecution(
    sessionId: string,
    execution: AdminTestExecution,
  ) {
    const refreshed = await getAdminSessionExecutions(clienteSlug, sessionId);

    if (refreshed.data) {
      setLocalExecutions(refreshed.data);
    } else {
      setLocalExecutions((current) => [...current, execution]);
    }

    setPendingText(null);
    setLastPendingRun(null);
    setNotice(null);
    router.refresh();
  }

  function pollForExecution(sessionId: string, runId: string, text: string) {
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      const result = await getAdminExecutionByRunId(
        clienteSlug,
        sessionId,
        runId,
      );

      if (result.error) {
        setPendingText(null);
        setError(result.error);
        return;
      }

      if (result.data) {
        await updateChatFromExecution(sessionId, result.data);
        return;
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPendingText(null);
        setLastPendingRun({ sessionId, runId, text });
        setNotice(
          t(
            "Mensagem enviada, mas ainda não houve resposta gravada pelo workflow.",
          ),
        );
        setLocalExecutions((current) => [
          ...current,
          {
            id: runId,
            run_id: runId,
            session_id: sessionId,
            cliente_slug: clienteSlug,
            origem: "painel_admin",
            mensagem_teste: text,
            mensagens: [],
            resposta_obtida: null,
            criado_em: null,
          },
        ]);
        return;
      }

      window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    window.setTimeout(poll, POLL_INTERVAL_MS);
  }

  function handleCheckAgain() {
    if (!lastPendingRun) {
      return;
    }

    setError(null);
    startChecking(async () => {
      const result = await getAdminExecutionByRunId(
        clienteSlug,
        lastPendingRun.sessionId,
        lastPendingRun.runId,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.data) {
        await updateChatFromExecution(lastPendingRun.sessionId, result.data);
      }
    });
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = message.trim();

    if (!selectedSessionId || !text) {
      return;
    }

    setError(null);
    setNotice(null);
    setLastPendingRun(null);
    setPendingText(text);
    setMessage("");

    startSending(async () => {
      const result = await sendAdminTestMessage(
        clienteSlug,
        selectedSessionId,
        text,
        selectedWorkflowId,
      );

      if (result.error || !result.data) {
        setPendingText(null);
        setError(result.error ?? t("Não foi possível enviar a mensagem."));
        return;
      }

      pollForExecution(selectedSessionId, result.data.runId, text);
    });
  }

  return (
    <div className="grid min-w-0 gap-4 lg:h-[calc(100dvh-300px)] lg:min-h-[540px] lg:grid-cols-[300px_1fr]">
      <aside className="ds-bloco flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="ds-titulo-3 text-foreground">{t("Sessões")}</h2>
          <button
            className="ds-botao ds-botao-primario ds-botao-p"
            disabled={isCreating}
            onClick={handleCreateSession}
            type="button"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {isCreating ? t("Criando...") : t("Nova conversa")}
          </button>
        </div>

        <div className="tela-lista flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2 lg:max-h-none">
          {visibleSessions.length > 0 ? (
            visibleSessions.map((session) => {
              const selecionada = selectedSessionId === session.session_id;
              return (
                <div
                  aria-selected={selecionada}
                  className="tela-linha group"
                  key={session.id}
                >
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    href={sessionHref(session.session_id)}
                    onClick={() => {
                      setLocalExecutions([]);
                      setPendingText(null);
                      setLastPendingRun(null);
                      setNotice(null);
                      setError(null);
                    }}
                  >
                    <span
                      className="ds-chip-icone"
                      style={{
                        ["--chip" as string]: selecionada
                          ? "var(--ds-acao)"
                          : "var(--ds-texto-3)",
                      }}
                    >
                      <MessageSquare
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {/* "Nova sessão" é o nome que o próprio painel grava ao criar. */}
                        {session.nome && session.nome !== "Nova sessão"
                          ? session.nome
                          : t("Nova sessão")}
                      </span>
                      <span
                        className="block truncate font-mono text-[0.6875rem] text-muted-foreground"
                        title={session.session_id}
                      >
                        {session.session_id}
                      </span>
                    </span>
                  </Link>
                  <button
                    aria-label={t("Excluir")}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    disabled={isCreating}
                    onClick={() => handleDeleteSession(session.session_id)}
                    title={t("Excluir")}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <VazioTela
              texto={t(
                "Comece uma conversa e escreva como se fosse um cliente.",
              )}
              titulo={t("Nenhuma sessão criada ainda.")}
            />
          )}
        </div>
      </aside>

      <section
        className={`ds-bloco h-[72dvh] min-h-[480px] flex-col overflow-hidden lg:flex lg:h-auto lg:min-h-0 ${
          visibleSessions.length > 0 ? "flex" : "hidden"
        }`}
      >
        {/*
          O cliente já está na barra por cima desta caixa; aqui fica o agente
          e a escolha do workflow.
        */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <AvatarMascote tamanho={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold text-foreground">
              {nomeCliente}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedWorkflow
                ? t("Workflow selecionado: {nome} ({tipo})", {
                    nome: selectedWorkflow.nome ?? "Workflow",
                    tipo: selectedWorkflow.tipo ?? t("sem tipo"),
                  })
                : t("Agente em modo teste")}
            </p>
          </div>
          <span className="ds-selo ds-selo-verde ds-selo-ponto">
            {t("Não envia nada a clientes")}
          </span>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label
              className="shrink-0 text-xs font-medium text-muted-foreground"
              htmlFor="admin-workflow"
            >
              {t("Workflow de teste")}
            </label>
            <select
              className="ds-campo h-9 min-w-0 flex-1 py-0 text-sm disabled:bg-muted sm:w-56 sm:flex-none"
              disabled={workflows.length <= 1}
              id="admin-workflow"
              onChange={(event) => setSelectedWorkflowId(event.target.value)}
              value={selectedWorkflowId}
            >
              {workflows.length === 0 ? (
                <option value="">
                  {t("Nenhum workflow ativo configurado")}
                </option>
              ) : workflows.length > 1 ? (
                <option value="">{t("Selecione um workflow")}</option>
              ) : null}
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.nome ?? "Workflow"} (
                  {workflow.tipo ?? t("sem tipo")})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-background/60 px-4 py-5 sm:px-5">
          {chatMessages.length > 0 ? (
            chatMessages.map((chatMessage) => (
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap shadow-[0_1px_1px_rgb(0_0_0/0.04)] sm:max-w-[72%] ${
                  chatMessage.role === "admin"
                    ? "ml-auto rounded-br-md bg-surface text-foreground ring-1 ring-border"
                    : "mr-auto rounded-bl-md bg-[var(--ds-acao)] text-[var(--ds-acao-texto)]"
                }`}
                key={chatMessage.id}
              >
                {chatMessage.text}
              </div>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center">
              {selectedSessionId ? (
                <VazioTela
                  texto={t(
                    "Escreva abaixo como se fosse um cliente. Nada sai para clientes de verdade.",
                  )}
                  titulo={t("Nenhuma mensagem nesta sessão ainda.")}
                />
              ) : (
                <p className="px-4 text-center text-sm text-muted-foreground">
                  {t("Crie ou selecione uma sessão para começar.")}
                </p>
              )}
            </div>
          )}

          {pendingText ? (
            <>
              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-surface px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-foreground ring-1 ring-border sm:max-w-[72%]">
                {pendingText}
              </div>
              <div className="mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--ds-acao-fundo)] px-3.5 py-2.5 text-sm leading-6 text-muted-foreground sm:max-w-[72%]">
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
                {t("Aguardando resposta do agente...")}
              </div>
            </>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-border bg-surface p-3 sm:p-4">
          {error ? (
            <div className="mb-3">
              <AvisoLinha tom="perigo">{error}</AvisoLinha>
            </div>
          ) : null}

          {notice ? (
            <div className="mb-3">
              <AvisoLinha
                acao={
                  lastPendingRun ? (
                    <button
                      className="underline-offset-2 hover:underline disabled:opacity-60"
                      disabled={isChecking}
                      onClick={handleCheckAgain}
                      type="button"
                    >
                      {isChecking
                        ? t("Verificando...")
                        : t("Verificar novamente")}
                    </button>
                  ) : undefined
                }
              >
                {notice}
              </AvisoLinha>
            </div>
          ) : null}

          <form className="flex gap-2" onSubmit={handleSendMessage}>
            <input
              className="ds-campo min-w-0 flex-1 disabled:bg-muted"
              disabled={
                !selectedSessionId ||
                !selectedWorkflowId ||
                isSending ||
                Boolean(pendingText)
              }
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("Digite uma mensagem de teste")}
              value={message}
            />
            <button
              aria-label={t("Enviar")}
              className="ds-botao ds-botao-primario shrink-0"
              disabled={
                !selectedSessionId ||
                !selectedWorkflowId ||
                isSending ||
                Boolean(pendingText) ||
                !message.trim()
              }
              type="submit"
            >
              <SendHorizontal aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isSending ? t("Enviando...") : t("Enviar")}
              </span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

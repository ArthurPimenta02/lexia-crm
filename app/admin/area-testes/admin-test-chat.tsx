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

type AdminTestChatProps = {
  clienteSlug: string;
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
  sessions,
  executions,
  selectedSessionId,
  workflows,
}: AdminTestChatProps) {
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
    messagesEndRef.current?.scrollIntoView({ block: "end" });
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
        setError(result.error ?? "Não foi possível criar a sessão de teste.");
        return;
      }

      router.push(sessionHref(result.data.session_id));
      router.refresh();
    });
  }

  function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir esta conversa de teste admin? As execuções e feedbacks ligados a ela também serão removidos.",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await deleteAdminTestSession(clienteSlug, sessionId);

      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir a sessão.");
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
          "Mensagem enviada, mas ainda não houve resposta gravada pelo workflow.",
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
        setError(result.error ?? "Não foi possível enviar a mensagem.");
        return;
      }

      pollForExecution(selectedSessionId, result.data.runId, text);
    });
  }

  return (
    <div className="grid h-[calc(100vh-250px)] min-h-[540px] gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Sessões</h2>
          <button
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border-strong"
            disabled={isCreating}
            onClick={handleCreateSession}
            type="button"
          >
            {isCreating ? "Criando..." : "Nova"}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {visibleSessions.length > 0 ? (
            visibleSessions.map((session) => (
              <div
                className={`rounded-lg p-2 text-sm transition ${
                  selectedSessionId === session.session_id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                key={session.id}
              >
                <Link
                  className="block"
                  href={sessionHref(session.session_id)}
                  onClick={() => {
                    setLocalExecutions([]);
                    setPendingText(null);
                    setLastPendingRun(null);
                    setNotice(null);
                    setError(null);
                  }}
                >
                  <span className="block font-medium">
                    {session.nome ?? "Nova sessão"}
                  </span>
                  <span className="block truncate text-xs opacity-70">
                    {session.session_id}
                  </span>
                </Link>
                <button
                  className={`mt-2 text-xs font-medium underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedSessionId === session.session_id
                      ? "text-primary-foreground/80"
                      : "text-red-600"
                  }`}
                  disabled={isCreating}
                  onClick={() => handleDeleteSession(session.session_id)}
                  type="button"
                >
                  Excluir
                </button>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Nenhuma sessão criada ainda.
            </p>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          {/*
            O slug do cliente já está no selector por cima desta caixa.
            Repeti-lo em "Cliente selecionado: ..." não acrescentava nada.
          */}
          <h2 className="font-semibold">Chat de teste</h2>
          <div className="mt-4 flex max-w-xl flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="admin-workflow"
            >
              Workflow de teste
            </label>
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition focus:border-foreground disabled:bg-muted"
              disabled={workflows.length <= 1}
              id="admin-workflow"
              onChange={(event) => setSelectedWorkflowId(event.target.value)}
              value={selectedWorkflowId}
            >
              {workflows.length === 0 ? (
                <option value="">Nenhum workflow ativo configurado</option>
              ) : workflows.length > 1 ? (
                <option value="">Selecione um workflow</option>
              ) : null}
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.nome ?? "Workflow"} ({workflow.tipo ?? "sem tipo"})
                </option>
              ))}
            </select>
            {selectedWorkflow ? (
              <p className="text-xs text-muted-foreground">
                Workflow selecionado: {selectedWorkflow.nome ?? "Workflow"} (
                {selectedWorkflow.tipo ?? "sem tipo"})
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {chatMessages.length > 0 ? (
            chatMessages.map((chatMessage) => (
              <div
                className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${
                  chatMessage.role === "admin"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted text-foreground"
                }`}
                key={chatMessage.id}
              >
                {chatMessage.text}
              </div>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
              {selectedSessionId
                ? "Nenhuma mensagem nesta sessão ainda."
                : "Crie ou selecione uma sessão para começar."}
            </div>
          )}

          {pendingText ? (
            <>
              <div className="ml-auto max-w-[78%] rounded-lg bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
                {pendingText}
              </div>
              <div className="mr-auto max-w-[78%] rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                Aguardando resposta do agente...
              </div>
            </>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-border p-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {notice ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>{notice}</p>
              {lastPendingRun ? (
                <button
                  className="h-9 rounded-lg border border-amber-300 bg-surface px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isChecking}
                  onClick={handleCheckAgain}
                  type="button"
                >
                  {isChecking ? "Verificando..." : "Verificar novamente"}
                </button>
              ) : null}
            </div>
          ) : null}

          <form className="flex gap-3" onSubmit={handleSendMessage}>
            <input
              className="h-11 flex-1 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground disabled:bg-muted"
              disabled={
                !selectedSessionId ||
                !selectedWorkflowId ||
                isSending ||
                Boolean(pendingText)
              }
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Digite uma mensagem de teste"
              value={message}
            />
            <button
              className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border-strong"
              disabled={
                !selectedSessionId ||
                !selectedWorkflowId ||
                isSending ||
                Boolean(pendingText) ||
                !message.trim()
              }
              type="submit"
            >
              {isSending ? "Enviando..." : "Enviar"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

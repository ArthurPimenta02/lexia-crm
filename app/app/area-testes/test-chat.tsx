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
  createTestSession,
  deleteTestSession,
  saveExecutionFeedback,
  getExecutionByRunId,
  getSessionExecutions,
  sendTestMessage,
  type FeedbackRating,
  type TestFeedback,
  type TestExecution,
  type TestSession,
  type TestWorkflow,
} from "@/app/app/area-testes/actions";

type TestChatProps = {
  sessions: TestSession[];
  executions: TestExecution[];
  feedbacks: TestFeedback[];
  selectedSessionId: string | null;
  workflows: TestWorkflow[];
};

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  execution?: TestExecution;
  isLastAgentMessage?: boolean;
};

type PendingRun = {
  sessionId: string;
  runId: string;
  text: string;
};

type FeedbackDraft = {
  executionId: string;
  avaliacao: Exclude<FeedbackRating, "boa_resposta">;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45;

const feedbackOptions: { label: string; value: FeedbackRating }[] = [
  { label: "Boa resposta", value: "boa_resposta" },
  { label: "Precisa ajuste", value: "precisa_ajuste" },
  { label: "Erro grave", value: "erro_grave" },
];

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

function normalizeAgentMessages(execution: TestExecution) {
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

function buildChatMessages(executions: TestExecution[]) {
  return executions.flatMap((execution) => {
    const messages: ChatMessage[] = [];

    if (execution.mensagem_teste) {
      messages.push({
        id: `${execution.id}-user`,
        role: "user",
        text: execution.mensagem_teste,
      });
    }

    const agentMessages = normalizeAgentMessages(execution);

    for (const [index, text] of agentMessages.entries()) {
      messages.push({
        id: `${execution.id}-agent-${index}`,
        role: "agent",
        text,
        execution,
        isLastAgentMessage: index === agentMessages.length - 1,
      });
    }

    return messages;
  });
}

export function TestChat({
  sessions,
  executions,
  feedbacks,
  selectedSessionId,
  workflows,
}: TestChatProps) {
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
  const [feedbackByExecution, setFeedbackByExecution] = useState(() =>
    Object.fromEntries(
      feedbacks.map((feedback) => [
        feedback.teste_execucao_id,
        feedback.avaliacao,
      ]),
    ) as Record<string, FeedbackRating>,
  );
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
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
  }, [chatMessages.length, pendingText, feedbackDraft]);

  function handleCreateSession() {
    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await createTestSession();

      if (result.error || !result.data) {
        setError(result.error ?? "Não foi possível criar a sessão de teste.");
        return;
      }

      router.push(`/app/area-testes?session=${result.data.session_id}`);
      router.refresh();
    });
  }

  function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir esta conversa de teste? As mensagens, respostas e feedbacks ligados a esta sessão também serão removidos.",
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await deleteTestSession(sessionId);

      if (!result.ok) {
        setError(result.error ?? "Não foi possível excluir a sessão.");
        return;
      }

      setDeletedSessionIds((current) =>
        new Set(current).add(sessionId),
      );

      if (selectedSessionId === sessionId) {
        setLocalExecutions([]);
        setPendingText(null);
        setLastPendingRun(null);
        router.push("/app/area-testes");
      }

      router.refresh();
    });
  }

  async function updateChatFromExecution(
    sessionId: string,
    execution: TestExecution,
  ) {
    const refreshed = await getSessionExecutions(sessionId);

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
      const result = await getExecutionByRunId(sessionId, runId);

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
            cliente_slug: "",
            origem: "painel_cliente",
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
      const result = await getExecutionByRunId(
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

  function handleFeedback(
    execution: TestExecution,
    avaliacao: FeedbackRating,
    comentario?: string,
  ) {
    setError(null);
    setSavingFeedbackId(`${execution.id}:${avaliacao}`);
    startChecking(async () => {
      const result = await saveExecutionFeedback(
        execution.id,
        avaliacao,
        comentario,
      );

      setSavingFeedbackId(null);

      if (result.error || !result.data) {
        setError(result.error ?? "Não foi possível salvar o feedback.");
        return;
      }

      const savedFeedback = result.data;

      setFeedbackByExecution((current) => ({
        ...current,
        [savedFeedback.teste_execucao_id]: savedFeedback.avaliacao,
      }));
      setFeedbackDraft(null);
      setFeedbackComment("");
      router.refresh();
    });
  }

  function handleFeedbackOption(
    execution: TestExecution,
    avaliacao: FeedbackRating,
  ) {
    if (avaliacao === "boa_resposta") {
      handleFeedback(execution, avaliacao);
      return;
    }

    setError(null);
    setFeedbackComment("");
    setFeedbackDraft({ executionId: execution.id, avaliacao });
  }

  function handleFeedbackSubmit(execution: TestExecution) {
    if (!feedbackDraft || feedbackDraft.executionId !== execution.id) {
      return;
    }

    handleFeedback(execution, feedbackDraft.avaliacao, feedbackComment);
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
      const result = await sendTestMessage(
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
    <div className="grid h-[calc(100vh-190px)] min-h-[580px] gap-5 lg:grid-cols-[310px_1fr]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">
              Conversas de teste
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Histórico das simulações
            </p>
          </div>
          <button
            className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
            disabled={isCreating}
            onClick={handleCreateSession}
            type="button"
          >
            {isCreating ? "Criando..." : "Nova conversa"}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {visibleSessions.length > 0 ? (
            visibleSessions.map((session) => (
              <div
                className={`rounded-md border p-3 text-sm transition ${
                  selectedSessionId === session.session_id
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-[0_14px_34px_rgba(0,0,0,0.16)]"
                    : "border-zinc-200 bg-[#fbfbfa] text-zinc-700 hover:border-zinc-400 hover:bg-white hover:text-zinc-950"
                }`}
                key={session.id}
              >
                <Link
                  className="block"
                  href={`/app/area-testes?session=${session.session_id}`}
                  onClick={() => {
                    setLocalExecutions([]);
                    setPendingText(null);
                    setLastPendingRun(null);
                    setNotice(null);
                    setError(null);
                  }}
                >
                  <span className="block font-medium">
                    {session.nome ?? "Nova conversa"}
                  </span>
                  <span className="mt-1 block text-xs opacity-70">
                    Conversa de teste
                  </span>
                </Link>
                <button
                  className={`mt-2 text-xs font-medium underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedSessionId === session.session_id
                      ? "text-white/80"
                      : "text-zinc-500"
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
            <p className="px-3 py-8 text-sm text-zinc-500">
              Ainda não há conversas de teste.
            </p>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.08)]">
        <div className="border-b border-zinc-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="font-semibold text-zinc-950">
                Simulador de conversa
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Envie mensagens como se fosse uma conversa real com o agente.
              </p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2">
              <label
                className="text-sm font-medium text-zinc-700"
                htmlFor="workflow"
              >
                Canal de teste
              </label>
              <select
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 disabled:bg-zinc-100 disabled:text-zinc-400"
                disabled={workflows.length <= 1}
                id="workflow"
                onChange={(event) => setSelectedWorkflowId(event.target.value)}
                value={selectedWorkflowId}
              >
                {workflows.length === 0 ? (
                  <option value="">Nenhum canal configurado</option>
                ) : workflows.length > 1 ? (
                  <option value="">Seleccione um canal</option>
                ) : null}
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>
                    {workflow.tipo ?? workflow.nome ?? "Canal"}
                  </option>
                ))}
              </select>
              {selectedWorkflow ? (
                <p className="text-xs text-zinc-500">
                  Canal activo: {selectedWorkflow.tipo ?? "agente"}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#f3f3f1] p-5">
          {chatMessages.length > 0 ? (
            chatMessages.map((chatMessage) => {
              const selectedFeedback = chatMessage.execution
                ? feedbackByExecution[chatMessage.execution.id]
                : null;

              return (
                <div
                  className={
                    chatMessage.role === "user"
                      ? "ml-auto flex max-w-[78%] flex-col items-end gap-2"
                      : "mr-auto flex max-w-[78%] flex-col items-start gap-2"
                  }
                  key={chatMessage.id}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                      chatMessage.role === "user"
                        ? "bg-zinc-950 text-white"
                        : "border border-zinc-200 bg-white text-zinc-800"
                    }`}
                  >
                    {chatMessage.text}
                  </div>

                  {chatMessage.role === "agent" &&
                  chatMessage.execution &&
                  chatMessage.isLastAgentMessage ? (
                    <div className="flex w-full max-w-xl flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {feedbackOptions.map((option) => {
                          const draftRating =
                            feedbackDraft
                              ? feedbackDraft.executionId ===
                                chatMessage.execution?.id
                                ? feedbackDraft.avaliacao
                                : null
                              : null;
                          const selected =
                            (draftRating ?? selectedFeedback) === option.value;
                          const feedbackKey = `${chatMessage.execution?.id}:${option.value}`;

                          return (
                            <button
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                selected
                                  ? "border-zinc-950 bg-zinc-950 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-950"
                              }`}
                              disabled={savingFeedbackId === feedbackKey}
                              key={option.value}
                              onClick={() =>
                                handleFeedbackOption(
                                  chatMessage.execution!,
                                  option.value,
                                )
                              }
                              type="button"
                            >
                              {option.label}
                            </button>
                          );
                        })}
                        {selectedFeedback ? (
                          <span className="text-xs text-zinc-500">
                            Feedback enviado
                          </span>
                        ) : null}
                      </div>

                      {feedbackDraft?.executionId ===
                      chatMessage.execution.id ? (
                        <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
                          <textarea
                            className="min-h-24 w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5"
                            onChange={(event) =>
                              setFeedbackComment(event.target.value)
                            }
                            placeholder="Descreva o que deveria ser melhorado nesta resposta..."
                            value={feedbackComment}
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                              disabled={
                                savingFeedbackId ===
                                `${chatMessage.execution.id}:${feedbackDraft.avaliacao}`
                              }
                              onClick={() =>
                                handleFeedbackSubmit(chatMessage.execution!)
                              }
                              type="button"
                            >
                              Enviar feedback
                            </button>
                            <button
                              className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950"
                              onClick={() => {
                                setFeedbackDraft(null);
                                setFeedbackComment("");
                              }}
                              type="button"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
              {selectedSessionId
                ? "Nenhuma mensagem nesta sessão ainda."
                : "Crie ou selecione uma sessão para começar."}
            </div>
          )}

          {pendingText ? (
            <>
              <div className="ml-auto max-w-[78%] rounded-2xl bg-zinc-950 px-4 py-3 text-sm leading-6 text-white shadow-sm">
                {pendingText}
              </div>
              <div className="mr-auto max-w-[78%] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 text-zinc-600 shadow-sm">
                Aguardando resposta do agente...
              </div>
            </>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4">
          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {notice ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>
                A mensagem foi enviada, mas o agente ainda não devolveu uma
                resposta.
              </p>
              {lastPendingRun ? (
                <button
                  className="h-9 rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="h-12 flex-1 rounded-md border border-zinc-300 bg-white px-4 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={
                !selectedSessionId ||
                !selectedWorkflowId ||
                isSending ||
                Boolean(pendingText)
              }
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Escreva uma mensagem para o agente"
              value={message}
            />
            <button
              className="h-12 rounded-md bg-zinc-950 px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
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

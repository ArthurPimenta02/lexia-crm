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
import {
  Check,
  Loader2,
  MessageSquare,
  Plus,
  SendHorizontal,
  Trash2,
} from "lucide-react";

import { useIdioma } from "@/app/components/idioma";
import { AvatarMascote } from "@/app/components/mascote";
import { AvisoLinha, CabecalhoTela, VazioTela } from "@/app/components/tela";

/** Resumo de uma conversa de teste na lista (calculado no servidor). */
export type ResumoSessao = {
  feedbacks: number;
  mensagens: number;
  /** Hora (se foi hoje) ou dia da última mensagem, já formatado. */
  quando: string | null;
};

type TestChatProps = {
  /** Nome do cliente, para o cabeçalho e o topo do chat. */
  nomeCliente: string;
  resumos: Record<string, ResumoSessao>;
  sessions: TestSession[];
  executions: TestExecution[];
  feedbacks: TestFeedback[];
  selectedSessionId: string | null;
  /** Conta só de testes com um agente: não mostra a escolha de canal (já vem escolhido). */
  semEscolhaDeCanal?: boolean;
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
  nomeCliente,
  resumos,
  sessions,
  executions,
  feedbacks,
  selectedSessionId,
  semEscolhaDeCanal = false,
  workflows,
}: TestChatProps) {
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
  const [feedbackByExecution, setFeedbackByExecution] = useState(
    () =>
      Object.fromEntries(
        feedbacks.map((feedback) => [
          feedback.teste_execucao_id,
          feedback.avaliacao,
        ]),
      ) as Record<string, FeedbackRating>,
  );
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft | null>(
    null,
  );
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
    // Rola só a caixa do chat; o scrollIntoView rolava a página inteira
    // no celular e escondia o cabeçalho.
    const caixa = messagesEndRef.current?.parentElement;
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, [chatMessages.length, pendingText, feedbackDraft]);

  function handleCreateSession() {
    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await createTestSession();

      if (result.error || !result.data) {
        setError(
          result.error ?? t("Não foi possível criar a sessão de teste."),
        );
        return;
      }

      router.push(`/app/area-testes?session=${result.data.session_id}`);
      router.refresh();
    });
  }

  function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm(
      t(
        "Tem certeza que deseja excluir esta conversa de teste? As mensagens, respostas e feedbacks ligados a esta sessão também serão removidos.",
      ),
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    startCreating(async () => {
      const result = await deleteTestSession(sessionId);

      if (!result.ok) {
        setError(result.error ?? t("Não foi possível excluir a sessão."));
        return;
      }

      setDeletedSessionIds((current) => new Set(current).add(sessionId));

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
        setError(result.error ?? t("Não foi possível salvar o feedback."));
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
        setError(result.error ?? t("Não foi possível enviar a mensagem."));
        return;
      }

      pollForExecution(selectedSessionId, result.data.runId, text);
    });
  }

  const totalFeedbacks = Object.values(resumos).reduce(
    (soma, resumo) => soma + resumo.feedbacks,
    0,
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <button
            className="ds-botao ds-botao-primario"
            disabled={isCreating}
            onClick={handleCreateSession}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {isCreating ? t("Criando...") : t("Nova conversa")}
          </button>
        }
        resto={
          <>
            {t("Converse com o agente")}{" "}
            <span className="text-accent">{t("antes do cliente.")}</span>
          </>
        }
        sobretitulo={`${t("Área de testes")} · ${nomeCliente}`}
        subtitulo={
          visibleSessions.length > 0
            ? `${
                visibleSessions.length === 1
                  ? t("1 conversa de teste")
                  : t("{n} conversas de teste", { n: visibleSessions.length })
              } · ${
                totalFeedbacks === 1
                  ? t("1 feedback")
                  : t("{n} feedbacks", { n: totalFeedbacks })
              }`
            : undefined
        }
      />

      <div className="grid min-w-0 gap-4 lg:h-[calc(100dvh-230px)] lg:min-h-[560px] lg:grid-cols-[300px_1fr]">
        <aside className="ds-bloco flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <h2 className="ds-titulo-3 text-foreground">
              {t("Conversas de teste")}
            </h2>
          </div>

          <div className="tela-lista flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2 lg:max-h-none">
            {visibleSessions.length > 0 ? (
              visibleSessions.map((session) => {
                const resumo = resumos[session.session_id];
                const selecionada = selectedSessionId === session.session_id;
                const detalhes = [
                  resumo && resumo.mensagens > 0
                    ? resumo.mensagens === 1
                      ? t("1 mensagem")
                      : t("{n} mensagens", { n: resumo.mensagens })
                    : t("Sem mensagens"),
                  resumo && resumo.feedbacks > 0
                    ? resumo.feedbacks === 1
                      ? t("1 feedback")
                      : t("{n} feedbacks", { n: resumo.feedbacks })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    aria-selected={selecionada}
                    className="tela-linha group"
                    key={session.id}
                  >
                    <Link
                      className="flex min-w-0 flex-1 items-center gap-3"
                      href={`/app/area-testes?session=${session.session_id}`}
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
                          {session.nome === "Nova sessão"
                            ? t("Nova sessão")
                            : (session.nome ?? t("Nova conversa"))}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground tabular-nums">
                          {detalhes}
                        </span>
                      </span>
                      {resumo?.quando ? (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {resumo.quando}
                        </span>
                      ) : null}
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
                acao={
                  <button
                    className="ds-botao ds-botao-primario ds-botao-p"
                    disabled={isCreating}
                    onClick={handleCreateSession}
                    type="button"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {isCreating ? t("Criando...") : t("Nova conversa")}
                  </button>
                }
                texto={t(
                  "Comece uma conversa e escreva como se fosse um cliente.",
                )}
                titulo={t("Ainda não há conversas de teste.")}
              />
            )}
          </div>
        </aside>

        {/* Sem conversas, no celular o chat vazio só empurrava a tela para baixo. */}
        <section
          className={`ds-bloco h-[72dvh] min-h-[480px] flex-col overflow-hidden lg:flex lg:h-auto lg:min-h-0 ${
            visibleSessions.length > 0 ? "flex" : "hidden"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
            <AvatarMascote tamanho={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-semibold text-foreground">
                {nomeCliente}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("Agente em modo teste")}
              </p>
            </div>
            <span className="ds-selo ds-selo-verde ds-selo-ponto">
              {t("Não envia nada a clientes")}
            </span>
            {semEscolhaDeCanal ? null : (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label
                  className="shrink-0 text-xs font-medium text-muted-foreground"
                  htmlFor="workflow"
                >
                  {t("Canal de teste")}
                </label>
                <select
                  className="ds-campo h-9 min-w-0 flex-1 py-0 text-sm disabled:bg-muted disabled:text-muted-foreground sm:w-48 sm:flex-none"
                  disabled={workflows.length <= 1}
                  id="workflow"
                  onChange={(event) =>
                    setSelectedWorkflowId(event.target.value)
                  }
                  title={
                    selectedWorkflow
                      ? t("Canal ativo: {canal}", {
                          canal: selectedWorkflow.tipo ?? t("agente"),
                        })
                      : undefined
                  }
                  value={selectedWorkflowId}
                >
                  {workflows.length === 0 ? (
                    <option value="">{t("Nenhum canal configurado")}</option>
                  ) : workflows.length > 1 ? (
                    <option value="">{t("Selecione um canal")}</option>
                  ) : null}
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.tipo ?? workflow.nome ?? t("Canal")}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-background/60 px-4 py-5 sm:px-5">
            {chatMessages.length > 0 ? (
              chatMessages.map((chatMessage) => {
                const selectedFeedback = chatMessage.execution
                  ? feedbackByExecution[chatMessage.execution.id]
                  : null;

                return (
                  <div
                    className={
                      chatMessage.role === "user"
                        ? "ml-auto flex max-w-[88%] flex-col items-end gap-1.5 sm:max-w-[72%]"
                        : "mr-auto flex max-w-[88%] flex-col items-start gap-1.5 sm:max-w-[72%]"
                    }
                    key={chatMessage.id}
                  >
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap shadow-[0_1px_1px_rgb(0_0_0/0.04)] ${
                        chatMessage.role === "user"
                          ? "rounded-br-md bg-surface text-foreground ring-1 ring-border"
                          : "rounded-bl-md bg-[var(--ds-acao)] text-[var(--ds-acao-texto)]"
                      }`}
                    >
                      {chatMessage.text}
                    </div>

                    {chatMessage.role === "agent" &&
                    chatMessage.execution &&
                    chatMessage.isLastAgentMessage ? (
                      <div className="flex w-full max-w-xl flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {feedbackOptions.map((option) => {
                            const draftRating = feedbackDraft
                              ? feedbackDraft.executionId ===
                                chatMessage.execution?.id
                                ? feedbackDraft.avaliacao
                                : null
                              : null;
                            const selected =
                              (draftRating ?? selectedFeedback) ===
                              option.value;
                            const feedbackKey = `${chatMessage.execution?.id}:${option.value}`;
                            const corSelecionada =
                              option.value === "boa_resposta"
                                ? "bg-[var(--ds-acao-fundo)] text-[var(--ds-acao-forte)] ring-transparent"
                                : option.value === "precisa_ajuste"
                                  ? "bg-[var(--ds-alerta-fundo)] text-[var(--ds-alerta)] ring-transparent"
                                  : "bg-[var(--ds-perigo-fundo)] text-[var(--ds-perigo)] ring-transparent";

                            return (
                              <button
                                aria-pressed={selected}
                                className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.71875rem] font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  selected
                                    ? corSelecionada
                                    : "bg-surface text-muted-foreground ring-border hover:text-foreground hover:ring-border-strong"
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
                                {selected && option.value === "boa_resposta" ? (
                                  <Check
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                  />
                                ) : null}
                                {t(option.label)}
                              </button>
                            );
                          })}
                          {selectedFeedback ? (
                            <span className="text-[0.71875rem] text-muted-foreground">
                              {t("Feedback enviado")}
                            </span>
                          ) : null}
                        </div>

                        {feedbackDraft?.executionId ===
                        chatMessage.execution.id ? (
                          <div className="ds-bloco p-3">
                            <textarea
                              className="ds-campo min-h-24 resize-none py-2 placeholder:text-muted-foreground/60"
                              onChange={(event) =>
                                setFeedbackComment(event.target.value)
                              }
                              placeholder={t(
                                "Descreva o que deveria ser melhorado nesta resposta...",
                              )}
                              value={feedbackComment}
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                className="ds-botao ds-botao-primario ds-botao-p"
                                disabled={
                                  savingFeedbackId ===
                                  `${chatMessage.execution.id}:${feedbackDraft.avaliacao}`
                                }
                                onClick={() =>
                                  handleFeedbackSubmit(chatMessage.execution!)
                                }
                                type="button"
                              >
                                {t("Enviar feedback")}
                              </button>
                              <button
                                className="ds-botao ds-botao-secundario ds-botao-p"
                                onClick={() => {
                                  setFeedbackDraft(null);
                                  setFeedbackComment("");
                                }}
                                type="button"
                              >
                                {t("Cancelar")}
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
                  {t(
                    "A mensagem foi enviada, mas o agente ainda não devolveu uma resposta.",
                  )}
                </AvisoLinha>
              </div>
            ) : null}

            <form className="flex gap-2" onSubmit={handleSendMessage}>
              <input
                className="ds-campo min-w-0 flex-1 placeholder:text-muted-foreground/60 disabled:bg-muted disabled:text-muted-foreground"
                disabled={
                  !selectedSessionId ||
                  !selectedWorkflowId ||
                  isSending ||
                  Boolean(pendingText)
                }
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("Escreva como se fosse um cliente")}
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
    </div>
  );
}

"use client";

import {
  ArrowUp,
  BarChart3,
  CalendarDays,
  ChevronRight,
  MessageSquareText,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AnalystChatMessage } from "@/lib/analyst/types";

type AnalystClientOption = {
  name: string;
  slug: string;
};

type AnalystWorkspaceProps = {
  client: AnalystClientOption;
  clientOptions?: AnalystClientOption[];
  mode: "admin" | "client";
};

type AnalystSession = {
  atualizado_em: string;
  contexto: Record<string, unknown> | null;
  criado_em: string;
  id: string;
  titulo: string | null;
};

const periodOptions = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "personalizado", label: "Personalizada" },
] as const;

const channelOptions = [
  { color: "bg-zinc-950", key: "todos", label: "Todos" },
  { color: "bg-emerald-500", key: "whatsapp", label: "WhatsApp" },
  { color: "bg-pink-500", key: "instagram", label: "Instagram" },
  { color: "bg-indigo-500", key: "messenger", label: "Messenger" },
] as const;

const suggestedQuestions = [
  "Quais são as maiores objeções dos leads neste período?",
  "Como o agente está se saindo e onde pode melhorar?",
  "Compare volume, autonomia e tempo de resposta.",
  "Quais padrões aparecem nos feedbacks registrados?",
];

function getTodayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createWelcomeMessage(clientName: string): AnalystChatMessage {
  return {
    content: `O que você quer entender sobre o atendimento da ${clientName}?`,
    id: "welcome",
    role: "assistant",
  };
}

async function readApiResponse(response: Response) {
  const rawBody = await response.text();
  let result: Record<string, unknown> = {};

  if (rawBody) {
    try {
      result = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new Error(
        response.ok
          ? "A plataforma recebeu uma resposta inválida. Tente novamente."
          : "O serviço de análise está temporariamente indisponível.",
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Não foi possível carregar os dados.",
    );
  }
  return result;
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Polling cancelado", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function AnalystWorkspace({
  client,
  clientOptions = [],
  mode,
}: AnalystWorkspaceProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const [period, setPeriod] = useState("mes");
  const [channel, setChannel] = useState("todos");
  const [customStart, setCustomStart] = useState(getTodayInputValue);
  const [customEnd, setCustomEnd] = useState(getTodayInputValue);
  const [messages, setMessages] = useState<AnalystChatMessage[]>(() => [
    createWelcomeMessage(client.name),
  ]);
  const [sessions, setSessions] = useState<AnalystSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Analisando os dados");

  const scopePayload = useMemo(
    () => ({
      canal: channel,
      clienteSlug: client.slug,
      fim: period === "personalizado" ? customEnd : "",
      inicio: period === "personalizado" ? customStart : "",
      periodo: period,
    }),
    [channel, client.slug, customEnd, customStart, period],
  );

  const resetConversation = useCallback(() => {
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;
    setSessionId(null);
    setMessages([createWelcomeMessage(client.name)]);
    setQuestion("");
    setRequestError(null);
    setIsLoading(false);
  }, [client.name]);

  const fetchSessions = useCallback(async () => {
    const params = new URLSearchParams({ clienteSlug: client.slug });
    const response = await fetch(`/api/analista/sessions?${params}`, {
      cache: "no-store",
    });
    const result = await readApiResponse(response);

    setSessions((result.sessions as AnalystSession[] | undefined) ?? []);
  }, [client.slug]);

  useEffect(() => {
    const controller = new AbortController();
    const sessionParams = new URLSearchParams({ clienteSlug: client.slug });

    fetch(`/api/analista/sessions?${sessionParams}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(readApiResponse)
      .then((sessionResult) => {
        setSessions(
          (sessionResult.sessions as AnalystSession[] | undefined) ?? [],
        );
        setConfigurationError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setConfigurationError(
          error instanceof Error ? error.message : "Configuração indisponível.",
        );
      });

    return () => controller.abort();
  }, [client.slug]);

  useEffect(
    () => () => {
      pollingAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isLoading, messages]);

  function changePeriod(nextPeriod: string) {
    setPeriod(nextPeriod);
    resetConversation();
  }

  function changeChannel(nextChannel: string) {
    setChannel(nextChannel);
    resetConversation();
  }

  const pollExecution = useCallback(
    async (executionId: string) => {
      pollingAbortRef.current?.abort();
      const controller = new AbortController();
      pollingAbortRef.current = controller;
      const deadline = Date.now() + 10 * 60 * 1000;

      try {
        while (!controller.signal.aborted && Date.now() < deadline) {
          const params = new URLSearchParams({
            clienteSlug: client.slug,
            execucaoId: executionId,
          });
          const response = await fetch(`/api/analista/status?${params}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const result = await readApiResponse(response);
          const status = String(result.status ?? "");

          if (status === "completed") {
            const message = result.message as AnalystChatMessage | undefined;
            if (!message) {
              throw new Error("A resposta concluída não pôde ser carregada.");
            }

            setSessionId(String(result.sessionId ?? "") || null);
            setMessages((current) =>
              current.some((item) => item.id === message.id)
                ? current
                : [...current, message],
            );
            await fetchSessions();
            return;
          }

          if (status === "failed") {
            throw new Error(
              typeof result.error === "string"
                ? result.error
                : "A análise não pôde ser concluída.",
            );
          }

          await waitForNextPoll(1500, controller.signal);
        }

        if (!controller.signal.aborted) {
          throw new Error(
            "A análise demorou mais do que o esperado. Tente novamente.",
          );
        }
      } finally {
        if (pollingAbortRef.current === controller) {
          pollingAbortRef.current = null;
        }
      }
    },
    [client.slug, fetchSessions],
  );

  async function loadSession(nextSessionId: string) {
    pollingAbortRef.current?.abort();
    setRequestError(null);
    setLoadingLabel("Carregando a análise");
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        clienteSlug: client.slug,
        sessaoId: nextSessionId,
      });
      const response = await fetch(`/api/analista/sessions?${params}`, {
        cache: "no-store",
      });
      const result = await readApiResponse(response);

      const selectedSession = (
        (result.sessions as AnalystSession[] | undefined) ?? []
      ).find((session) => session.id === nextSessionId);
      const savedContext = selectedSession?.contexto ?? {};
      const savedPeriod = String(savedContext.periodo ?? "");
      const savedChannel = String(savedContext.canal ?? "");
      const savedStart = String(savedContext.data_inicio ?? "");
      const savedEnd = String(savedContext.data_fim ?? "");

      if (periodOptions.some((option) => option.key === savedPeriod)) {
        setPeriod(savedPeriod);
      }
      if (channelOptions.some((option) => option.key === savedChannel)) {
        setChannel(savedChannel);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(savedStart)) {
        setCustomStart(savedStart);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(savedEnd)) {
        setCustomEnd(savedEnd);
      }

      setSessionId(nextSessionId);
      setMessages(
        (result.messages as AnalystChatMessage[] | undefined) ?? [],
      );

      const pendingExecutionId = String(result.pendingExecutionId ?? "");
      if (pendingExecutionId) {
        setLoadingLabel("Analisando as conversas");
        await pollExecution(pendingExecutionId);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequestError(
        error instanceof Error ? error.message : "Não foi possível continuar.",
      );
    } finally {
      setIsLoading(false);
      setLoadingLabel("Analisando os dados");
    }
  }

  async function sendQuestion(value?: string) {
    const nextQuestion = String(value ?? question).trim();
    if (!nextQuestion || isLoading) return;

    const userMessage: AnalystChatMessage = {
      content: nextQuestion,
      id: crypto.randomUUID(),
      role: "user",
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setRequestError(null);
    setIsLoading(true);

    try {
      setLoadingLabel("Enviando para análise");
      const response = await fetch("/api/analista/chat", {
        body: JSON.stringify({
          ...scopePayload,
          pergunta: nextQuestion,
          sessaoId: sessionId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await readApiResponse(response);
      const executionId = String(result.executionId ?? "");
      const nextSessionId = String(result.sessionId ?? "");

      if (!executionId || !nextSessionId) {
        throw new Error("A execução da análise não foi criada corretamente.");
      }

      setSessionId(nextSessionId);
      setLoadingLabel("Analisando as conversas");
      await pollExecution(executionId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequestError(
        error instanceof Error
          ? error.message
          : "O Analista Lexia não conseguiu responder.",
      );
    } finally {
      setIsLoading(false);
      setLoadingLabel("Analisando os dados");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion();
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-7rem)] w-full max-w-[1500px] flex-col gap-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.3em] text-zinc-500 uppercase">
            Inteligência
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <Sparkles aria-hidden="true" size={19} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-zinc-950">
                Analista Lexia
              </h1>
              <p className="mt-1 text-sm text-zinc-600">{client.name}</p>
            </div>
          </div>
        </div>

        {mode === "admin" && clientOptions.length > 0 ? (
          <label className="flex min-w-64 flex-col gap-2 text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
            Cliente
            <select
              className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium tracking-normal text-zinc-950 normal-case outline-none focus:border-zinc-950"
              onChange={(event) =>
                router.push(
                  `/admin/analista?cliente=${encodeURIComponent(event.target.value)}`,
                )
              }
              value={client.slug}
            >
              {clientOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              <CalendarDays aria-hidden="true" size={15} />
              Período
            </div>
            <div className="flex flex-wrap gap-2">
              {periodOptions.map((option) => (
                <button
                  className={`h-9 rounded-full border px-3 text-sm font-semibold transition ${
                    period === option.key
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                  key={option.key}
                  onClick={() => changePeriod(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {period === "personalizado" ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600">
                Início
                <input
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
                  onChange={(event) => {
                    setCustomStart(event.target.value);
                    resetConversation();
                  }}
                  type="date"
                  value={customStart}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium text-zinc-600">
                Fim
                <input
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
                  onChange={(event) => {
                    setCustomEnd(event.target.value);
                    resetConversation();
                  }}
                  type="date"
                  value={customEnd}
                />
              </label>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              Canal
            </p>
            <div className="flex flex-wrap gap-2">
              {channelOptions.map((option) => (
                <button
                  className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition ${
                    channel === option.key
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                  key={option.key}
                  onClick={() => changeChannel(option.key)}
                  type="button"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${option.color}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {configurationError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {configurationError}
        </div>
      ) : null}

      <div className="grid min-h-[680px] flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[0_20px_55px_rgba(0,0,0,0.07)] xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-zinc-200 bg-[#f7f7f5] xl:border-r xl:border-b-0">
          <div className="border-b border-zinc-200 p-4">
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
              onClick={resetConversation}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              Nova análise
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="px-2 py-2 text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
              Recentes
            </p>
            <div className="space-y-1">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <button
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition ${
                      sessionId === session.id
                        ? "bg-zinc-950 text-white"
                        : "text-zinc-700 hover:bg-white hover:text-zinc-950"
                    }`}
                    key={session.id}
                    disabled={isLoading}
                    onClick={() => void loadSession(session.id)}
                    type="button"
                  >
                    <span className="truncate">
                      {session.titulo || "Análise sem título"}
                    </span>
                    <ChevronRight aria-hidden="true" size={15} />
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-xs leading-5 text-zinc-500">
                  Nenhuma análise salva.
                </p>
              )}
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col bg-white">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
              {messages.map((message) => (
                <div
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[78%] ${
                      message.role === "user"
                        ? "rounded-lg bg-zinc-950 px-4 py-3 text-white"
                        : "w-full text-zinc-900"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">
                        <Sparkles aria-hidden="true" size={14} />
                        Analista Lexia
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap text-sm leading-7">
                      {message.content}
                    </div>

                    {message.sources && message.sources.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {message.sources.map((source) => (
                          <Link
                            className="group rounded-md border border-zinc-200 bg-[#fafaf9] p-3 transition hover:border-zinc-400 hover:bg-white"
                            href={source.href}
                            key={source.conversationId}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <MessageSquareText
                                  aria-hidden="true"
                                  className="shrink-0 text-zinc-500"
                                  size={15}
                                />
                                <span className="truncate text-xs font-semibold text-zinc-900">
                                  {source.label}
                                </span>
                              </div>
                              <ChevronRight
                                aria-hidden="true"
                                className="shrink-0 text-zinc-400 transition group-hover:translate-x-0.5"
                                size={15}
                              />
                            </div>
                            {source.excerpt ? (
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-600">
                                {source.excerpt}
                              </p>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {messages.length === 1 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {suggestedQuestions.map((suggestion, index) => (
                    <button
                      className="flex min-h-20 items-start gap-3 rounded-md border border-zinc-200 bg-[#fafaf9] p-4 text-left text-sm font-medium leading-6 text-zinc-800 transition hover:border-zinc-400 hover:bg-white"
                      key={suggestion}
                      onClick={() => void sendQuestion(suggestion)}
                      type="button"
                    >
                      {index === 0 ? (
                        <MessageSquareText
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-zinc-500"
                          size={17}
                        />
                      ) : (
                        <BarChart3
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-zinc-500"
                          size={17}
                        />
                      )}
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              {isLoading ? (
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  <span className="flex gap-1" aria-label="Analisando">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:240ms]" />
                  </span>
                  {loadingLabel}
                </div>
              ) : null}

              {requestError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {requestError}
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form
            className="border-t border-zinc-200 bg-[#fafaf9] p-3 sm:p-4"
            onSubmit={onSubmit}
          >
            <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-950">
              <textarea
                aria-label="Pergunta para o Analista Lexia"
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 text-zinc-950 outline-none placeholder:text-zinc-400"
                disabled={isLoading || Boolean(configurationError)}
                maxLength={4000}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={onQuestionKeyDown}
                placeholder="Pergunte sobre desempenho, objeções ou oportunidades"
                rows={1}
                value={question}
              />
              <button
                aria-label="Enviar pergunta"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={
                  isLoading || Boolean(configurationError) || !question.trim()
                }
                title="Enviar pergunta"
                type="submit"
              >
                <ArrowUp aria-hidden="true" size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

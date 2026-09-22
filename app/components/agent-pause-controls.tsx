"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  pauseAgentForConversation,
  resumeAgentForConversation,
  type AgentPauseActionResult,
  type ResumableLockKind,
} from "@/app/actions/agent-pause";
import {
  manualPauseDurations,
  type ManualPauseDuration,
} from "@/lib/redis/pause-durations";

type AgentPauseControlsProps = {
  clienteSlug: string;
  contactLabel?: string;
  fullWidth?: boolean;
  hasEternalPause: boolean;
  hasManualPause: boolean;
  identificadorConversa: string;
};

const durationHints: Record<ManualPauseDuration, string> = {
  "10": "Para uma resposta rápida",
  "30": "Para um atendimento curto",
  "60": "Para um atendimento mais longo",
  sem_validade: "Até alguém retomar manualmente",
};

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16">
      <rect fill="currentColor" height="10" rx="1" width="3.2" x="3.2" y="3" />
      <rect fill="currentColor" height="10" rx="1" width="3.2" x="9.6" y="3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16">
      <path d="M4.5 2.8v10.4a.6.6 0 0 0 .92.5l8-5.2a.6.6 0 0 0 0-1L5.42 2.3a.6.6 0 0 0-.92.5Z" fill="currentColor" />
    </svg>
  );
}

export function AgentPauseControls({
  clienteSlug,
  contactLabel,
  fullWidth = false,
  hasEternalPause,
  hasManualPause,
  identificadorConversa,
}: AgentPauseControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canResume = hasManualPause || hasEternalPause;

  useEffect(() => {
    if (!isSheetOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSheetOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSheetOpen]);

  function run(action: () => Promise<AgentPauseActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setError(result.error ?? "Não foi possível executar a ação.");
        return;
      }

      setIsSheetOpen(false);
      router.refresh();
    });
  }

  function handleResume() {
    const kinds: ResumableLockKind[] = [];

    if (hasManualPause) {
      kinds.push("pausa_manual");
    }

    if (hasEternalPause) {
      if (
        !window.confirm(
          "Este contacto já tem um agendamento. Ao retomar, o agente volta a responder as mensagens dele. Continuar?",
        )
      ) {
        return;
      }

      kinds.push("pausa_eterna");
    }

    run(() =>
      resumeAgentForConversation(clienteSlug, identificadorConversa, kinds),
    );
  }

  const buttonBase = `inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:text-xs ${
    fullWidth ? "w-full sm:w-auto" : ""
  }`;

  return (
    <>
      <div className={`flex flex-col gap-1.5 ${fullWidth ? "w-full sm:w-auto" : ""}`}>
        {canResume ? (
          <button
            className={`${buttonBase} bg-zinc-950 text-white hover:bg-zinc-800`}
            disabled={pending}
            onClick={handleResume}
            type="button"
          >
            <PlayIcon />
            {pending ? "Aguarde..." : "Retomar agente"}
          </button>
        ) : (
          <button
            aria-expanded={isSheetOpen}
            aria-haspopup="dialog"
            className={`${buttonBase} border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-950`}
            disabled={pending}
            onClick={() => {
              setError(null);
              setIsSheetOpen(true);
            }}
            type="button"
          >
            <PauseIcon />
            Pausar agente
          </button>
        )}
        {error && !isSheetOpen ? (
          <p className="text-xs text-red-700">{error}</p>
        ) : null}
      </div>

      {isSheetOpen ? (
        <div
          aria-labelledby="pausar-agente-titulo"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:px-4"
          onClick={() => (pending ? null : setIsSheetOpen(false))}
          role="dialog"
        >
          <div
            className="w-full rounded-t-3xl bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left shadow-2xl sm:max-w-sm sm:rounded-3xl sm:pt-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
            <h2
              className="text-lg font-semibold tracking-tight text-zinc-950"
              id="pausar-agente-titulo"
            >
              Pausar agente
            </h2>
            <p className="mt-1 text-sm leading-5 text-zinc-600">
              {contactLabel
                ? `O agente deixa de responder ${contactLabel}. `
                : "O agente deixa de responder esta conversa. "}
              Por quanto tempo?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {manualPauseDurations.map((option) => (
                <button
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  key={option.value}
                  onClick={() =>
                    run(() =>
                      pauseAgentForConversation(
                        clienteSlug,
                        identificadorConversa,
                        option.value,
                      ),
                    )
                  }
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-semibold text-zinc-950">
                      {option.label}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {durationHints[option.value]}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-zinc-400">
                    ›
                  </span>
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            ) : null}

            <button
              className="mt-3 h-11 w-full rounded-full text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-60"
              disabled={pending}
              onClick={() => setIsSheetOpen(false)}
              type="button"
            >
              {pending ? "Aguarde..." : "Cancelar"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

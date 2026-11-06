"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  pauseAgentForConversation,
  resumeAgentForConversation,
  type AgentPauseActionResult,
  type ResumableLockKind,
} from "@/app/actions/agent-pause";
import { useIdioma } from "@/app/components/idioma";
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
  /** Nas listas, o "Retomar" fica discreto para não pintar a tela de verde. */
  retomarDiscreto?: boolean;
};

/* Rótulos em pt-BR; traduzidos onde se desenham, com `t(...)`. */
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
  retomarDiscreto = false,
}: AgentPauseControlsProps) {
  const router = useRouter();
  const { t } = useIdioma();
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
        // A action devolve o erro em pt-BR (o teste das pausas compara-o);
        // a tradução é feita aqui, onde a mensagem chega ao ecrã.
        setError(t(result.error ?? "Não foi possível executar a ação."));
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
          t(
            "Este contato já tem um agendamento. Ao retomar, o agente volta a responder as mensagens dele. Continuar?",
          ),
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

  const buttonBase = `ds-botao ds-botao-p disabled:cursor-not-allowed ${
    fullWidth ? "w-full sm:w-auto" : ""
  }`;

  return (
    <>
      <div className={`flex flex-col gap-1.5 ${fullWidth ? "w-full sm:w-auto" : ""}`}>
        {canResume ? (
          <button
            className={`${buttonBase} ${retomarDiscreto ? "ds-botao-secundario" : "ds-botao-primario"}`}
            disabled={pending}
            onClick={handleResume}
            type="button"
          >
            <PlayIcon />
            {pending ? t("Aguarde...") : t("Retomar agente")}
          </button>
        ) : (
          <button
            aria-expanded={isSheetOpen}
            aria-haspopup="dialog"
            className={`${buttonBase} ds-botao-secundario`}
            disabled={pending}
            onClick={() => {
              setError(null);
              setIsSheetOpen(true);
            }}
            type="button"
          >
            <PauseIcon />
            {t("Pausar agente")}
          </button>
        )}
        {error && !isSheetOpen ? (
          <p className="text-xs text-danger">{error}</p>
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
            className="w-full rounded-t-3xl bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-left shadow-2xl sm:max-w-sm sm:rounded-3xl sm:pt-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
            <h2
              className="text-lg font-semibold tracking-tight text-foreground"
              id="pausar-agente-titulo"
            >
              {t("Pausar agente")}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {contactLabel
                ? t("O agente deixa de responder {contato}.", {
                    contato: contactLabel,
                  })
                : t("O agente deixa de responder esta conversa.")}{" "}
              {t("Por quanto tempo?")}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {manualPauseDurations.map((option) => (
                <button
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:border-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
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
                    <span className="block text-sm font-semibold text-foreground">
                      {t(option.label)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(durationHints[option.value])}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground/60">
                    ›
                  </span>
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-3 text-sm text-danger">{error}</p>
            ) : null}

            <button
              className="ds-botao ds-botao-fantasma mt-3 w-full"
              disabled={pending}
              onClick={() => setIsSheetOpen(false)}
              type="button"
            >
              {pending ? t("Aguarde...") : t("Cancelar")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

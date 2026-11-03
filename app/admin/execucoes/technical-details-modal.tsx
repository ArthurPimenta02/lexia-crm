"use client";

import { useState } from "react";

import { useIdioma } from "@/app/components/idioma";

type TechnicalDetailsModalProps = {
  sessionId: string | null;
  runId: string | null;
  testeId: string | null;
  rawAgente: string;
  rawContexto: string;
  rawHandoff: string;
};

function RawBlock({ label, value }: { label: string; value: string }) {
  const { t } = useIdioma();
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-2xl border border-border bg-surface-muted p-3 text-xs leading-5 text-muted-foreground">
        {value || t("Sem {campo}", { campo: label })}
      </pre>
    </div>
  );
}

export function TechnicalDetailsModal({
  sessionId,
  runId,
  testeId,
  rawAgente,
  rawContexto,
  rawHandoff,
}: TechnicalDetailsModalProps) {
  const { t } = useIdioma();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="ds-botao ds-botao-secundario ds-botao-p"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        {t("Ver detalhes")}
      </button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="dialog"
        >
          <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                {t("Detalhes técnicos da execução")}
              </h2>
              <button
                className="ds-botao ds-botao-secundario ds-botao-p"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                {t("Fechar")}
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="min-w-0 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    session_id
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-foreground">
                    {sessionId ?? t("Sem session_id")}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    run_id
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-foreground">
                    {runId ?? t("Sem run_id")}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    teste_id
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-foreground">
                    {testeId ?? t("Sem teste_id")}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <RawBlock label="raw_agente" value={rawAgente} />
                <RawBlock label="raw_contexto" value={rawContexto} />
                <RawBlock label="raw_handoff" value={rawHandoff} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

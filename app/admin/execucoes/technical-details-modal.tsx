"use client";

import { useState } from "react";

type TechnicalDetailsModalProps = {
  sessionId: string | null;
  runId: string | null;
  testeId: string | null;
  rawAgente: string;
  rawContexto: string;
  rawHandoff: string;
};

function RawBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
        {value || `Sem ${label}`}
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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Ver detalhes
      </button>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="dialog"
        >
          <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-md border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">
                  Detalhes técnicos da execução
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Dados técnicos gravados pelo workflow.
                </p>
              </div>
              <button
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="min-w-0 rounded-md border border-zinc-200 p-3">
                  <p className="text-xs font-medium text-zinc-500">
                    session_id
                  </p>
                  <p className="mt-1 break-words font-mono text-xs text-zinc-800">
                    {sessionId ?? "Sem session_id"}
                  </p>
                </div>
                <div className="min-w-0 rounded-md border border-zinc-200 p-3">
                  <p className="text-xs font-medium text-zinc-500">run_id</p>
                  <p className="mt-1 break-words font-mono text-xs text-zinc-800">
                    {runId ?? "Sem run_id"}
                  </p>
                </div>
                <div className="min-w-0 rounded-md border border-zinc-200 p-3">
                  <p className="text-xs font-medium text-zinc-500">teste_id</p>
                  <p className="mt-1 break-words font-mono text-xs text-zinc-800">
                    {testeId ?? "Sem teste_id"}
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

"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";

import {
  atualizarCampanhasAction,
  type AtualizarCampanhasResultado,
} from "./actions";

export function RefreshButton({ atualizadoEm }: { atualizadoEm: string | null }) {
  const [resultado, formAction] = useActionState<
    AtualizarCampanhasResultado | null,
    FormData
  >(atualizarCampanhasAction, null);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <form action={formAction}>
        <FormSubmitButton
          className="inline-flex items-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          pendingLabel="A puxar da Meta..."
        >
          Atualizar dados
        </FormSubmitButton>
      </form>

      {resultado ? (
        <p
          className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
          role="status"
        >
          {resultado.mensagem}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {atualizadoEm
            ? `Última atualização: ${atualizadoEm}`
            : "Nunca atualizado."}
        </p>
      )}
    </div>
  );
}

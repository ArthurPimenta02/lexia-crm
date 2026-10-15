"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { GravarServicoResultado } from "@/lib/servicos/write";

/**
 * Custo por hora de um executor.
 *
 * A action entra por propriedade porque o ecrã do cliente e o do admin usam
 * duas diferentes: a do cliente tira o slug do perfil, a do admin lê-o do
 * selector. O `clienteSlug` só é enviado no segundo caso.
 */
export function ServicosCustoHoraForm({
  action,
  actualizadoEm,
  clienteSlug,
  custoHora,
  executor,
  moeda,
  nome,
  podeEditar,
}: {
  action: (
    estado: GravarServicoResultado | null,
    formData: FormData,
  ) => Promise<GravarServicoResultado>;
  actualizadoEm: string | null;
  clienteSlug?: string;
  custoHora: number | null;
  executor: string;
  moeda: string;
  nome: string;
  podeEditar: boolean;
}) {
  const [resultado, formAction] = useActionState<
    GravarServicoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label
        className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase"
        htmlFor={`custo-hora-${executor}`}
      >
        {nome} · custo/hora ({moeda})
      </label>

      <div className="flex items-center gap-2">
        {clienteSlug ? (
          <input name="cliente_slug" type="hidden" value={clienteSlug} />
        ) : null}
        <input name="executor" type="hidden" value={executor} />
        <input
          className="h-10 w-28 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500"
          defaultValue={custoHora === null ? "" : String(custoHora)}
          disabled={!podeEditar}
          id={`custo-hora-${executor}`}
          inputMode="decimal"
          min="0"
          name="custo_hora"
          placeholder="0,00"
          step="0.01"
          type="number"
        />
        {podeEditar ? (
          <FormSubmitButton
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            pendingLabel="A gravar..."
          >
            Gravar
          </FormSubmitButton>
        ) : null}
      </div>

      {resultado ? (
        <p
          className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
          role="status"
        >
          {resultado.mensagem}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {custoHora === null
            ? "Ainda não preenchido — sem este número não há margem."
            : actualizadoEm
              ? `Actualizado em ${new Date(actualizadoEm).toLocaleDateString("pt-PT")}`
              : "Guardado."}
        </p>
      )}
    </form>
  );
}

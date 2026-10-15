"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { GravarServicoResultado } from "@/lib/servicos/write";

/**
 * Preço, custo de produto e notas de um serviço.
 *
 * O campo de preço fica desactivado quando o painel está a mostrar um escalão
 * de viatura em vez do preço base: o preço por escalão vive num jsonb e
 * reescrevê-lo daqui exigiria decidir o que fazer com os escalões que o
 * serviço não tem. Mudar o preço base é sempre possível no escalão "base".
 */
export function ServicosLinhaForm({
  action,
  clienteSlug,
  custoProduto,
  moeda,
  notas,
  podeEditar,
  preco,
  precoEditavel,
  servicoId,
}: {
  action: (
    estado: GravarServicoResultado | null,
    formData: FormData,
  ) => Promise<GravarServicoResultado>;
  clienteSlug?: string;
  custoProduto: number | null;
  moeda: string;
  notas: string | null;
  podeEditar: boolean;
  preco: number | null;
  precoEditavel: boolean;
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarServicoResultado | null,
    FormData
  >(action, null);

  const inputClass =
    "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
          Custo de produto ({moeda})
          <input
            className={`${inputClass} w-32`}
            defaultValue={custoProduto === null ? "" : String(custoProduto)}
            disabled={!podeEditar}
            inputMode="decimal"
            min="0"
            name="custo_produto"
            placeholder="0,00"
            step="0.01"
            type="number"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
          Preço base ({moeda})
          <input
            className={`${inputClass} w-32`}
            defaultValue={
              precoEditavel && preco !== null ? String(preco) : ""
            }
            disabled={!podeEditar || !precoEditavel}
            inputMode="decimal"
            min="0"
            name="preco"
            placeholder={precoEditavel ? "0,00" : "só no escalão base"}
            step="0.01"
            type="number"
          />
        </label>

        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
          Notas
          <input
            className={`${inputClass} w-full`}
            defaultValue={notas ?? ""}
            disabled={!podeEditar}
            maxLength={2000}
            name="notas"
            placeholder="ex.: 1/3 de frasco de cerâmico"
            type="text"
          />
        </label>

        {podeEditar ? (
          <FormSubmitButton
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
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
      ) : null}
    </form>
  );
}

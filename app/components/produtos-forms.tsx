"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { GravarProdutoResultado } from "@/lib/produtos/write";

/**
 * Formulários da página de produtos: criar produto, registar compra e ajustar
 * stock.
 *
 * São três formulários separados porque são três decisões separadas. O dono
 * cria um produto uma vez e registra compras muitas; juntá-los obrigava-o a
 * reescrever o nome e a unidade em cada frasco que compra.
 */

export type ProdutoAction = (
  estado: GravarProdutoResultado | null,
  formData: FormData,
) => Promise<GravarProdutoResultado>;

const inputClass =
  "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";

const labelClass =
  "flex flex-col gap-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase";

function Mensagem({ resultado }: { resultado: GravarProdutoResultado | null }) {
  if (!resultado) {
    return null;
  }

  return (
    <p
      className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
      role="status"
    >
      {resultado.mensagem}
    </p>
  );
}

export function CriarProdutoForm({
  action,
  clienteSlug,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className={`${labelClass} min-w-48 flex-1`} htmlFor="novo-nome">
          Nome do produto
          <input
            className={`${inputClass} w-full`}
            id="novo-nome"
            maxLength={256}
            name="nome"
            placeholder="ex.: Cerâmico 4 anos"
            required
            type="text"
          />
        </label>

        <label className={labelClass} htmlFor="nova-unidade">
          Unidade
          <select className={`${inputClass} w-28`} id="nova-unidade" name="unidade">
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="un">un</option>
          </select>
        </label>

        <label className={`${labelClass} min-w-48 flex-1`} htmlFor="novas-notas">
          Notas
          <input
            className={`${inputClass} w-full`}
            id="novas-notas"
            maxLength={2000}
            name="notas"
            placeholder="opcional"
            type="text"
          />
        </label>

        <FormSubmitButton
          className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          pendingLabel="A criar..."
        >
          Criar produto
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

export function CompraForm({
  action,
  clienteSlug,
  moeda,
  produtoId,
  unidade,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  moeda: string;
  produtoId: string;
  unidade: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
        Comprei mais
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="sr-only" htmlFor={`compra-qtd-${produtoId}`}>
          Quantidade comprada
        </label>
        <input
          className={`${inputClass} w-28`}
          id={`compra-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={`qtd. em ${unidade}`}
          required
          step="0.001"
          type="number"
        />

        <label className="sr-only" htmlFor={`compra-custo-${produtoId}`}>
          Total pago
        </label>
        <input
          className={`${inputClass} w-28`}
          id={`compra-custo-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="custo_total"
          placeholder={`total ${moeda}`}
          required
          step="0.01"
          type="number"
        />

        <FormSubmitButton
          className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          pendingLabel="A registar..."
        >
          Registar compra
        </FormSubmitButton>
      </div>

      <p className="text-xs text-zinc-500">
        O total é o que pagaste pela quantidade toda. O custo por {unidade} sai
        daí e passa a valer para a margem de todos os serviços que usam este
        produto.
      </p>

      <Mensagem resultado={resultado} />
    </form>
  );
}

export function AjusteForm({
  action,
  clienteSlug,
  produtoId,
  unidade,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  produtoId: string;
  unidade: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
        Corrigir o stock
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="sr-only" htmlFor={`ajuste-dir-${produtoId}`}>
          O ajuste soma ou subtrai
        </label>
        <select
          className={`${inputClass} w-28`}
          id={`ajuste-dir-${produtoId}`}
          name="direccao"
        >
          <option value="saida">Tirar</option>
          <option value="entrada">Juntar</option>
        </select>

        <label className="sr-only" htmlFor={`ajuste-qtd-${produtoId}`}>
          Quantidade do ajuste
        </label>
        <input
          className={`${inputClass} w-28`}
          id={`ajuste-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={`qtd. em ${unidade}`}
          required
          step="0.001"
          type="number"
        />

        <label className="sr-only" htmlFor={`ajuste-nota-${produtoId}`}>
          Motivo do ajuste
        </label>
        <input
          className={`${inputClass} min-w-40 flex-1`}
          id={`ajuste-nota-${produtoId}`}
          maxLength={2000}
          name="nota"
          placeholder="motivo (ex.: entornei)"
          type="text"
        />

        <FormSubmitButton
          className="inline-flex min-h-10 items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
          pendingLabel="A ajustar..."
        >
          Ajustar
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

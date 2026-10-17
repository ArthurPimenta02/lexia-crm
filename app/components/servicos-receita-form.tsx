"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { ItemReceita, ProdutoLinha } from "@/lib/produtos/read";
import type { GravarProdutoResultado } from "@/lib/produtos/write";

/**
 * Receita de um serviço: que produtos gasta e quanto de cada um.
 *
 * Cada linha é um formulário independente de propósito. Um formulário único
 * para toda a receita obrigava a decidir o que fazer quando uma linha é válida
 * e outra não; assim o dono muda o champô sem arriscar o cerâmico.
 *
 * Apagar uma linha é pôr a quantidade a zero. É o mesmo campo e o mesmo botão,
 * e evita um segundo botão que tinha de ser explicado.
 */

type ReceitaAction = (
  estado: GravarProdutoResultado | null,
  formData: FormData,
) => Promise<GravarProdutoResultado>;

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

const inputClass =
  "h-9 rounded-2xl border border-border-strong bg-surface px-2.5 text-sm outline-none transition focus:border-foreground disabled:bg-surface-muted disabled:text-muted-foreground";

function LinhaDaReceita({
  action,
  clienteSlug,
  item,
  moeda,
  podeEditar,
  servicoId,
}: {
  action: ReceitaAction;
  clienteSlug?: string;
  item: ItemReceita;
  moeda: string;
  podeEditar: boolean;
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />
      <input name="produto_id" type="hidden" value={item.produtoId} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-36 flex-1 truncate text-sm text-foreground">
          {item.produtoNome}
        </span>

        <label
          className="sr-only"
          htmlFor={`qtd-${servicoId}-${item.produtoId}`}
        >
          Quantidade de {item.produtoNome}
        </label>
        <input
          className={`${inputClass} w-24`}
          defaultValue={String(item.quantidade)}
          disabled={!podeEditar}
          id={`qtd-${servicoId}-${item.produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          step="0.001"
          type="number"
        />
        <span className="w-10 text-xs text-muted-foreground">
          {item.unidade}
        </span>

        <span className="w-24 text-right text-sm font-semibold text-foreground">
          {item.custo === null
            ? "sem preço"
            : new Intl.NumberFormat("pt-PT", {
                currency: moeda,
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
                style: "currency",
              }).format(item.custo)}
        </span>

        {podeEditar ? (
          <FormSubmitButton
            className="inline-flex min-h-9 items-center rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
            pendingLabel="..."
          >
            Gravar
          </FormSubmitButton>
        ) : null}
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

function AdicionarProduto({
  action,
  clienteSlug,
  produtos,
  servicoId,
}: {
  action: ReceitaAction;
  clienteSlug?: string;
  produtos: ProdutoLinha[];
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`novo-${servicoId}`}>
          Produto a juntar
        </label>
        <select
          className={`${inputClass} min-w-36 flex-1`}
          defaultValue={produtos[0]?.id}
          id={`novo-${servicoId}`}
          name="produto_id"
        >
          {produtos.map((produto) => (
            <option key={produto.id} value={produto.id}>
              {produto.nome} ({produto.unidade})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`nova-qtd-${servicoId}`}>
          Quantidade gasta
        </label>
        <input
          className={`${inputClass} w-24`}
          id={`nova-qtd-${servicoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder="100"
          step="0.001"
          type="number"
        />

        <FormSubmitButton
          className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          pendingLabel="A juntar..."
        >
          Juntar à receita
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

export function ServicosReceitaForm({
  actionReceita,
  clienteSlug,
  moeda,
  podeEditar,
  produtosDisponiveis,
  receita,
  servicoId,
}: {
  actionReceita: ReceitaAction;
  clienteSlug?: string;
  moeda: string;
  podeEditar: boolean;
  /** Produtos do cliente que ainda não estão nesta receita. */
  produtosDisponiveis: ProdutoLinha[];
  receita: ItemReceita[];
  servicoId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Produtos gastos neste serviço
      </p>

      {receita.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Ainda nenhum. Enquanto esta lista estiver vazia, marcar o serviço como
          realizado não desconta nada do stock.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {receita.map((item) => (
            <LinhaDaReceita
              action={actionReceita}
              clienteSlug={clienteSlug}
              item={item}
              key={item.produtoId}
              moeda={moeda}
              podeEditar={podeEditar}
              servicoId={servicoId}
            />
          ))}
        </div>
      )}

      {podeEditar && produtosDisponiveis.length > 0 ? (
        <AdicionarProduto
          action={actionReceita}
          clienteSlug={clienteSlug}
          produtos={produtosDisponiveis}
          servicoId={servicoId}
        />
      ) : null}
    </div>
  );
}

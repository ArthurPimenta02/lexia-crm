"use client";

import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { ServicoQueGasta } from "@/lib/produtos/read";
import type { GravarProdutoResultado } from "@/lib/produtos/write";
import type { ServicoSimples } from "@/lib/servicos/read";

/**
 * Formulários da página de produtos: criar produto, registar compra, ajustar
 * stock, ligar serviços ao produto e excluir/repor.
 *
 * São formulários separados porque são decisões separadas. O dono cria um
 * produto uma vez e registra compras muitas; juntá-los obrigava-o a reescrever
 * o nome e a unidade em cada frasco que compra.
 */

export type ProdutoAction = (
  estado: GravarProdutoResultado | null,
  formData: FormData,
) => Promise<GravarProdutoResultado>;

const inputClass =
  "h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground disabled:bg-surface-muted disabled:text-muted-foreground";

const labelClass =
  "flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground";

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
          <select
            className={`${inputClass} w-28`}
            id="nova-unidade"
            name="unidade"
          >
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="un">un</option>
          </select>
        </label>

        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor="novas-notas"
        >
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
          className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
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

      <p className="text-xs font-semibold text-muted-foreground">
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
          className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          pendingLabel="A registar..."
        >
          Registar compra
        </FormSubmitButton>
      </div>

      <p className="text-xs text-muted-foreground">
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

      <p className="text-xs font-semibold text-muted-foreground">
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
          className="inline-flex min-h-10 items-center rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
          pendingLabel="A ajustar..."
        >
          Ajustar
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

const inputPequeno =
  "h-9 rounded-2xl border border-border-strong bg-surface px-2.5 text-sm outline-none transition focus:border-foreground disabled:bg-surface-muted disabled:text-muted-foreground";

function LinhaDeServico({
  action,
  clienteSlug,
  item,
  moeda,
  produtoId,
  unidade,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  item: ServicoQueGasta;
  moeda: string;
  produtoId: string;
  unidade: string;
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
      <input name="produto_id" type="hidden" value={produtoId} />
      <input name="servico_id" type="hidden" value={item.servicoId} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-36 flex-1 truncate text-sm text-foreground">
          {item.servicoNome}
        </span>

        <label
          className="sr-only"
          htmlFor={`uso-${produtoId}-${item.servicoId}`}
        >
          Quantidade gasta em {item.servicoNome}
        </label>
        <input
          className={`${inputPequeno} w-24`}
          defaultValue={String(item.quantidade)}
          id={`uso-${produtoId}-${item.servicoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          step="0.001"
          type="number"
        />
        <span className="w-10 text-xs text-muted-foreground">{unidade}</span>

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

        <FormSubmitButton
          className="inline-flex min-h-9 items-center rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
          pendingLabel="..."
        >
          Gravar
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

function LigarServico({
  action,
  clienteSlug,
  produtoId,
  servicos,
  unidade,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  produtoId: string;
  servicos: ServicoSimples[];
  unidade: string;
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
      <input name="produto_id" type="hidden" value={produtoId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`ligar-${produtoId}`}>
          Serviço a ligar
        </label>
        <select
          className={`${inputPequeno} min-w-36 flex-1`}
          defaultValue={servicos[0]?.id}
          id={`ligar-${produtoId}`}
          name="servico_id"
        >
          {servicos.map((servico) => (
            <option key={servico.id} value={servico.id}>
              {servico.nome}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`ligar-qtd-${produtoId}`}>
          Quantidade gasta por execução
        </label>
        <input
          className={`${inputPequeno} w-24`}
          id={`ligar-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={unidade}
          step="0.001"
          type="number"
        />

        <FormSubmitButton
          className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          pendingLabel="A ligar..."
        >
          Ligar serviço
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

/**
 * Que serviços gastam este produto, editável aqui mesmo.
 *
 * É a mesma tabela que a receita do lado dos Serviços — a diferença é por onde
 * o dono entra. Quando acaba o champô, a pergunta que ele tem na cabeça é
 * "onde é que isto se está a gastar", e essa não se responde abrindo os quinze
 * serviços um a um.
 */
export function ServicosDoProdutoForm({
  actionReceita,
  clienteSlug,
  moeda,
  podeEditar,
  produtoId,
  servicos,
  servicosDisponiveis,
  unidade,
}: {
  actionReceita: ProdutoAction;
  clienteSlug?: string;
  moeda: string;
  podeEditar: boolean;
  produtoId: string;
  servicos: ServicoQueGasta[];
  /** Serviços do catálogo que ainda não gastam este produto. */
  servicosDisponiveis: ServicoSimples[];
  unidade: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Serviços que gastam este produto
      </p>

      {servicos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum. Enquanto nenhum serviço gastar este produto, o stock só muda
          quando registas compras ou ajustes à mão.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {servicos.map((item) =>
            podeEditar ? (
              <LinhaDeServico
                action={actionReceita}
                clienteSlug={clienteSlug}
                item={item}
                key={item.servicoId}
                moeda={moeda}
                produtoId={produtoId}
                unidade={unidade}
              />
            ) : (
              <p className="text-sm text-foreground" key={item.servicoId}>
                {item.servicoNome} — {item.quantidade} {unidade}
              </p>
            ),
          )}
        </div>
      )}

      {podeEditar && servicosDisponiveis.length > 0 ? (
        <LigarServico
          action={actionReceita}
          clienteSlug={clienteSlug}
          produtoId={produtoId}
          servicos={servicosDisponiveis}
          unidade={unidade}
        />
      ) : null}

      {podeEditar && servicos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Pôr a quantidade a zero tira o serviço desta lista.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Excluir um produto, em dois passos.
 *
 * O segundo passo existe porque excluir também o tira da receita de todos os
 * serviços, e essas quantidades não voltam ao repor. O stock e o histórico de
 * compras ficam — é só o produto que deixa de aparecer.
 */
export function ExcluirProdutoForm({
  action,
  clienteSlug,
  nome,
  produtoId,
  servicosAfectados,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  nome: string;
  produtoId: string;
  servicosAfectados: number;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);
  const [aConfirmar, setAConfirmar] = useState(false);

  if (!aConfirmar) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          className="text-xs font-semibold text-muted-foreground underline decoration-dotted transition hover:text-red-700"
          onClick={() => setAConfirmar(true)}
          type="button"
        >
          Excluir produto
        </button>
        <Mensagem resultado={resultado} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <p className="max-w-sm text-right text-xs text-amber-900">
        {servicosAfectados === 0
          ? `Excluir "${nome}"? O stock e o histórico ficam guardados e podes repô-lo.`
          : `Excluir "${nome}"? Sai também da receita de ${servicosAfectados} ${
              servicosAfectados === 1 ? "serviço" : "serviços"
            }, e essas quantidades não voltam se o repuseres.`}
      </p>

      <div className="flex items-center gap-2">
        <button
          className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          onClick={() => setAConfirmar(false)}
          type="button"
        >
          Cancelar
        </button>
        <FormSubmitButton
          className="inline-flex min-h-8 items-center rounded-full bg-red-700 px-4 text-xs font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
          pendingLabel="A excluir..."
        >
          Sim, excluir
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

export function ReporProdutoForm({
  action,
  clienteSlug,
  produtoId,
}: {
  action: ProdutoAction;
  clienteSlug?: string;
  produtoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <FormSubmitButton
        className="inline-flex min-h-8 items-center rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
        pendingLabel="A repor..."
      >
        Repor
      </FormSubmitButton>

      <Mensagem resultado={resultado} />
    </form>
  );
}

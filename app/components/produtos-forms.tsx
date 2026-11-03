"use client";

import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
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
  "ds-campo disabled:bg-surface-muted disabled:text-muted-foreground";

const labelClass =
  "flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground";

function Mensagem({ resultado }: { resultado: GravarProdutoResultado | null }) {
  if (!resultado) {
    return null;
  }

  return (
    <p
      className={`text-xs ${resultado.ok ? "text-positive" : "text-danger"}`}
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
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className={`${labelClass} min-w-48 flex-1`} htmlFor="novo-nome">
          {t("Nome do produto")}
          <input
            className={`${inputClass} w-full`}
            id="novo-nome"
            maxLength={256}
            name="nome"
            placeholder={t("ex.: Cerâmico 4 anos")}
            required
            type="text"
          />
        </label>

        <label className={labelClass} htmlFor="nova-unidade">
          {t("Unidade")}
          <select
            className={`${inputClass} w-28!`}
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
          {t("Notas")}
          <input
            className={`${inputClass} w-full`}
            id="novas-notas"
            maxLength={2000}
            name="notas"
            placeholder={t("opcional")}
            type="text"
          />
        </label>

        <FormSubmitButton
          className="ds-botao ds-botao-primario"
          pendingLabel={t("Criando...")}
        >
          {t("Criar produto")}
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
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <p className="text-xs font-semibold text-muted-foreground">
        {t("Comprei mais")}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="sr-only" htmlFor={`compra-qtd-${produtoId}`}>
          {t("Quantidade comprada")}
        </label>
        <input
          className={`${inputClass} w-28!`}
          id={`compra-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={t("qtd. em {unidade}", { unidade })}
          required
          step="0.001"
          type="number"
        />

        <label className="sr-only" htmlFor={`compra-custo-${produtoId}`}>
          {t("Total pago")}
        </label>
        <input
          className={`${inputClass} w-28!`}
          id={`compra-custo-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="custo_total"
          placeholder={t("total {moeda}", { moeda })}
          required
          step="0.01"
          type="number"
        />

        <FormSubmitButton
          className="ds-botao ds-botao-primario"
          pendingLabel={t("Registrando...")}
        >
          {t("Registrar compra")}
        </FormSubmitButton>
      </div>

      <p className="text-xs text-muted-foreground">
        {t(
          "O total é o que você pagou pela quantidade toda. O custo por {unidade} sai daí e passa a valer para a margem de todos os serviços que usam este produto.",
          { unidade },
        )}
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
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <p className="text-xs font-semibold text-muted-foreground">
        {t("Corrigir o estoque")}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="sr-only" htmlFor={`ajuste-dir-${produtoId}`}>
          {t("O ajuste soma ou subtrai")}
        </label>
        <select
          className={`${inputClass} w-28!`}
          id={`ajuste-dir-${produtoId}`}
          name="direccao"
        >
          <option value="saida">{t("Tirar")}</option>
          <option value="entrada">{t("Adicionar")}</option>
        </select>

        <label className="sr-only" htmlFor={`ajuste-qtd-${produtoId}`}>
          {t("Quantidade do ajuste")}
        </label>
        <input
          className={`${inputClass} w-28!`}
          id={`ajuste-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={t("qtd. em {unidade}", { unidade })}
          required
          step="0.001"
          type="number"
        />

        <label className="sr-only" htmlFor={`ajuste-nota-${produtoId}`}>
          {t("Motivo do ajuste")}
        </label>
        <input
          className={`${inputClass} w-auto! min-w-40 flex-1`}
          id={`ajuste-nota-${produtoId}`}
          maxLength={2000}
          name="nota"
          placeholder={t("motivo (ex.: derramei)")}
          type="text"
        />

        <FormSubmitButton
          className="ds-botao ds-botao-secundario"
          pendingLabel={t("Ajustando...")}
        >
          {t("Ajustar")}
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

const inputPequeno =
  "ds-campo h-9! px-2.5! disabled:bg-surface-muted disabled:text-muted-foreground";

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
  const { locale, t } = useIdioma();

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
          {t("Quantidade gasta em {servico}", { servico: item.servicoNome })}
        </label>
        <input
          className={`${inputPequeno} w-24!`}
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
            ? t("sem preço")
            : new Intl.NumberFormat(locale, {
                currency: moeda,
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
                style: "currency",
              }).format(item.custo)}
        </span>

        <FormSubmitButton
          className="ds-botao ds-botao-secundario ds-botao-p"
          pendingLabel="..."
        >
          {t("Salvar")}
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
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`ligar-${produtoId}`}>
          {t("Serviço a ligar")}
        </label>
        <select
          className={`${inputPequeno} w-auto! min-w-36 flex-1`}
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
          {t("Quantidade gasta por execução")}
        </label>
        <input
          className={`${inputPequeno} w-24!`}
          id={`ligar-qtd-${produtoId}`}
          inputMode="decimal"
          min="0"
          name="quantidade"
          placeholder={unidade}
          step="0.001"
          type="number"
        />

        <FormSubmitButton
          className="ds-botao ds-botao-primario ds-botao-p"
          pendingLabel={t("Ligando...")}
        >
          {t("Ligar serviço")}
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
  const { t } = useIdioma();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">
        {t("Serviços que gastam este produto")}
      </p>

      {servicos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            "Nenhum. Enquanto nenhum serviço gastar este produto, o estoque só muda quando você registra compras ou ajustes à mão.",
          )}
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
          {t("Colocar a quantidade em zero tira o serviço desta lista.")}
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
  const { t } = useIdioma();
  const [aConfirmar, setAConfirmar] = useState(false);

  if (!aConfirmar) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          className="text-xs font-semibold text-muted-foreground underline decoration-dotted transition hover:text-danger"
          onClick={() => setAConfirmar(true)}
          type="button"
        >
          {t("Excluir produto")}
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

      <p className="max-w-sm text-right text-xs text-warning">
        {servicosAfectados === 0
          ? t(
              'Excluir "{nome}"? O estoque e o histórico ficam guardados e você pode restaurá-lo.',
              { nome },
            )
          : servicosAfectados === 1
            ? t(
                'Excluir "{nome}"? Sai também da receita de {n} serviço, e essas quantidades não voltam se você restaurá-lo.',
                { n: servicosAfectados, nome },
              )
            : t(
                'Excluir "{nome}"? Sai também da receita de {n} serviços, e essas quantidades não voltam se você restaurá-lo.',
                { n: servicosAfectados, nome },
              )}
      </p>

      <div className="flex items-center gap-2">
        <button
          className="ds-botao ds-botao-fantasma ds-botao-p"
          onClick={() => setAConfirmar(false)}
          type="button"
        >
          {t("Cancelar")}
        </button>
        <FormSubmitButton
          className="ds-botao ds-botao-perigo ds-botao-p"
          pendingLabel={t("Excluindo...")}
        >
          {t("Sim, excluir")}
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
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-1">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="produto_id" type="hidden" value={produtoId} />

      <FormSubmitButton
        className="ds-botao ds-botao-secundario ds-botao-p"
        pendingLabel={t("Restaurando...")}
      >
        {t("Restaurar")}
      </FormSubmitButton>

      <Mensagem resultado={resultado} />
    </form>
  );
}

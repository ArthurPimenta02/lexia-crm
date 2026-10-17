import type { ReactNode } from "react";

import { SeccaoTitulo } from "@/app/components/painel-ui";
import {
  AjusteForm,
  CompraForm,
  CriarProdutoForm,
  ExcluirProdutoForm,
  type ProdutoAction,
  ReporProdutoForm,
  ServicosDoProdutoForm,
} from "@/app/components/produtos-forms";
import type {
  MovimentoLinha,
  ProdutoExcluido,
  ProdutoLinha,
  ServicosPorProduto,
} from "@/lib/produtos/read";
import { formatDayInTimezone } from "@/lib/clientes/timezone";
import type { ServicoSimples } from "@/lib/servicos/read";

/**
 * Corpo da página de produtos, partilhado pelo ecrã do cliente
 * (`/app/produtos`) e pelo do administrador (`/admin/produtos`).
 *
 * O que este ecrã responde, por ordem de importância para o dono: quanto tenho,
 * quanto tempo dura, quanto me custa a unidade, e o que aconteceu a este
 * produto ultimamente.
 */

function formatMoney(valor: number, moeda: string, casas = 2) {
  return new Intl.NumberFormat("pt-PT", {
    currency: moeda,
    maximumFractionDigits: casas,
    minimumFractionDigits: casas,
    style: "currency",
  }).format(valor);
}

function formatQuantidade(valor: number) {
  return new Intl.NumberFormat("pt-PT", {
    maximumFractionDigits: 3,
  }).format(valor);
}

/**
 * Previsão de duração em texto.
 *
 * Com menos de duas saídas registadas não há previsão nenhuma — uma amostra de
 * um não é um ritmo, e um número aqui seria lido como se fosse. Dizer quantas
 * execuções faltam é mais honesto e diz-lhe o que fazer.
 */
function legendaDaDuracao(produto: ProdutoLinha) {
  if (produto.saidasRegistadas < 2) {
    return produto.saidasRegistadas === 0
      ? "Ainda não registaste nenhum serviço com este produto."
      : "Falta mais uma execução registada para haver ritmo de consumo.";
  }

  if (produto.diasRestantes === null) {
    return "Sem consumo medido.";
  }

  if (produto.stock <= 0) {
    return "Acabou. O stock está a zero ou negativo.";
  }

  return `Ao ritmo de ${formatQuantidade(produto.consumoPorDia ?? 0)} ${
    produto.unidade
  } por dia, medido desde a primeira saída.`;
}

function MovimentoItem({
  moeda,
  movimento,
  timeZone,
  unidade,
}: {
  moeda: string;
  movimento: MovimentoLinha;
  timeZone: string;
  unidade: string;
}) {
  const etiqueta =
    movimento.tipo === "compra"
      ? "Compra"
      : movimento.tipo === "consumo"
        ? (movimento.servicoNome ?? "Consumo")
        : "Ajuste";

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">
        {formatDayInTimezone(movimento.ocorridoEm, timeZone)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {etiqueta}
        {movimento.nota ? ` — ${movimento.nota}` : ""}
      </span>
      <span
        className={`text-xs font-semibold ${
          movimento.quantidade < 0 ? "text-red-700" : "text-emerald-700"
        }`}
      >
        {movimento.quantidade > 0 ? "+" : ""}
        {formatQuantidade(movimento.quantidade)} {unidade}
        {movimento.custoTotal === null
          ? ""
          : ` · ${formatMoney(movimento.custoTotal, moeda)}`}
      </span>
    </li>
  );
}

export function ProdutosPanel({
  actionAjuste,
  actionCompra,
  actionCriar,
  actionExcluir,
  actionReceita,
  actionRepor,
  clienteSlug,
  excluidos,
  leading,
  moeda,
  podeEditar,
  produtos,
  servicos,
  servicosPorProduto,
  timeZone,
}: {
  actionAjuste: ProdutoAction;
  actionCompra: ProdutoAction;
  actionCriar: ProdutoAction;
  actionExcluir: ProdutoAction;
  actionReceita: ProdutoAction;
  actionRepor: ProdutoAction;
  /** Só o admin o envia: as acções dele leem o slug do formulário. */
  clienteSlug?: string;
  /** Produtos com `activo = false`, para poderem ser repostos. */
  excluidos: ProdutoExcluido[];
  /** Selector de cliente; só o admin o usa. */
  leading?: ReactNode;
  moeda: string;
  podeEditar: boolean;
  produtos: ProdutoLinha[];
  /** Catálogo vivo, para o selector de "ligar serviço". */
  servicos: ServicoSimples[];
  servicosPorProduto: ServicosPorProduto;
  /** O fuso do cliente: as datas dos movimentos são escritas nele. */
  timeZone: string;
}) {
  // O que está a acabar primeiro aparece primeiro: é a única ordem que faz
  // este ecrã valer uma visita de manhã. Sem previsão vai para o fim, por
  // nome, em vez de se fingir que dura para sempre.
  const ordenados = [...produtos].sort((a, b) => {
    if (a.diasRestantes === null && b.diasRestantes === null) {
      return a.nome.localeCompare(b.nome, "pt");
    }

    if (a.diasRestantes === null) {
      return 1;
    }

    if (b.diasRestantes === null) {
      return -1;
    }

    return a.diasRestantes - b.diasRestantes;
  });

  return (
    <>
      {leading}

      {podeEditar ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <SeccaoTitulo>Novo produto</SeccaoTitulo>
          <div className="mt-3">
            <CriarProdutoForm action={actionCriar} clienteSlug={clienteSlug} />
          </div>
        </div>
      ) : null}

      {ordenados.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <p className="text-sm text-muted-foreground">
            Ainda não há produtos. Cria o primeiro acima.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordenados.map((produto) => {
            const servicosDoProduto = servicosPorProduto.get(produto.id) ?? [];
            const jaLigados = new Set(
              servicosDoProduto.map((item) => item.servicoId),
            );

            return (
              <div
                className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                key={produto.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">
                      {produto.nome}
                    </h2>
                    {produto.notas ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {produto.notas}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-2xl font-semibold tracking-tight ${
                        produto.stock <= 0 ? "text-red-700" : "text-foreground"
                      }`}
                    >
                      {formatQuantidade(produto.stock)} {produto.unidade}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      em stock
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">
                      Custo por {produto.unidade}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {produto.custoUnitario === null
                        ? "—"
                        : formatMoney(produto.custoUnitario, moeda, 4)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Valor do stock</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {produto.custoUnitario === null
                        ? "—"
                        : formatMoney(
                            produto.custoUnitario * produto.stock,
                            moeda,
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dura mais</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">
                      {produto.diasRestantes === null
                        ? "—"
                        : `${produto.diasRestantes} ${
                            produto.diasRestantes === 1 ? "dia" : "dias"
                          }`}
                    </dd>
                  </div>
                </dl>

                <p className="mt-2 text-xs text-muted-foreground">
                  {legendaDaDuracao(produto)}
                </p>

                {produto.custoUnitario === null ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Sem compra registada, este produto não tem preço, e os
                    serviços que o usam ficam sem custo e sem margem. Registra
                    em baixo quanto pagaste pela última vez que o compraste.
                  </p>
                ) : null}

                {podeEditar ? (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
                    <CompraForm
                      action={actionCompra}
                      clienteSlug={clienteSlug}
                      moeda={moeda}
                      produtoId={produto.id}
                      unidade={produto.unidade}
                    />
                    <AjusteForm
                      action={actionAjuste}
                      clienteSlug={clienteSlug}
                      produtoId={produto.id}
                      unidade={produto.unidade}
                    />
                  </div>
                ) : null}

                <div className="mt-4 border-t border-border pt-4">
                  <ServicosDoProdutoForm
                    actionReceita={actionReceita}
                    clienteSlug={clienteSlug}
                    moeda={moeda}
                    podeEditar={podeEditar}
                    produtoId={produto.id}
                    servicos={servicosDoProduto}
                    servicosDisponiveis={servicos.filter(
                      (servico) => !jaLigados.has(servico.id),
                    )}
                    unidade={produto.unidade}
                  />
                </div>

                {produto.movimentos.length > 0 ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Últimos movimentos
                    </p>
                    <ul className="mt-2">
                      {produto.movimentos.map((movimento) => (
                        <MovimentoItem
                          key={movimento.id}
                          moeda={moeda}
                          movimento={movimento}
                          timeZone={timeZone}
                          unidade={produto.unidade}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {podeEditar ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <ExcluirProdutoForm
                      action={actionExcluir}
                      clienteSlug={clienteSlug}
                      nome={produto.nome}
                      produtoId={produto.id}
                      servicosAfectados={servicosDoProduto.length}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {podeEditar && excluidos.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <SeccaoTitulo dica="O stock e as compras destes produtos continuam guardados. Repor traz o produto de volta, mas não as quantidades por serviço.">
            Excluídos
          </SeccaoTitulo>
          <ul className="mt-3 flex flex-col gap-2">
            {excluidos.map((produto) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
                key={produto.id}
              >
                <span className="text-sm text-foreground">
                  {produto.nome}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({produto.unidade})
                  </span>
                </span>
                <ReporProdutoForm
                  action={actionRepor}
                  clienteSlug={clienteSlug}
                  produtoId={produto.id}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

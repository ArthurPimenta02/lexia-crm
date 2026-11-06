import type { ReactNode } from "react";

import { ChevronRight, PackageX, Plus, Receipt, Wallet } from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";
import { Dica } from "@/app/components/painel-ui";
import {
  AjusteForm,
  CompraForm,
  CriarProdutoForm,
  ExcluirProdutoForm,
  type ProdutoAction,
  ReporProdutoForm,
  ServicosDoProdutoForm,
} from "@/app/components/produtos-forms";
import {
  AvisoLinha,
  CabecalhoTela,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import type {
  MovimentoLinha,
  ProdutoExcluido,
  ProdutoLinha,
  ServicosPorProduto,
} from "@/lib/produtos/read";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import type { ServicoSimples } from "@/lib/servicos/read";

/**
 * Corpo da página de produtos, partilhado pelo ecrã do cliente
 * (`/app/produtos`) e pelo do administrador (`/admin/produtos`).
 *
 * O que este ecrã responde, por ordem de importância para o dono: quanto tenho,
 * quanto tempo dura, quanto me custa a unidade, e o que aconteceu a este
 * produto ultimamente.
 */

function formatMoney(valor: number, moeda: string, locale: string, casas = 2) {
  return new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: casas,
    minimumFractionDigits: casas,
    style: "currency",
  }).format(valor);
}

function formatQuantidade(valor: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  }).format(valor);
}

/** Dia do movimento no fuso do cliente, escrito à maneira do idioma. */
function formatDia(data: string | null, timeZone: string, locale: string) {
  if (!data) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(data));
}

/**
 * Previsão de duração em texto.
 *
 * Com menos de duas saídas registadas não há previsão nenhuma — uma amostra de
 * um não é um ritmo, e um número aqui seria lido como se fosse. Dizer quantas
 * execuções faltam é mais honesto e diz-lhe o que fazer.
 */
function legendaDaDuracao(produto: ProdutoLinha, t: FuncaoT, locale: string) {
  if (produto.saidasRegistadas < 2) {
    return produto.saidasRegistadas === 0
      ? t("Você ainda não registrou nenhum serviço com este produto.")
      : t("Falta mais uma execução registrada para haver ritmo de consumo.");
  }

  if (produto.diasRestantes === null) {
    return t("Sem consumo medido.");
  }

  if (produto.stock <= 0) {
    return t("Acabou. O estoque está zerado ou negativo.");
  }

  return t(
    "No ritmo de {quantidade} {unidade} por dia, medido desde a primeira saída.",
    {
      quantidade: formatQuantidade(produto.consumoPorDia ?? 0, locale),
      unidade: produto.unidade,
    },
  );
}

function MovimentoItem({
  locale,
  moeda,
  movimento,
  t,
  timeZone,
  unidade,
}: {
  locale: string;
  moeda: string;
  movimento: MovimentoLinha;
  t: FuncaoT;
  timeZone: string;
  unidade: string;
}) {
  const etiqueta =
    movimento.tipo === "compra"
      ? t("Compra")
      : movimento.tipo === "consumo"
        ? (movimento.servicoNome ?? t("Consumo"))
        : t("Ajuste");

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">
        {formatDia(movimento.ocorridoEm, timeZone, locale)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {etiqueta}
        {movimento.nota ? ` — ${movimento.nota}` : ""}
      </span>
      <span
        className={`text-xs font-semibold ${
          movimento.quantidade < 0 ? "text-danger" : "text-positive"
        }`}
      >
        {movimento.quantidade > 0 ? "+" : ""}
        {formatQuantidade(movimento.quantidade, locale)} {unidade}
        {movimento.custoTotal === null
          ? ""
          : ` · ${formatMoney(movimento.custoTotal, moeda, locale)}`}
      </span>
    </li>
  );
}

const MARCA = "\u0001";

/** Frase traduzida com o número em verde no meio. */
function fraseComDestaque(texto: string, valor: ReactNode) {
  const [antes, depois] = texto.split(MARCA);
  return (
    <>
      {antes}
      <span className="text-accent">{valor}</span>
      {depois}
    </>
  );
}

/** Abaixo disto o produto entra no aviso de reposição. */
const DIAS_PARA_REPOR = 14;

function precisaRepor(produto: ProdutoLinha) {
  return (
    produto.stock <= 0 ||
    (produto.diasRestantes !== null && produto.diasRestantes <= DIAS_PARA_REPOR)
  );
}

function SeloDoProduto({ produto, t }: { produto: ProdutoLinha; t: FuncaoT }) {
  if (produto.stock <= 0) {
    return <span className="ds-selo ds-selo-perigo shrink-0">{t("Acabou")}</span>;
  }
  if (produto.diasRestantes !== null && produto.diasRestantes <= DIAS_PARA_REPOR) {
    return (
      <span className="ds-selo ds-selo-alerta ds-selo-ponto shrink-0">
        {produto.diasRestantes === 1
          ? t("Acaba em {n} dia", { n: produto.diasRestantes })
          : t("Acaba em {n} dias", { n: produto.diasRestantes })}
      </span>
    );
  }
  if (produto.custoUnitario === null) {
    return <span className="ds-selo ds-selo-neutro shrink-0">{t("Sem preço")}</span>;
  }
  return <span className="ds-selo ds-selo-verde ds-selo-ponto shrink-0">{t("Em dia")}</span>;
}

export async function ProdutosPanel({
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
  sobretitulo,
  timeZone,
}: {
  actionAjuste: ProdutoAction;
  actionCompra: ProdutoAction;
  actionCriar: ProdutoAction;
  actionExcluir: ProdutoAction;
  actionReceita: ProdutoAction;
  actionRepor: ProdutoAction;
  /** Só o admin o envia: as ações dele leem o slug do formulário. */
  clienteSlug?: string;
  /** Produtos com `activo = false`, para poderem ser restaurados. */
  excluidos: ProdutoExcluido[];
  /** Seletor de cliente; só o admin o usa. */
  leading?: ReactNode;
  moeda: string;
  podeEditar: boolean;
  produtos: ProdutoLinha[];
  /** Catálogo vivo, para o seletor de "ligar serviço". */
  servicos: ServicoSimples[];
  servicosPorProduto: ServicosPorProduto;
  sobretitulo?: ReactNode;
  /** O fuso do cliente: as datas dos movimentos são escritas nele. */
  timeZone: string;
}) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];

  // O que está acabando aparece primeiro: é a ordem que faz esta tela valer
  // uma visita de manhã. Sem previsão vai para o fim, por nome.
  const ordenados = [...produtos].sort((a, b) => {
    if (a.diasRestantes === null && b.diasRestantes === null) {
      return a.nome.localeCompare(b.nome, locale);
    }

    if (a.diasRestantes === null) {
      return 1;
    }

    if (b.diasRestantes === null) {
      return -1;
    }

    return a.diasRestantes - b.diasRestantes;
  });

  const aRepor = produtos.filter(precisaRepor).length;
  const semPreco = produtos.filter((p) => p.custoUnitario === null).length;
  const comPreco = produtos.filter((p) => p.custoUnitario !== null);
  const valorEstoque = comPreco.reduce(
    (soma, p) => soma + (p.custoUnitario ?? 0) * Math.max(p.stock, 0),
    0,
  );

  const titulo =
    produtos.length === 0 ? (
      <span className="text-muted-foreground">{t("Ainda não há produtos.")}</span>
    ) : aRepor > 0 ? (
      fraseComDestaque(
        aRepor === 1
          ? t("{n} precisa de reposição.", { n: MARCA })
          : t("{n} precisam de reposição.", { n: MARCA }),
        aRepor === 1 ? t("1 produto") : t("{n} produtos", { n: aRepor }),
      )
    ) : (
      fraseComDestaque(
        t("{n} no estoque, nenhum acabando.", { n: MARCA }),
        produtos.length === 1 ? t("1 produto") : t("{n} produtos", { n: produtos.length }),
      )
    );

  return (
    <>
      <CabecalhoTela
        resto={titulo}
        sobretitulo={sobretitulo ?? t("Produtos · estoque")}
        subtitulo={
          produtos.length > 0
            ? t("O que acaba primeiro aparece primeiro.")
            : undefined
        }
      />

      {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}

      {produtos.length > 0 ? (
        <GradeMetricas colunas={comPreco.length > 0 ? 3 : 2}>
          {comPreco.length > 0 ? (
            <CartaoMetrica
              cor="var(--ds-ouro)"
              dica={t(
                "Quantidade em estoque vezes o custo da última compra, só nos produtos que têm compra registrada.",
              )}
              icone={<Wallet aria-hidden="true" className="h-4 w-4" />}
              rotulo={t("Valor do estoque")}
              valor={formatMoney(valorEstoque, moeda, locale)}
            />
          ) : null}
          <CartaoMetrica
            cor="var(--ds-alerta)"
            dica={t(
              "Produtos que acabaram ou que, no ritmo de consumo atual, acabam em até {n} dias.",
              { n: DIAS_PARA_REPOR },
            )}
            icone={<PackageX aria-hidden="true" className="h-4 w-4" />}
            nota={t("de {n} produtos", { n: produtos.length })}
            rotulo={t("Precisam de reposição")}
            valor={String(aRepor)}
          />
          <CartaoMetrica
            cor="var(--ds-info)"
            dica={t(
              "Sem compra registrada o produto não tem preço, e os serviços que o usam ficam sem custo e sem margem.",
            )}
            icone={<Receipt aria-hidden="true" className="h-4 w-4" />}
            nota={t("de {n} produtos", { n: produtos.length })}
            rotulo={t("Sem compra registrada")}
            valor={String(semPreco)}
          />
        </GradeMetricas>
      ) : null}

      {produtos.length === 0 && !podeEditar ? (
        <div className="ds-bloco">
          <VazioTela titulo={t("Ainda não há produtos.")} />
        </div>
      ) : null}

      {produtos.length === 0 && podeEditar ? (
        <div className="ds-bloco">
          <VazioTela
            texto={t("Adicione o primeiro no cartão abaixo. Depois diga quanto cada serviço gasta dele.")}
            titulo={t("Comece pelo primeiro produto")}
          />
        </div>
      ) : null}

      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ordenados.map((produto) => {
          const servicosDoProduto = servicosPorProduto.get(produto.id) ?? [];
          const jaLigados = new Set(
            servicosDoProduto.map((item) => item.servicoId),
          );

          return (
            <article
              className="ds-bloco flex min-w-0 flex-col p-5 [&:has(>details[open])]:col-span-full"
              key={produto.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[0.9375rem] font-semibold leading-snug text-foreground">
                    {produto.nome}
                  </h2>
                  {produto.notas ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {produto.notas}
                    </p>
                  ) : null}
                </div>
                <SeloDoProduto produto={produto} t={t} />
              </div>

              <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                <span
                  className={`text-[1.625rem] font-semibold tabular-nums tracking-tight ${
                    produto.stock <= 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {formatQuantidade(produto.stock, locale)} {produto.unidade}
                </span>
                <span className="text-sm text-muted-foreground">{t("em estoque")}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {legendaDaDuracao(produto, t, locale)}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                <div className="min-w-0">
                  <dt className="truncate text-muted-foreground">
                    {t("Custo por {unidade}", { unidade: produto.unidade })}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {produto.custoUnitario === null
                      ? "—"
                      : formatMoney(produto.custoUnitario, moeda, locale, 4)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-muted-foreground">{t("Dura mais")}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {produto.diasRestantes === null
                      ? "—"
                      : produto.diasRestantes === 1
                        ? t("{n} dia", { n: produto.diasRestantes })
                        : t("{n} dias", { n: produto.diasRestantes })}
                  </dd>
                </div>
              </dl>

              {servicosDoProduto.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {servicosDoProduto.slice(0, 3).map((item) => (
                    <span className="ds-selo ds-selo-neutro max-w-full truncate" key={item.servicoId}>
                      {item.servicoNome}
                    </span>
                  ))}
                  {servicosDoProduto.length > 3 ? (
                    <span className="ds-selo ds-selo-neutro">+{servicosDoProduto.length - 3}</span>
                  ) : null}
                </div>
              ) : null}

              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                  />
                  {podeEditar ? t("Compras, ajustes e serviços") : t("Ver detalhes")}
                </summary>

                <div className="mt-4 flex flex-col gap-4">
                  {produto.custoUnitario === null ? (
                    <AvisoLinha
                      detalhe={t(
                        "Sem compra registrada, este produto não tem preço, e os serviços que o usam ficam sem custo e sem margem. Registre abaixo quanto você pagou da última vez que o comprou.",
                      )}
                    >
                      {t("Sem compra registrada, este produto não tem preço.")}
                    </AvisoLinha>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("Valor do estoque")}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatMoney(produto.custoUnitario * produto.stock, moeda, locale)}
                      </span>
                    </p>
                  )}

                  {podeEditar ? (
                    <div className="grid gap-4 lg:grid-cols-2">
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

                  <div className="border-t border-border pt-4">
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
                    <div className="border-t border-border pt-4">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t("Últimos movimentos")}
                      </p>
                      <ul className="mt-2">
                        {produto.movimentos.map((movimento) => (
                          <MovimentoItem
                            key={movimento.id}
                            locale={locale}
                            moeda={moeda}
                            movimento={movimento}
                            t={t}
                            timeZone={timeZone}
                            unidade={produto.unidade}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {podeEditar ? (
                    <div className="border-t border-border pt-3">
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
              </details>
            </article>
          );
        })}

        {/* Criar produto: o cartão tracejado abre o formulário no lugar. */}
        {podeEditar ? (
          <details className="group rounded-[var(--ds-raio-bloco)] border border-dashed border-border-strong p-5 transition-colors hover:bg-surface/60 open:col-span-full open:border-solid open:bg-surface">
            <summary className="flex min-h-28 cursor-pointer list-none flex-col items-center justify-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground group-open:min-h-0 group-open:flex-row group-open:justify-start group-open:text-foreground [&::-webkit-details-marker]:hidden">
              <Plus aria-hidden="true" className="h-5 w-5" />
              {t("Adicionar produto")}
            </summary>
            <div className="mt-4">
              <CriarProdutoForm action={actionCriar} clienteSlug={clienteSlug} />
            </div>
          </details>
        ) : null}
      </div>

      {podeEditar && excluidos.length > 0 ? (
        <details className="ds-bloco group p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
            />
            {t("Excluídos")}
            <span className="ds-selo ds-selo-neutro">{excluidos.length}</span>
            <Dica
              texto={t(
                "O estoque e as compras destes produtos continuam guardados. Restaurar traz o produto de volta, mas não as quantidades por serviço.",
              )}
            />
          </summary>
          <ul className="tela-lista mt-3">
            {excluidos.map((produto) => (
              <li className="tela-linha justify-between" key={produto.id}>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {produto.nome}{" "}
                  <span className="text-xs">({produto.unidade})</span>
                </span>
                <ReporProdutoForm
                  action={actionRepor}
                  clienteSlug={clienteSlug}
                  produtoId={produto.id}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

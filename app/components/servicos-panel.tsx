import type { ReactNode } from "react";

import { ChevronRight, FlaskConical, TrendingDown, TrendingUp } from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";

import {
  ExcluirServicoForm,
  ReporServicoForm,
} from "@/app/components/servicos-estado-forms";
import { Dica } from "@/app/components/painel-ui";
import { ServicosExecucaoForm } from "@/app/components/servicos-execucao-form";
import { ServicosLinhaForm } from "@/app/components/servicos-linha-form";
import { ServicosReceitaForm } from "@/app/components/servicos-receita-form";
import {
  AvisoLinha,
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { criarT, type FuncaoT } from "@/lib/i18n/traduzir";
import type { GravarProdutoResultado } from "@/lib/produtos/write";
import {
  escalaoBase,
  type PainelServicos,
  type ServicoLinha,
} from "@/lib/servicos/read";
import type { GravarServicoResultado } from "@/lib/servicos/write";

/**
 * Corpo do painel de serviços, partilhado pelo ecrã do cliente
 * (`/app/servicos`) e pelo do administrador (`/admin/servicos`).
 *
 * O que muda entre os dois é só a moldura: o `basePath` dos links de escalão,
 * o selector de cliente que o admin tem a mais (`leading`) e o `clienteSlug`
 * que as acções do admin precisam de receber no formulário. A conta da margem
 * é a mesma — duas cópias divergiriam na primeira correcção.
 */

type GravarAction = (
  estado: GravarServicoResultado | null,
  formData: FormData,
) => Promise<GravarServicoResultado>;

type ProdutoAction = (
  estado: GravarProdutoResultado | null,
  formData: FormData,
) => Promise<GravarProdutoResultado>;

function formatMoney(value: number, moeda: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDuracao(minutos: number | null) {
  if (minutos === null || minutos <= 0) {
    return "—";
  }

  if (minutos < 60) {
    return `${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  return resto === 0
    ? `${horas}h`
    : `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * Legenda do preço mostrado. São quatro casos reais, medidos no catálogo do
 * Detail a 15/10/2026, e cada um tem de ler-se diferente: dizer "sem preço
 * definido para este escalão" num serviço de preço único seria dar a entender
 * que falta informação quando não falta nada.
 */
function legendaDoPreco(
  servico: ServicoLinha,
  escalaoActivo: string,
  t: FuncaoT,
) {
  if (escalaoActivo === escalaoBase) {
    return servico.precoUnico ? t("preço único") : t("preço base");
  }

  if (!servico.precoEstimado) {
    return t("preço deste escalão");
  }

  if (servico.precoUnico) {
    return t("preço único, não varia com o veículo");
  }

  if (servico.precosAlternativos.length > 0) {
    return t("não é cobrado por escalão, mostra o base");
  }

  return t("sem preço definido para este escalão, mostra o base");
}

function ExecutorLinhaResumo({
  linha,
  locale,
  moeda,
  t,
}: {
  linha: ServicoLinha["executores"][number];
  locale: string;
  moeda: string;
  t: FuncaoT;
}) {
  if (!linha.executa) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
        <p className="text-sm font-semibold text-muted-foreground/60">
          {linha.nome}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          {t("Não executa este serviço.")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-muted px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{linha.nome}</p>
        <p className="text-xs text-muted-foreground">
          {formatDuracao(linha.duracaoMinutos)}
        </p>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {t("Rende {valor} por hora ocupada.", {
          valor:
            linha.euroPorHora === null
              ? "—"
              : formatMoney(linha.euroPorHora, moeda, locale),
        })}
      </p>
    </div>
  );
}

/** Custo de produto e margem do serviço, já com a receita somada. */
function MargemDoServico({
  locale,
  moeda,
  servico,
  t,
}: {
  locale: string;
  moeda: string;
  servico: ServicoLinha;
  t: FuncaoT;
}) {
  const margemPositiva = servico.margem !== null && servico.margem >= 0;

  return (
    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">{t("Custo de produto")}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">
          {servico.custoProduto === null
            ? "—"
            : formatMoney(servico.custoProduto, moeda, locale)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t("Margem")}</dt>
        <dd
          className={`mt-0.5 text-sm font-semibold ${
            servico.margem === null
              ? "text-muted-foreground/60"
              : margemPositiva
                ? "text-positive"
                : "text-danger"
          }`}
        >
          {servico.margem === null
            ? "—"
            : `${formatMoney(servico.margem, moeda, locale)}${
                servico.margemPercent === null
                  ? ""
                  : ` (${servico.margemPercent.toFixed(0)}%)`
              }`}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t("Produtos na receita")}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">
          {servico.receita.length}
        </dd>
      </div>
    </dl>
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

/** "facial" → "Facial": as categorias chegam em minúsculas da base. */
function nomeCategoria(categoria: string) {
  return categoria.charAt(0).toUpperCase() + categoria.slice(1);
}

/** As durações de quem faz o serviço: "60 min" ou "45 min–1h". */
function duracaoDoServico(servico: ServicoLinha) {
  const minutos = [
    ...new Set(
      servico.executores
        .filter((linha) => linha.executa && (linha.duracaoMinutos ?? 0) > 0)
        .map((linha) => linha.duracaoMinutos as number),
    ),
  ].sort((a, b) => a - b);

  if (minutos.length === 0) return null;
  if (minutos.length === 1) return formatDuracao(minutos[0]);
  return `${formatDuracao(minutos[0])}–${formatDuracao(minutos[minutos.length - 1])}`;
}

export function ServicosPanel({
  action,
  actionExcluir,
  actionExecucao,
  actionReceita,
  actionRepor,
  basePath,
  categoria,
  clienteSlug,
  leading,
  painel,
  parametrosFixos,
  podeEditar,
  sobretitulo,
  t = criarT(null),
  locale = LOCALE_DO_IDIOMA["pt-BR"],
}: {
  action: GravarAction;
  actionExcluir: GravarAction;
  actionExecucao: ProdutoAction;
  actionReceita: ProdutoAction;
  actionRepor: GravarAction;
  basePath: string;
  /** Categoria escolhida na barra de filtro (vem do endereço). */
  categoria?: string;
  /** Só o admin o envia: as ações dele leem o slug do formulário. */
  clienteSlug?: string;
  /** Seletor de cliente; só o admin o usa. */
  leading?: ReactNode;
  painel: PainelServicos;
  /** Parâmetros a preservar ao trocar de escalão (ex.: `cliente`). */
  parametrosFixos?: Record<string, string>;
  podeEditar: boolean;
  sobretitulo?: ReactNode;
  /**
   * O idioma de quem vê. A página passa-o (`await getT()`); o painel não o vai
   * buscar sozinho para continuar a ser um componente síncrono, que é o que
   * os testes desenham com `renderToStaticMarkup`.
   */
  t?: FuncaoT;
  locale?: string;
}) {
  const entradasFixas = Object.entries(parametrosFixos ?? {});
  const hrefCom = (extra: [string, string][]) => {
    const query = new URLSearchParams([...entradasFixas, ...extra]);
    const texto = query.toString();
    return texto ? `${basePath}?${texto}` : basePath;
  };

  const temEscaloes = painel.escaloes.length > 0;
  const opcoesEscalao = [
    { chave: escalaoBase, label: t("Preço base") },
    ...painel.escaloes,
  ];

  /*
   * Um filtro só por tela. No Detail é o escalão de viatura (muda o preço);
   * onde não há escalões, filtra-se pela categoria que já vem do catálogo.
   */
  const categorias = [
    ...new Set(
      painel.servicos
        .map((servico) => servico.categoria)
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, locale));
  const filtrarCategoria = !temEscaloes && categorias.length > 1;
  const categoriaActiva =
    filtrarCategoria && categoria && categorias.includes(categoria) ? categoria : null;
  const servicosVisiveis = categoriaActiva
    ? painel.servicos.filter((servico) => servico.categoria === categoriaActiva)
    : painel.servicos;

  const principal = painel.executorPrincipal;
  const euroHoraPrincipal = painel.servicos
    .map((servico) => ({
      nome: servico.nome,
      valor:
        servico.executores.find((linha) => linha.chave === principal)
          ?.euroPorHora ?? null,
    }))
    .filter(
      (item): item is { nome: string; valor: number } => item.valor !== null,
    )
    .sort((a, b) => b.valor - a.valor);

  const melhor = euroHoraPrincipal[0] ?? null;
  const pior =
    euroHoraPrincipal.length > 1
      ? euroHoraPrincipal[euroHoraPrincipal.length - 1]
      : null;
  const nomePrincipal =
    painel.servicos
      .flatMap((servico) => servico.executores)
      .find((linha) => linha.chave === principal)?.nome ?? t("executor");

  const total = painel.servicos.length;
  const titulo = painel.vazioMotivo ? (
    <span className="text-muted-foreground">{t("Nenhum serviço para mostrar.")}</span>
  ) : (
    fraseComDestaque(
      total === 1
        ? t("O agente conhece {n} e o preço dele.", { n: MARCA })
        : t("O agente conhece {n} e os preços de cada um.", { n: MARCA }),
      total === 1 ? t("1 serviço") : t("{n} serviços", { n: total }),
    )
  );
  // Sem catálogo ou catálogo vazio é um estado normal; o resto (credenciais
  // em falta, base que não responde) é uma avaria e ganha o aviso vermelho.
  const erroDeLeitura =
    painel.vazioMotivo !== null &&
    (painel.vazioMotivo.startsWith("Não foi possível") ||
      (painel.configurado &&
        painel.vazioMotivo !== "Sem serviços activos no catálogo."));

  return (
    <>
      <CabecalhoTela
        acoes={
          painel.vazioMotivo ? null : temEscaloes ? (
            <FiltroTrilho
              opcoes={opcoesEscalao.map((opcao) => ({
                ativo: opcao.chave === painel.escalaoActivo,
                href: hrefCom([["escalao", opcao.chave]]),
                label: opcao.label,
              }))}
              rotulo={t("Escalão de viatura")}
            />
          ) : filtrarCategoria ? (
            <FiltroTrilho
              opcoes={[
                {
                  ativo: categoriaActiva === null,
                  href: hrefCom([]),
                  label: t("Todos"),
                  quantidade: total,
                },
                ...categorias.map((c) => ({
                  ativo: c === categoriaActiva,
                  href: hrefCom([["categoria", c]]),
                  label: nomeCategoria(c),
                  quantidade: painel.servicos.filter((s) => s.categoria === c).length,
                })),
              ]}
              rotulo={t("Categoria")}
            />
          ) : null
        }
        resto={titulo}
        sobretitulo={sobretitulo ?? t("Serviços · o que o agente oferece")}
        subtitulo={
          painel.somenteLeitura && !painel.vazioMotivo
            ? t("Catálogo só para consulta: os preços mudam na base do agente.")
            : undefined
        }
      />

      {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}

      {painel.vazioMotivo ? (
        <>
          {erroDeLeitura ? (
            <AvisoLinha tom="perigo">{t(painel.vazioMotivo)}</AvisoLinha>
          ) : null}
          <div className="ds-bloco">
            <VazioTela
              texto={
                erroDeLeitura
                  ? t("Recarregue a página daqui a pouco. Se continuar, avise a equipe Lexia.")
                  : undefined
              }
              titulo={
                erroDeLeitura
                  ? t("O catálogo de serviços não respondeu.")
                  : t(painel.vazioMotivo)
              }
            />
          </div>
        </>
      ) : (
        <>
          {melhor ? (
            <GradeMetricas colunas={podeEditar ? 3 : 2}>
              <CartaoMetrica
                cor="var(--ds-acao)"
                dica={t("{servico}: o que mais rende por hora ocupada de {executor}.", {
                  executor: nomePrincipal,
                  servico: melhor.nome,
                })}
                icone={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
                nota={melhor.nome}
                rotulo={t("Melhor receita/hora")}
                valor={formatMoney(melhor.valor, painel.moeda, locale)}
              />
              {pior ? (
                <CartaoMetrica
                  cor="var(--ds-ouro)"
                  dica={t("{servico}: ocupa horas de {executor} e rende menos por hora.", {
                    executor: nomePrincipal,
                    servico: pior.nome,
                  })}
                  icone={<TrendingDown aria-hidden="true" className="h-4 w-4" />}
                  nota={pior.nome}
                  rotulo={t("Pior receita/hora")}
                  valor={formatMoney(pior.valor, painel.moeda, locale)}
                />
              ) : null}
              {podeEditar ? (
                <CartaoMetrica
                  cor="var(--ds-info)"
                  dica={
                    painel.semReceita === 0
                      ? t("Todos os serviços já têm produtos associados.")
                      : t(
                          "{n} ainda sem produtos associados: marcar esses como realizados não desconta nada.",
                          { n: painel.semReceita },
                        )
                  }
                  icone={<FlaskConical aria-hidden="true" className="h-4 w-4" />}
                  nota={t("de {n} serviços", { n: total })}
                  rotulo={t("Sem produtos associados")}
                  valor={String(painel.semReceita)}
                />
              ) : null}
            </GradeMetricas>
          ) : null}

          {podeEditar && painel.produtos.length === 0 ? (
            <AvisoLinha
              detalhe={t(
                "O custo de produto de cada serviço sai da lista de produtos que ele gasta. Comece registrando os produtos e as compras na página Produtos; depois volte aqui e diga quanto cada serviço gasta de cada um.",
              )}
            >
              {t("Ainda não há produtos registrados.")}
            </AvisoLinha>
          ) : null}

          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {servicosVisiveis.map((servico) => {
              const duracao = duracaoDoServico(servico);
              const temAviso =
                servico.agendamentoId === null ||
                servico.precoDivergente ||
                servico.custoProdutoIncompleto;

              return (
                <article
                  className="ds-bloco flex min-w-0 flex-col p-5 [&:has(>details[open])]:col-span-full"
                  key={servico.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 text-[0.9375rem] font-semibold leading-snug text-foreground">
                      {servico.nome}
                    </h2>
                    {servico.precoDivergente ? (
                      <span className="ds-selo ds-selo-perigo shrink-0">{t("Preço diferente")}</span>
                    ) : servico.agendamentoId === null ? (
                      <span className="ds-selo ds-selo-alerta shrink-0">{t("Sem duração")}</span>
                    ) : (
                      <span className="ds-selo ds-selo-verde ds-selo-ponto shrink-0">{t("Ativo")}</span>
                    )}
                  </div>

                  <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-foreground">
                    {servico.preco === null ? (
                      <span className="text-lg font-semibold text-muted-foreground">
                        {servico.tipoPreco === "sob_avaliacao"
                          ? t("Preço sob avaliação")
                          : t("Sem preço")}
                      </span>
                    ) : (
                      <>
                        {servico.tipoPreco === "a_partir" ? (
                          <span className="text-sm text-muted-foreground">{t("a partir de")}</span>
                        ) : null}
                        <span className="text-[1.625rem] font-semibold tabular-nums tracking-tight">
                          {formatMoney(servico.preco, painel.moeda, locale)}
                        </span>
                      </>
                    )}
                    {duracao ? (
                      <span className="text-sm text-muted-foreground">· {duracao}</span>
                    ) : null}
                  </p>
                  {servico.preco !== null ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {legendaDoPreco(servico, painel.escalaoActivo, t)}
                    </p>
                  ) : null}

                  {servico.precosAlternativos.length > 0 ? (
                    <div className="mt-3">
                      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        {t("Outros preços deste serviço")}
                        <Dica
                          texto={
                            temEscaloes
                              ? t(
                                  "Não variam com o veículo. A margem é calculada sobre o preço base.",
                                )
                              : t("A margem é calculada sobre o preço base.")
                          }
                        />
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {servico.precosAlternativos.map((opcao) => (
                          <span className="ds-selo ds-selo-neutro" key={opcao.label}>
                            {opcao.label}
                            <span className="font-semibold text-foreground">
                              {formatMoney(opcao.valor, painel.moeda, locale)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    {servico.categoria ? (
                      <span className="ds-selo ds-selo-neutro">{nomeCategoria(servico.categoria)}</span>
                    ) : null}
                    {servico.margem !== null ? (
                      <span
                        className={`ds-selo ${servico.margem >= 0 ? "ds-selo-verde" : "ds-selo-perigo"}`}
                      >
                        {t("Margem")}{" "}
                        {servico.margemPercent === null
                          ? formatMoney(servico.margem, painel.moeda, locale)
                          : `${servico.margemPercent.toFixed(0)}%`}
                      </span>
                    ) : null}
                    {temAviso ? (
                      <span className="ds-selo ds-selo-alerta">{t("Ver aviso")}</span>
                    ) : null}
                  </div>

                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                      />
                      {podeEditar ? t("Detalhes e edição") : t("Ver detalhes")}
                    </summary>

                    <div className="mt-4 flex flex-col gap-4">
                      {servico.notasCatalogo.length > 0 ? (
                        <div className="rounded-xl bg-muted px-3 py-2.5">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {t("Nota do catálogo")}
                          </p>
                          {servico.notasCatalogo.map((nota) => (
                            <p
                              className="mt-1 text-xs leading-5 text-muted-foreground"
                              key={nota}
                            >
                              {nota}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {servico.agendamentoId === null ? (
                        <AvisoLinha>
                          {t(
                            "Este serviço existe no catálogo de venda mas não tem linha de agendamento, então não tem duração. Confirme se é intencional.",
                          )}
                        </AvisoLinha>
                      ) : null}

                      {servico.precoDivergente ? (
                        <AvisoLinha tom="perigo">
                          {t(
                            "O preço está diferente nas duas tabelas do cliente: o catálogo diz {catalogo} e o agendamento diz {agendamento}. Salvar o preço aqui volta a alinhar os dois.",
                            {
                              agendamento:
                                servico.precoBaseAgendamento === null
                                  ? "—"
                                  : formatMoney(
                                      servico.precoBaseAgendamento,
                                      painel.moeda,
                                      locale,
                                    ),
                              catalogo:
                                servico.preco === null
                                  ? "—"
                                  : formatMoney(servico.preco, painel.moeda, locale),
                            },
                          )}
                        </AvisoLinha>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {servico.executores.map((linha) => (
                          <ExecutorLinhaResumo
                            key={linha.chave}
                            linha={linha}
                            locale={locale}
                            moeda={painel.moeda}
                            t={t}
                          />
                        ))}
                      </div>

                      <div className="border-t border-border pt-4">
                        <MargemDoServico
                          locale={locale}
                          moeda={painel.moeda}
                          servico={servico}
                          t={t}
                        />

                        {servico.custoProdutoIncompleto ? (
                          <div className="mt-3">
                            <AvisoLinha
                              detalhe={t(
                                "Há produtos nesta receita sem compra registrada, por isso ainda não têm preço. O custo e a margem ficam vazios até você registrar quanto pagou por eles na página Produtos: somar só os que têm preço daria uma margem melhor do que a real.",
                              )}
                            >
                              {t("Há produtos sem preço nesta receita.")}
                            </AvisoLinha>
                          </div>
                        ) : null}
                      </div>

                      <div className="border-t border-border pt-4">
                        <ServicosReceitaForm
                          actionReceita={actionReceita}
                          clienteSlug={clienteSlug}
                          moeda={painel.moeda}
                          podeEditar={podeEditar}
                          produtosDisponiveis={painel.produtos.filter(
                            (produto) =>
                              !servico.receita.some(
                                (item) => item.produtoId === produto.id,
                              ),
                          )}
                          receita={servico.receita}
                          servicoId={servico.id}
                        />
                      </div>

                      <div className="flex flex-col gap-4 border-t border-border pt-4">
                        {podeEditar ? (
                          <ServicosExecucaoForm
                            action={actionExecucao}
                            clienteSlug={clienteSlug}
                            produtosNaReceita={servico.receita.length}
                            servicoId={servico.id}
                          />
                        ) : null}

                        <ServicosLinhaForm
                          action={action}
                          clienteSlug={clienteSlug}
                          moeda={painel.moeda}
                          notas={servico.notas}
                          podeEditar={podeEditar}
                          preco={servico.preco}
                          precoEditavel={painel.escalaoActivo === escalaoBase}
                          servicoId={servico.id}
                        />
                      </div>

                      {podeEditar ? (
                        <div className="border-t border-border pt-3">
                          <ExcluirServicoForm
                            action={actionExcluir}
                            clienteSlug={clienteSlug}
                            nome={servico.nome}
                            servicoId={servico.id}
                          />
                        </div>
                      ) : null}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </>
      )}

      {podeEditar && painel.excluidos.length > 0 ? (
        <details className="ds-bloco group p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
            />
            {t("Excluídos")}
            <span className="ds-selo ds-selo-neutro">{painel.excluidos.length}</span>
            <Dica
              texto={t(
                "Continuam no banco de dados com preço, notas, receita e histórico. Só o agente é que deixou de vendê-los.",
              )}
            />
          </summary>
          <ul className="tela-lista mt-3">
            {painel.excluidos.map((servico) => (
              <li className="tela-linha justify-between" key={servico.id}>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {servico.nome}
                </span>
                <ReporServicoForm
                  action={actionRepor}
                  clienteSlug={clienteSlug}
                  servicoId={servico.id}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

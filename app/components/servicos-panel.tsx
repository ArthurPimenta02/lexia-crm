import Link from "next/link";
import type { ReactNode } from "react";

import { ServicosExecucaoForm } from "@/app/components/servicos-execucao-form";
import { ServicosLinhaForm } from "@/app/components/servicos-linha-form";
import { ServicosReceitaForm } from "@/app/components/servicos-receita-form";
import type { GravarProdutoResultado } from "@/lib/produtos/write";
import { escalaoBase, type PainelServicos, type ServicoLinha } from "@/lib/servicos/read";
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

function formatMoney(value: number, moeda: string) {
  return new Intl.NumberFormat("pt-PT", {
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

  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * Legenda do preço mostrado. São quatro casos reais, medidos no catálogo do
 * Detail a 15/10/2026, e cada um tem de ler-se diferente: dizer "sem preço
 * definido para este escalão" num serviço de preço único seria dar a entender
 * que falta informação quando não falta nada.
 */
function legendaDoPreco(servico: ServicoLinha, escalaoActivo: string) {
  if (escalaoActivo === escalaoBase) {
    return servico.precoUnico ? "preço único" : "preço base";
  }

  if (!servico.precoEstimado) {
    return "preço deste escalão";
  }

  if (servico.precoUnico) {
    return "preço único — não varia com a viatura";
  }

  if (servico.precosAlternativos.length > 0) {
    return "não é cobrado por escalão — mostra o base";
  }

  return "sem preço definido para este escalão — mostra o base";
}

function MetricCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function ExecutorLinhaResumo({
  linha,
  moeda,
}: {
  linha: ServicoLinha["executores"][number];
  moeda: string;
}) {
  if (!linha.executa) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-2.5">
        <p className="text-sm font-semibold text-zinc-400">{linha.nome}</p>
        <p className="mt-1 text-xs text-zinc-400">Não executa este serviço.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-800">{linha.nome}</p>
        <p className="text-xs text-zinc-500">
          {formatDuracao(linha.duracaoMinutos)}
        </p>
      </div>

      <p className="mt-1.5 text-xs text-zinc-500">
        Rende{" "}
        <span className="font-semibold text-zinc-900">
          {linha.euroPorHora === null
            ? "—"
            : formatMoney(linha.euroPorHora, moeda)}
        </span>{" "}
        por hora ocupada.
      </p>
    </div>
  );
}

/** Custo de produto e margem do serviço, já com a receita somada. */
function MargemDoServico({
  moeda,
  servico,
}: {
  moeda: string;
  servico: ServicoLinha;
}) {
  const margemPositiva = servico.margem !== null && servico.margem >= 0;

  return (
    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-zinc-500">Custo de produto</dt>
        <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
          {servico.custoProduto === null
            ? "—"
            : formatMoney(servico.custoProduto, moeda)}
        </dd>
      </div>
      <div>
        <dt className="text-zinc-500">Margem</dt>
        <dd
          className={`mt-0.5 text-sm font-semibold ${
            servico.margem === null
              ? "text-zinc-400"
              : margemPositiva
                ? "text-emerald-700"
                : "text-red-700"
          }`}
        >
          {servico.margem === null
            ? "—"
            : `${formatMoney(servico.margem, moeda)}${
                servico.margemPercent === null
                  ? ""
                  : ` (${servico.margemPercent.toFixed(0)}%)`
              }`}
        </dd>
      </div>
      <div>
        <dt className="text-zinc-500">Produtos na receita</dt>
        <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
          {servico.receita.length}
        </dd>
      </div>
    </dl>
  );
}

export function ServicosPanel({
  action,
  actionExecucao,
  actionReceita,
  basePath,
  clienteSlug,
  leading,
  painel,
  parametrosFixos,
  podeEditar,
}: {
  action: GravarAction;
  actionExecucao: ProdutoAction;
  actionReceita: ProdutoAction;
  basePath: string;
  /** Só o admin o envia: as acções dele leem o slug do formulário. */
  clienteSlug?: string;
  /** Selector de cliente; só o admin o usa. */
  leading?: ReactNode;
  painel: PainelServicos;
  /** Parâmetros a preservar ao trocar de escalão (ex.: `cliente`). */
  parametrosFixos?: Record<string, string>;
  podeEditar: boolean;
}) {
  const entradasFixas = Object.entries(parametrosFixos ?? {});
  const hrefEscalao = (escalao: string) => {
    const query = new URLSearchParams([...entradasFixas, ["escalao", escalao]]);

    return `${basePath}?${query.toString()}`;
  };

  const opcoesEscalao = [
    { chave: escalaoBase, label: "Preço base" },
    ...painel.escaloes,
  ];

  const principal = painel.executorPrincipal;
  const euroHoraPrincipal = painel.servicos
    .map((servico) => ({
      nome: servico.nome,
      valor:
        servico.executores.find((linha) => linha.chave === principal)
          ?.euroPorHora ?? null,
    }))
    .filter((item): item is { nome: string; valor: number } => item.valor !== null)
    .sort((a, b) => b.valor - a.valor);

  const melhor = euroHoraPrincipal[0] ?? null;
  const pior = euroHoraPrincipal[euroHoraPrincipal.length - 1] ?? null;
  const nomePrincipal =
    painel.servicos
      .flatMap((servico) => servico.executores)
      .find((linha) => linha.chave === principal)?.nome ?? "executor";

  return (
    <>
      <div className="rounded-[22px] border border-zinc-200/80 bg-white/90 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-3">
            {leading}
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
                Escalão de viatura
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {painel.escalaoActivo === escalaoBase
                  ? "A mostrar o preço base de cada serviço."
                  : `A mostrar o preço de ${
                      painel.escaloes.find(
                        (escalao) => escalao.chave === painel.escalaoActivo,
                      )?.label ?? painel.escalaoActivo
                    }.`}
              </p>
            </div>
          </div>

          {painel.escaloes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {opcoesEscalao.map((opcao) => {
                const activo = opcao.chave === painel.escalaoActivo;

                return (
                  <Link
                    className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      activo
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                    href={hrefEscalao(opcao.chave)}
                    key={opcao.chave}
                  >
                    {opcao.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {painel.vazioMotivo ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-zinc-600">{painel.vazioMotivo}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              description={
                painel.semReceita === 0
                  ? "Todos os serviços já têm produtos associados."
                  : `${painel.semReceita} ainda sem produtos associados — marcar esses como realizados não desconta nada.`
              }
              label="Serviços activos"
              value={String(painel.servicos.length)}
            />
            <MetricCard
              description={
                melhor
                  ? `${melhor.nome} — o que mais rende por hora ocupada do ${nomePrincipal}.`
                  : "Faltam durações ou preços para comparar."
              }
              label="Melhor receita/hora"
              value={melhor ? formatMoney(melhor.valor, painel.moeda) : "—"}
            />
            <MetricCard
              description={
                pior
                  ? `${pior.nome} — ocupa horas do ${nomePrincipal} e rende menos por hora.`
                  : "Faltam durações ou preços para comparar."
              }
              label="Pior receita/hora"
              value={pior ? formatMoney(pior.valor, painel.moeda) : "—"}
            />
          </div>

          {painel.produtos.length === 0 ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-5">
              <p className="text-sm font-semibold text-amber-900">
                Ainda não há produtos registados.
              </p>
              <p className="mt-1 text-sm text-amber-800">
                O custo de produto de cada serviço sai da lista de produtos que
                ele gasta. Começa por registar os produtos e as compras na
                página <span className="font-semibold">Produtos</span>; depois
                voltas aqui e dizes quanto cada serviço gasta de cada um.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            {painel.servicos.map((servico) => (
              <div
                className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]"
                key={servico.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                      {servico.nome}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {[servico.categoria, servico.tipoPreco]
                        .filter(Boolean)
                        .join(" · ") || "Sem categoria"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tracking-tight text-zinc-950">
                      {servico.preco === null
                        ? "—"
                        : formatMoney(servico.preco, painel.moeda)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {legendaDoPreco(servico, painel.escalaoActivo)}
                    </p>
                  </div>
                </div>

                {servico.precosAlternativos.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
                    <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
                      Outros preços deste serviço
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Não variam com a viatura. A margem abaixo é calculada
                      sobre o preço base.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {servico.precosAlternativos.map((opcao) => (
                        <span
                          className="inline-flex items-baseline gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs"
                          key={opcao.label}
                        >
                          <span className="text-zinc-600">{opcao.label}</span>
                          <span className="font-semibold text-zinc-950">
                            {formatMoney(opcao.valor, painel.moeda)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {servico.notasCatalogo.length > 0 ? (
                  <div className="mt-3 rounded-xl bg-zinc-100/80 px-3 py-2.5">
                    <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
                      Nota do catálogo
                    </p>
                    {servico.notasCatalogo.map((nota) => (
                      <p className="mt-1 text-xs leading-5 text-zinc-700" key={nota}>
                        {nota}
                      </p>
                    ))}
                  </div>
                ) : null}

                {servico.agendamentoId === null ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Este serviço existe no catálogo de venda mas não tem linha
                    de agendamento, logo não tem duração. Confirma se é
                    intencional.
                  </p>
                ) : null}

                {servico.precoDivergente ? (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-900">
                    O preço está diferente nas duas tabelas do cliente: o
                    catálogo diz{" "}
                    {servico.preco === null
                      ? "—"
                      : formatMoney(servico.preco, painel.moeda)}{" "}
                    e o agendamento diz{" "}
                    {servico.precoBaseAgendamento === null
                      ? "—"
                      : formatMoney(servico.precoBaseAgendamento, painel.moeda)}
                    . Gravar o preço aqui volta a alinhar os dois.
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {servico.executores.map((linha) => (
                    <ExecutorLinhaResumo
                      key={linha.chave}
                      linha={linha}
                      moeda={painel.moeda}
                    />
                  ))}
                </div>

                <div className="mt-4 border-t border-zinc-200 pt-4">
                  <MargemDoServico moeda={painel.moeda} servico={servico} />

                  {servico.custoProdutoIncompleto ? (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Há produtos nesta receita sem compra registada, por isso
                      ainda não têm preço. O custo e a margem ficam vazios até
                      registares quanto pagaste por eles na página Produtos —
                      somar só os que têm preço dava uma margem melhor do que a
                      real.
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 border-t border-zinc-200 pt-4">
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

                <div className="mt-4 flex flex-col gap-4 border-t border-zinc-200 pt-4">
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
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

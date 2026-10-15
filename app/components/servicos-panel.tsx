import Link from "next/link";
import type { ReactNode } from "react";

import { ServicosCustoHoraForm } from "@/app/components/servicos-custo-hora-form";
import { ServicosLinhaForm } from "@/app/components/servicos-linha-form";
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

  const margemPositiva = linha.margem !== null && linha.margem >= 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-800">{linha.nome}</p>
        <p className="text-xs text-zinc-500">
          {formatDuracao(linha.duracaoMinutos)}
        </p>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-zinc-500">Receita/hora</dt>
          <dd className="mt-0.5 font-semibold text-zinc-900">
            {linha.euroPorHora === null
              ? "—"
              : formatMoney(linha.euroPorHora, moeda)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Mão-de-obra</dt>
          <dd className="mt-0.5 font-semibold text-zinc-900">
            {linha.custoMaoDeObra === null
              ? "—"
              : formatMoney(linha.custoMaoDeObra, moeda)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Margem</dt>
          <dd
            className={`mt-0.5 font-semibold ${
              linha.margem === null
                ? "text-zinc-400"
                : margemPositiva
                  ? "text-emerald-700"
                  : "text-red-700"
            }`}
          >
            {linha.margem === null
              ? "—"
              : `${formatMoney(linha.margem, moeda)}${
                  linha.margemPercent === null
                    ? ""
                    : ` (${linha.margemPercent.toFixed(0)}%)`
                }`}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ServicosPanel({
  action,
  actionCustoHora,
  basePath,
  clienteSlug,
  leading,
  painel,
  parametrosFixos,
  podeEditar,
}: {
  action: GravarAction;
  actionCustoHora: GravarAction;
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

  const executoresComCusto = painel.executores.filter(
    (executor) => executor.custoHora !== null,
  );

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
    painel.executores.find((executor) => executor.chave === principal)?.nome ??
    "executor";

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

        {painel.executores.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-6 border-t border-zinc-200 pt-5">
            {painel.executores.map((executor) => (
              <ServicosCustoHoraForm
                action={actionCustoHora}
                actualizadoEm={executor.actualizadoEm}
                clienteSlug={clienteSlug}
                custoHora={executor.custoHora}
                executor={executor.chave}
                key={executor.chave}
                moeda={painel.moeda}
                nome={executor.nome}
                podeEditar={podeEditar}
              />
            ))}
          </div>
        ) : null}
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
                painel.semCusto === 0
                  ? "Todos os serviços têm custo de produto preenchido."
                  : `${painel.semCusto} ainda sem custo de produto — a margem desses aparece vazia.`
              }
              label="Serviços activos"
              value={String(painel.servicos.length)}
            />
            <MetricCard
              description={
                melhor
                  ? `${melhor.nome} — o que mais rende por hora de trabalho do ${nomePrincipal}.`
                  : `Preenche o custo/hora do ${nomePrincipal} para ver este número.`
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

          {executoresComCusto.length === 0 ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/70 p-5">
              <p className="text-sm font-semibold text-amber-900">
                Falta o custo por hora.
              </p>
              <p className="mt-1 text-sm text-amber-800">
                A receita por hora já aparece em baixo, mas a margem só é
                calculada depois de preencheres quanto custa uma hora de cada
                executor no topo deste ecrã.
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
                      {servico.precoEstimado
                        ? "sem preço definido para este escalão — mostra o base"
                        : painel.escalaoActivo === escalaoBase
                          ? "preço base"
                          : "preço deste escalão"}
                    </p>
                  </div>
                </div>

                {servico.agendamentoId === null ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Este serviço existe no catálogo de venda mas não tem linha
                    de agendamento, logo não tem duração nem margem. Confirma se
                    é intencional.
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
                  <ServicosLinhaForm
                    action={action}
                    clienteSlug={clienteSlug}
                    custoProduto={servico.custoProduto}
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

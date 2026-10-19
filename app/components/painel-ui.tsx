import type { ReactNode } from "react";

import { Dica } from "@/app/components/dica";

export { Dica };

/**
 * As peças visuais do painel.
 *
 * Existem por uma razão concreta: o dashboard tinha doze cartões, cada um com
 * um parágrafo por baixo do número a explicar de onde o número vem. Isso é
 * uma página com mais texto do que dados — ninguém lê doze explicações, e a
 * página ficava com três ecrãs de altura só de cartões.
 *
 * Aqui a explicação não desaparece: passa para o `?` ao lado do título, que
 * se abre ao passar o rato ou ao tocar. Quem já sabe o que o número é vê só o
 * número; quem não sabe tem a explicação a um gesto de distância.
 *
 * As cores vêm todas de tokens (`bg-surface`, `text-muted-foreground`,
 * `bg-primary`) e não de valores escritos à mão. É isso que permite trocar a
 * cor de um cliente num sítio só.
 */

/**
 * O cabeçalho de uma página.
 *
 * Não tem `subtitulo`, e isso é de propósito. Cada página tinha por baixo do
 * título um ou dois parágrafos a explicar de onde vinham os dados, e o
 * resultado era meio ecrã de texto antes do primeiro número. O nome da página
 * chega: quem precisa da explicação encontra-a no `?` da métrica a que ela diz
 * respeito, que é onde ela serve para alguma coisa.
 *
 * `acoes` é o canto direito — filtros, botões. Em telemóvel passa para baixo
 * do título em vez de espremer as duas coisas na mesma linha.
 */
export function PaginaCabecalho({
  acoes,
  titulo,
}: {
  acoes?: ReactNode;
  titulo: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {titulo}
      </h1>
      {acoes ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
          {acoes}
        </div>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitulo({
  children,
  dica,
}: {
  children: ReactNode;
  dica?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-5 pt-4 pb-3">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {dica ? <Dica texto={dica} /> : null}
    </div>
  );
}

/**
 * O título de um grupo de métricas.
 *
 * O `sufixo` é o que qualifica o grupo sem pesar como título: "todo o
 * histórico", "no período". Lê-se como uma frase e ocupa uma linha só.
 */
export function SeccaoTitulo({
  children,
  dica,
  sufixo,
}: {
  children: ReactNode;
  dica?: string;
  sufixo?: string;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <span>
        {children}
        {sufixo ? (
          <span className="ml-1.5 font-normal text-muted-foreground">
            {sufixo}
          </span>
        ) : null}
      </span>
      {dica ? <Dica texto={dica} /> : null}
    </h2>
  );
}

export type ItemMetrica = {
  dica?: string;
  label: string;
  nota?: string;
  valor: number | string | null;
};

const colunasPorContagem: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * Uma faixa de métricas: um cartão só, com as células separadas por linhas.
 *
 * Existe porque catorze cartões soltos do mesmo tamanho não têm hierarquia —
 * tudo pesa igual e o olho não sabe onde pousar. Agrupados em faixas com um
 * título por cima, cada faixa responde a uma pergunta e o número continua a
 * ser a coisa maior na célula.
 *
 * As divisórias são bordas nas próprias células, não um `gap-px` sobre fundo
 * cinzento. Com o fundo cinzento, uma faixa de sete métricas numa grelha de
 * quatro deixava o oitavo lugar vazio — e o vazio aparecia como um bloco
 * cinzento. Com bordas, o lugar que sobra fica simplesmente branco. O
 * `-mr-px -mb-px` empurra as bordas da última coluna e da última linha para
 * fora do cartão, onde o `overflow-hidden` as corta.
 */
export function GrupoMetricas({ itens }: { itens: ItemMetrica[] }) {
  const colunas = colunasPorContagem[itens.length] ?? "lg:grid-cols-4";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,19,26,0.04)]">
      <div
        className={`-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3 ${colunas}`}
      >
        {itens.map((item) => {
          const porLigar = item.valor === null || item.valor === "--";

          return (
            <div
              className="border-r border-b border-border px-4 py-4 sm:px-5"
              key={item.label}
            >
              <div className="flex items-start gap-1">
                <p className="min-w-0 text-[13px] leading-tight text-muted-foreground">
                  {item.label}
                </p>
                {item.dica ? <Dica texto={item.dica} /> : null}
              </div>

              <p
                className={`mt-2.5 text-[1.6rem] leading-none font-semibold tracking-tight tabular-nums ${
                  porLigar ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {porLigar ? "--" : item.valor}
              </p>

              {porLigar ? (
                <p className="mt-2 text-xs font-medium text-warning">
                  Por ligar
                </p>
              ) : item.nota ? (
                <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {item.nota}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Métrica secundária: uma linha, não um cartão inteiro. */
export function LinhaMetrica({
  dica,
  label,
  nota,
  valor,
}: {
  dica?: string;
  label: string;
  nota?: string;
  valor: number | string | null;
}) {
  const porLigar = valor === null || valor === "--";

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
          </p>
          {nota ? (
            <p className="truncate text-xs text-muted-foreground">{nota}</p>
          ) : null}
        </div>
        {dica ? <Dica texto={dica} /> : null}
      </div>
      <p
        className={`shrink-0 text-lg font-semibold tabular-nums ${
          porLigar ? "text-muted-foreground/50" : "text-foreground"
        }`}
      >
        {porLigar ? "--" : valor}
      </p>
    </div>
  );
}

/**
 * As horas em que mais mensagens entram.
 *
 * Deixou de ser uma grelha de cartões com "N mensagens" escrito por extenso
 * em cada um: a contagem está na intensidade da cor e no número à direita. O
 * que se quer daqui é "a que horas é que isto aquece", e isso lê-se de
 * relance.
 */
export function HorariosDePico({
  cells,
}: {
  cells: { day: string; hour: number; value: number }[];
}) {
  const maxValue = Math.max(...cells.map((cell) => cell.value), 1);
  const peakCells = cells
    .filter((cell) => cell.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (peakCells.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem mensagens recebidas no período.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {peakCells.map((cell) => (
        <div
          className="rounded-xl border border-border px-3 py-2.5"
          key={`${cell.day}-${cell.hour}`}
          style={{
            backgroundColor: `color-mix(in oklab, var(--primary) ${
              6 + (cell.value / maxValue) * 14
            }%, transparent)`,
          }}
        >
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {cell.day}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {String(cell.hour).padStart(2, "0")}h
            </p>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">
              {cell.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Ranking({
  itens,
  vazio,
}: {
  itens: { label: string; value: number }[];
  vazio: string;
}) {
  if (itens.length === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>;
  }

  const maximo = Math.max(...itens.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {itens.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.value}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((item.value / maximo) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

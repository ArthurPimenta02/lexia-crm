"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import { useIdioma } from "@/app/components/idioma";
import { caminhoSuave } from "@/lib/curva";

/**
 * Gráficos do painel, desenhados à mão em SVG (sem biblioteca: são poucas
 * linhas e assim não pesam no carregamento).
 *
 * Todos seguem as mesmas regras: cores dos tokens (funcionam no escuro),
 * largura fluida, valor de cada ponto ao passar o rato ou tocar, e entrada
 * curta que respeita "movimento reduzido".
 */

export type SerieArea = {
  /** Cor da série; por omissão a principal (1.ª) e a de destaque (2.ª). */
  cor?: string;
  nome: string;
  tracejada?: boolean;
  valores: number[];
};

const ALTURA = 200;

function caminho(valores: number[], max: number, largura: number) {
  if (valores.length === 0) return "";
  if (valores.length === 1) {
    // Um ponto só vira uma linha reta, senão não se via nada.
    const y = (ALTURA - (valores[0] / max) * (ALTURA - 16) - 4).toFixed(1);
    return `M0,${y} L${largura},${y}`;
  }
  const passo = largura / (valores.length - 1);
  return caminhoSuave(
    valores.map((v, i) => [i * passo, ALTURA - (v / max) * (ALTURA - 16) - 4]),
  );
}

export function GraficoArea({
  formatar = (n) => String(n),
  rotulos,
  series,
  vazio,
}: {
  formatar?: (n: number) => string;
  rotulos: string[];
  series: SerieArea[];
  vazio?: ReactNode;
}) {
  const { locale } = useIdioma();
  const id = useId().replace(/:/g, "");
  const caixa = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const largura = 600;
  const n = rotulos.length;
  const max = Math.max(1, ...series.flatMap((s) => s.valores)) * 1.12;
  const cores = series.map(
    (s, i) => s.cor ?? (i === 0 ? "var(--ds-acao)" : "var(--ds-mancha-2)"),
  );
  const total = series[0]?.valores.reduce((a, b) => a + b, 0) ?? 0;
  const grade = useMemo(() => [0.25, 0.5, 0.75], []);

  if (n === 0 || (total === 0 && series.every((s) => s.valores.every((v) => v === 0)))) {
    return (
      <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">
        {vazio}
      </div>
    );
  }

  const escolher = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setFoco(n > 1 ? Math.round(p * (n - 1)) : 0);
  };
  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const yPct = (v: number) => ((ALTURA - (v / max) * (ALTURA - 16) - 4) / ALTURA) * 100;
  const numero = new Intl.NumberFormat(locale);

  // Rótulos do eixo: no máximo ~7, para não se atropelarem no telemóvel.
  const salto = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="select-none">
      <div
        className="relative h-[200px] touch-pan-y"
        onPointerDown={(e) => escolher(e.clientX)}
        onPointerLeave={() => setFoco(null)}
        onPointerMove={(e) => escolher(e.clientX)}
        ref={caixa}
      >
        <svg
          aria-hidden="true"
          className="grafico-revelar absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${largura} ${ALTURA}`}
        >
          <defs>
            {series.map((_, i) => (
              <linearGradient id={`${id}-g${i}`} key={i} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={cores[i]} stopOpacity={i === 0 ? 0.26 : 0.1} />
                <stop offset="100%" stopColor={cores[i]} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {grade.map((g) => (
            <line
              key={g}
              stroke="var(--border)"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2={largura}
              y1={ALTURA * g}
              y2={ALTURA * g}
            />
          ))}
          {series.map((s, i) => {
            const d = caminho(s.valores, max, largura);
            return (
              <g key={s.nome}>
                {!s.tracejada ? (
                  <path
                    d={`${d} L${largura},${ALTURA} L0,${ALTURA} Z`}
                    fill={`url(#${id}-g${i})`}
                  />
                ) : null}
                <path
                  d={d}
                  fill="none"
                  stroke={cores[i]}
                  strokeDasharray={s.tracejada ? "6 6" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={s.tracejada ? 1.75 : 2.25}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {foco !== null ? (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-border-strong"
              style={{ left: `${xPct(foco)}%` }}
            />
            {series.map((s, i) => (
              <span
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                key={s.nome}
                style={{
                  background: cores[i],
                  left: `${xPct(foco)}%`,
                  top: `${yPct(s.valores[foco] ?? 0)}%`,
                }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-[var(--ds-sombra-2)]"
              style={
                xPct(foco) > 60
                  ? { right: `${100 - xPct(foco) + 2}%` }
                  : { left: `${xPct(foco) + 2}%` }
              }
            >
              <p className="font-semibold text-foreground">{rotulos[foco]}</p>
              {series.map((s, i) => (
                <p className="mt-1 flex items-center justify-between gap-4 text-muted-foreground" key={s.nome}>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: cores[i] }} />
                    {s.nome}
                  </span>
                  <span className="ds-numero text-foreground">
                    {formatar(s.valores[foco] ?? 0)}
                  </span>
                </p>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="relative mt-2 h-4 text-[0.6875rem] text-muted-foreground">
        {rotulos.map((r, i) =>
          // O último rótulo encosta à direita e o primeiro à esquerda; um
          // rótulo a menos de um salto do último fica de fora para não se
          // encavalitarem ("12:0013:00").
          (i % salto === 0 && (n - 1 - i >= salto || n === 1)) || i === n - 1 ? (
            <span
              className={`absolute whitespace-nowrap tabular-nums ${
                i === n - 1 && n > 1 ? "" : i === 0 ? "" : "-translate-x-1/2"
              }`}
              key={`${r}-${i}`}
              style={
                i === n - 1 && n > 1
                  ? { right: 0 }
                  : i === 0
                    ? { left: 0 }
                    : { left: `${xPct(i)}%` }
              }
            >
              {r}
            </span>
          ) : null,
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <span className="flex items-center gap-1.5" key={s.nome}>
            <span
              className="h-0.5 w-3.5 rounded-full"
              style={{
                background: s.tracejada
                  ? `repeating-linear-gradient(90deg, ${cores[i]} 0 3px, transparent 3px 5px)`
                  : cores[i],
              }}
            />
            {s.nome}
            <span className="ds-numero text-foreground">
              {numero.format(s.valores.reduce((a, b) => a + b, 0))}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export type ItemBarra = { icone?: ReactNode; rotulo: string; valor: number };

/** Barras verticais: a maior na cor principal, as outras em tons suaves. */
export function GraficoBarras({
  itens,
  vazio,
}: {
  itens: ItemBarra[];
  vazio?: ReactNode;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const total = itens.reduce((a, b) => a + b.valor, 0);
  const max = Math.max(1, ...itens.map((i) => i.valor));

  if (total === 0) {
    return (
      <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">
        {vazio}
      </div>
    );
  }

  const ordem = [...itens].sort((a, b) => b.valor - a.valor);
  const maior = ordem[0]?.rotulo;

  return (
    <div className="flex h-[236px] items-end gap-3 sm:gap-4">
      {itens.map((item, i) => {
        const pct = Math.round((item.valor / total) * 100);
        const destaque = item.rotulo === maior;
        return (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-2"
            key={item.rotulo}
            onPointerEnter={() => setFoco(i)}
            onPointerLeave={() => setFoco(null)}
          >
            <span className="ds-numero text-xs text-foreground">
              {foco === i ? item.valor : `${pct}%`}
            </span>
            <div className="flex h-[160px] w-full items-end">
              <div
                className="grafico-barra w-full rounded-[10px] transition-[filter] duration-150"
                style={{
                  background: destaque ? "var(--ds-acao)" : i % 2 ? "var(--ds-mancha-2)" : "var(--ds-acao-suave)",
                  filter: foco !== null && foco !== i ? "saturate(0.6) opacity(0.7)" : undefined,
                  height: `${Math.max(3, (item.valor / max) * 100)}%`,
                }}
              />
            </div>
            <span className="flex max-w-full items-center gap-1 truncate text-[0.6875rem] text-muted-foreground">
              {item.icone}
              <span className="truncate">{item.rotulo}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Dias × horas: cada quadrado mais escuro quanto mais mensagens chegaram. */
export function MapaDeCalor({
  celulas,
  dias,
  vazio,
}: {
  celulas: { day: string; hour: number; value: number }[];
  /** Os dias na ordem em que aparecem, já traduzidos: [chave, rótulo]. */
  dias: [string, string][];
  vazio?: ReactNode;
}) {
  const { t } = useIdioma();
  const [foco, setFoco] = useState<{ d: string; h: number; v: number } | null>(null);
  const valor = new Map(celulas.map((c) => [`${c.day}:${c.hour}`, c.value]));
  const max = Math.max(0, ...celulas.map((c) => c.value));

  if (max === 0) {
    return <p className="text-sm text-muted-foreground">{vazio}</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[520px] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[3px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span className="text-center text-[0.625rem] text-muted-foreground tabular-nums" key={h}>
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {dias.map(([chave, rotulo]) => (
            <div className="contents" key={chave}>
              <span className="self-center text-[0.6875rem] text-muted-foreground">{rotulo}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const v = valor.get(`${chave}:${h}`) ?? 0;
                return (
                  <span
                    className="aspect-square rounded-[4px] transition-transform duration-100 hover:scale-125"
                    key={h}
                    onPointerEnter={() => setFoco({ d: rotulo, h, v })}
                    onPointerLeave={() => setFoco(null)}
                    style={{
                      background:
                        v === 0
                          ? "var(--muted)"
                          : `color-mix(in oklab, var(--ds-acao) ${18 + (v / max) * 82}%, var(--ds-superficie))`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 h-4 text-xs text-muted-foreground tabular-nums">
        {foco
          ? t("{dia}, {hora}h: {n} mensagens", {
              dia: foco.d,
              hora: String(foco.h).padStart(2, "0"),
              n: foco.v,
            })
          : t("Passe o mouse para ver cada horário.")}
      </p>
    </div>
  );
}

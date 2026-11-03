import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronRight } from "lucide-react";

import { Dica } from "@/app/components/dica";
import { caminhoSuave } from "@/lib/curva";

/**
 * Cartão de métrica no estilo dos cartões do app Saúde da Apple: ícone num
 * quadradinho com a cor da métrica, o nome na mesma cor, o número grande com
 * a unidade pequena e, quando há série, um mini-gráfico do período.
 *
 * Funciona em componentes de servidor (sem hooks). Com `href` vira link: sobe
 * no rato, afunda no toque e mostra a seta.
 */
export function CartaoMetrica({
  cor = "var(--ds-acao)",
  dica,
  faisca,
  href,
  icone,
  nota,
  rotulo,
  unidade,
  valor,
}: {
  cor?: string;
  dica?: string;
  faisca?: number[];
  href?: string;
  icone: ReactNode;
  nota?: ReactNode;
  rotulo: string;
  unidade?: string;
  valor: string;
}) {
  const vazio = valor === "--";
  const miolo = (
    <>
      <div className="flex items-center gap-2">
        <span className="ds-chip-icone" style={{ ["--chip" as string]: cor }}>
          {icone}
        </span>
        <span className="min-w-0 truncate text-[0.8125rem] font-semibold" style={{ color: cor }}>
          {rotulo}
        </span>
        {dica ? <Dica texto={dica} /> : null}
        {href ? (
          <ChevronRight aria-hidden="true" className="ds-seta ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`ds-valor ${vazio ? "text-muted-foreground/50" : "text-foreground"}`}>
          {valor}
          {unidade && !vazio ? <small>{unidade}</small> : null}
        </p>
        {faisca && faisca.some((v) => v > 0) ? <Faisca cor={cor} valores={faisca} /> : null}
      </div>

      {nota ? <p className="mt-2 truncate text-xs text-muted-foreground">{nota}</p> : null}
    </>
  );

  const classe = "ds-bloco flex min-w-0 flex-col p-4 sm:p-5";
  return href ? (
    <Link className={`${classe} ds-interativo`} href={href} prefetch>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

/** Mini-gráfico de linha (sparkline), sem eixos: só a forma do período. */
export function Faisca({ cor, valores }: { cor: string; valores: number[] }) {
  const w = 84;
  const h = 32;
  const max = Math.max(1, ...valores);
  const pts = valores.map((v, i) => [
    valores.length > 1 ? (i / (valores.length - 1)) * w : w / 2,
    h - 3 - (v / max) * (h - 6),
  ]);
  const linha = caminhoSuave(pts as [number, number][]);
  const ultimo = pts[pts.length - 1];
  return (
    <svg aria-hidden="true" className="h-8 w-[84px] shrink-0 overflow-visible" viewBox={`0 0 ${w} ${h}`}>
      <path d={`${linha} L${w},${h} L0,${h} Z`} fill={cor} opacity="0.1" />
      <path d={linha} fill="none" stroke={cor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      {ultimo ? <circle cx={ultimo[0]} cy={ultimo[1]} fill={cor} r="2.5" /> : null}
    </svg>
  );
}

/** Uma linha de lista agrupada, com ícone colorido à esquerda. */
export function LinhaLista({
  cor = "var(--ds-acao)",
  dica,
  icone,
  nota,
  rotulo,
  valor,
}: {
  cor?: string;
  dica?: string;
  icone: ReactNode;
  nota?: string;
  rotulo: string;
  valor: number | string | null;
}) {
  const vazio = valor === null || valor === "--";
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="ds-chip-icone" style={{ ["--chip" as string]: cor }}>
        {icone}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{rotulo}</p>
          {nota ? <p className="truncate text-xs text-muted-foreground">{nota}</p> : null}
        </div>
        {dica ? <Dica texto={dica} /> : null}
      </div>
      <p
        className={`shrink-0 text-[1.0625rem] font-semibold tabular-nums tracking-tight ${
          vazio ? "text-muted-foreground/50" : "text-foreground"
        }`}
      >
        {vazio ? "--" : valor}
      </p>
    </div>
  );
}

/** Separa "25s" / "1,2 min" / "100%" em número e unidade. */
export function separarUnidade(texto: string): { unidade?: string; valor: string } {
  const m = texto.match(/^([+\-−]?[\d.,\s]+)\s*([^\d\s].*)?$/);
  if (!m) return { valor: texto };
  return { unidade: m[2]?.trim() || undefined, valor: m[1].trim() };
}

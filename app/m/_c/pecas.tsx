import { Fragment } from "react";

import { IcCanalMarca } from "./icones";

/**
 * Peças pequenas do desenho v6 (14/11), partilhadas pelas telas do app.
 * Sem "use client": servem tanto as telas do servidor como as do aparelho.
 */

/** Um texto traduzido com `{chave}` trocadas por pedaços com estilo (ex.: números a verde). */
export function Moldado({ texto, partes }: { texto: string; partes: Record<string, React.ReactNode> }) {
  const bocados = texto.split(/\{(\w+)\}/g);
  return <>{bocados.map((b, i) => (i % 2 ? <Fragment key={i}>{b in partes ? partes[b] : `{${b}}`}</Fragment> : b))}</>;
}

/** O círculo com as iniciais e, se houver canal, a marca dele no canto. */
export function Iniciais({ texto, canal, tamanho = 44 }: { texto: string; canal?: string; tamanho?: number }) {
  return (
    <span aria-hidden="true" className="m-ini" style={{ fontSize: tamanho >= 44 ? 14 : 13, height: tamanho, width: tamanho }}>
      {texto}
      {canal ? <span className="canal"><IcCanalMarca canal={canal} /></span> : null}
    </span>
  );
}

/** O valor em dinheiro com os cêntimos mais pequenos ("€142" + ",30"). */
export function ValorGrande({ valor, locale, moeda }: { valor: number; locale: string; moeda: string }) {
  const partes = new Intl.NumberFormat(locale, { currency: moeda, maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).formatToParts(valor);
  const iFracao = partes.findIndex((p) => p.type === "decimal");
  if (iFracao < 0) return <>{partes.map((p) => p.value).join("")}</>;
  const fimFracao = partes.findIndex((p, i) => i > iFracao && p.type !== "fraction");
  const antes = partes.slice(0, iFracao).map((p) => p.value).join("");
  const fracao = partes.slice(iFracao, fimFracao < 0 ? undefined : fimFracao).map((p) => p.value).join("");
  const depois = fimFracao < 0 ? "" : partes.slice(fimFracao).map((p) => p.value).join("");
  return <>{antes}<span className="cent">{fracao}{depois}</span></>;
}

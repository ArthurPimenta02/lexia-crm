"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { Check } from "lucide-react";

/**
 * Peças do design system da Lexia (v1, em avaliação).
 *
 * Cada peça só junta classes de `app/design-system.css`. A regra é: uma tela
 * nova nunca escreve cor, raio ou altura à mão — usa uma destas peças. Hoje o
 * painel tem 5 alturas de botão e 7 raios diferentes porque cada tela
 * escolheu o seu.
 */

type Variante = "primario" | "verde" | "secundario" | "fantasma" | "perigo";
type Tamanho = "p" | "m" | "g";

export function Botao({
  children,
  className = "",
  tamanho = "m",
  variante = "primario",
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tamanho?: Tamanho;
  variante?: Variante;
}) {
  const t = tamanho === "m" ? "" : `ds-botao-${tamanho}`;
  return (
    <button
      className={`ds-botao ds-botao-${variante} ${t} ${className}`}
      type="button"
      {...resto}
    >
      {children}
    </button>
  );
}

type Tom = "verde" | "neutro" | "alerta" | "perigo" | "ouro" | "escuro";

export function Selo({
  children,
  ponto = false,
  tom = "neutro",
}: {
  children: ReactNode;
  ponto?: boolean;
  tom?: Tom;
}) {
  return (
    <span className={`ds-selo ds-selo-${tom} ${ponto ? "ds-selo-ponto" : ""}`}>
      {children}
    </span>
  );
}

export function Cartao({
  children,
  className = "",
  nivel = 2,
  style,
}: {
  children: ReactNode;
  className?: string;
  nivel?: 1 | 2;
  style?: CSSProperties;
}) {
  return (
    <div className={`${nivel === 2 ? "ds-cartao" : "ds-bloco"} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CabecalhoCartao({
  acao,
  icone,
  subtitulo,
  titulo,
}: {
  acao?: ReactNode;
  icone?: ReactNode;
  subtitulo?: string;
  titulo: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icone ? (
          <span className="mt-0.5 text-[var(--ds-texto-3)]">{icone}</span>
        ) : null}
        <div className="min-w-0">
          <h3 className="ds-titulo-3">{titulo}</h3>
          {subtitulo ? <p className="ds-legenda mt-0.5">{subtitulo}</p> : null}
        </div>
      </div>
      {acao}
    </div>
  );
}

export function Segmentado<T extends string>({
  onChange,
  opcoes,
  valor,
}: {
  onChange: (v: T) => void;
  opcoes: { label: string; valor: T }[];
  valor: T | T[];
}) {
  const activos = Array.isArray(valor) ? valor : [valor];
  return (
    <div className="ds-segmentado" role="group">
      {opcoes.map((o) => (
        <button
          aria-pressed={activos.includes(o.valor)}
          className="ds-segmento"
          key={o.valor}
          onClick={() => onChange(o.valor)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Trilho<T extends string>({
  onChange,
  opcoes,
  valor,
}: {
  onChange: (v: T) => void;
  opcoes: { label: string; valor: T }[];
  valor: T;
}) {
  return (
    <div className="ds-trilho" role="group">
      {opcoes.map((o) => (
        <button
          aria-pressed={o.valor === valor}
          key={o.valor}
          onClick={() => onChange(o.valor)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({
  ligado,
  onChange,
  rotulo,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <button
      aria-checked={ligado}
      aria-label={rotulo}
      className="ds-interruptor"
      onClick={() => onChange(!ligado)}
      role="switch"
      type="button"
    />
  );
}

export function Etapas({
  itens,
}: {
  itens: { feita?: boolean; nota?: string; titulo: string }[];
}) {
  return (
    <ol className="ds-etapas">
      {itens.map((item, i) => (
        <li className="ds-etapa" data-feita={item.feita ? "true" : "false"} key={item.titulo}>
          <span className="ds-etapa-marca">
            {item.feita ? <Check size={12} strokeWidth={3} /> : i + 1}
          </span>
          <div>
            <p
              className="text-[0.8125rem] font-medium"
              style={{ color: item.feita ? "var(--ds-texto)" : "var(--ds-texto-2)" }}
            >
              {item.titulo}
            </p>
            {item.nota ? <p className="ds-legenda">{item.nota}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Barra({ valor }: { valor: number }) {
  return (
    <div className="ds-barra" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </div>
  );
}

const coresAvatar = ["#2bb88a", "#6d5bd0", "#d9822b", "#2f7fd8", "#c2477a", "#3a8f6b"];

export function Avatar({ nome, tamanho = 28 }: { nome: string; tamanho?: number }) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const cor = coresAvatar[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % coresAvatar.length];
  return (
    <span
      className="ds-avatar"
      style={{ background: cor, height: tamanho, width: tamanho, fontSize: tamanho * 0.36 }}
    >
      {iniciais}
    </span>
  );
}

export function Metrica({
  rotulo,
  valor,
  variacao,
}: {
  rotulo: string;
  valor: string;
  variacao?: { positiva: boolean; texto: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="ds-sobretitulo">{rotulo}</span>
      <span className="ds-numero text-[1.75rem]">{valor}</span>
      {variacao ? (
        <span
          className="text-xs font-medium"
          style={{ color: variacao.positiva ? "var(--ds-verde-forte)" : "var(--ds-perigo)" }}
        >
          {variacao.texto}
        </span>
      ) : null}
    </div>
  );
}

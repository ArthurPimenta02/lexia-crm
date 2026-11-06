import Link from "next/link";
import type { ReactNode } from "react";

import { AlertCircle, Info } from "lucide-react";

import { ChannelIcon } from "@/app/components/channel-brand";
import { Mascote, type PoseMascote } from "@/app/components/mascote";

/**
 * As peças comuns das telas do painel (redesenho de 06/11/2026).
 *
 * Todas as telas seguem o desenho do dashboard: um título que já diz o que
 * importa agora, os números em cartões, listas com o rosto de cada pessoa,
 * um só tipo de filtro, avisos numa linha e o beija-flor quando não há nada.
 * Os textos chegam já traduzidos (quem chama faz o `t()`), por isso estas
 * peças funcionam em componentes de servidor e de cliente.
 */

/**
 * O cabeçalho de uma tela. `destaque` é a parte do título em verde (o número
 * que importa) e `resto` continua a frase em preto. Sem número a destacar,
 * passa só `resto`.
 */
export function CabecalhoTela({
  acoes,
  destaque,
  resto,
  sobretitulo,
  subtitulo,
}: {
  acoes?: ReactNode;
  destaque?: ReactNode;
  resto?: ReactNode;
  sobretitulo?: ReactNode;
  subtitulo?: ReactNode;
}) {
  return (
    <header className="ds-entrar flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {sobretitulo ? <p className="ds-sobretitulo truncate">{sobretitulo}</p> : null}
        <h1 className={`ds-titulo-1 text-foreground ${sobretitulo ? "mt-2" : ""}`}>
          {destaque ? <span className="text-accent">{destaque}</span> : null}
          {destaque && resto ? " " : null}
          {resto}
        </h1>
        {subtitulo ? (
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">{subtitulo}</p>
        ) : null}
      </div>
      {acoes ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{acoes}</div>
      ) : null}
    </header>
  );
}

/** A grade dos cartões de número (2 colunas no celular, até 4 no computador). */
export function GradeMetricas({ children, colunas = 4 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  const lg = colunas === 4 ? "xl:grid-cols-4" : colunas === 3 ? "xl:grid-cols-3" : "";
  return <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${lg}`}>{children}</div>;
}

/**
 * O filtro único de todas as telas: uma barra de opções (como a do período no
 * dashboard). Cada opção é um link, para o filtro ficar no endereço e o botão
 * voltar funcionar.
 */
export function FiltroTrilho({
  opcoes,
  rotulo,
}: {
  opcoes: { ativo: boolean; href: string; label: ReactNode; quantidade?: number | null }[];
  rotulo: string;
}) {
  return (
    <nav aria-label={rotulo} className="ds-trilho w-fit max-w-full self-start overflow-x-auto">
      {opcoes.map((o) => (
        <Link
          aria-current={o.ativo ? "page" : undefined}
          className={`inline-flex h-[1.875rem] shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] ${
            o.ativo
              ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
          href={o.href}
          key={o.href}
          prefetch
          scroll={false}
        >
          {o.label}
          {o.quantidade !== undefined && o.quantidade !== null ? (
            <span className="tabular-nums text-muted-foreground/70">{o.quantidade}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

const coresAvatar = [
  "--av-1", "--av-2", "--av-3", "--av-4", "--av-5", "--av-6",
] as const;

function iniciais(nome: string) {
  const partes = nome.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return partes
    .slice(0, 2)
    // Array.from pega a letra inteira (emoji e letras estilizadas têm 2 partes).
    .map((p) => (Array.from(p)[0] ?? "").toUpperCase())
    .join("");
}

/**
 * O rosto de uma pessoa nas listas: iniciais numa cor fixa (a mesma pessoa
 * tem sempre a mesma cor) e, no canto, o canal por onde ela fala.
 */
export function AvatarCanal({
  canal,
  nome,
  tamanho = 36,
}: {
  canal?: string | null;
  nome: string;
  tamanho?: number;
}) {
  const indice = [...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % coresAvatar.length;
  const cor = coresAvatar[indice];
  return (
    <span
      aria-hidden="true"
      className="tela-avatar"
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.round(tamanho * 0.36),
        background: `var(${cor}-fundo)`,
        color: `var(${cor}-texto)`,
      }}
    >
      {iniciais(nome)}
      {canal ? (
        // O ícone base tem 20px; encolhe com o avatar (≈40% dele) para não tapar as iniciais.
        <span
          className="tela-avatar-canal"
          style={{ transform: `scale(${Math.min(18, Math.max(12, Math.round(tamanho * 0.4))) / 20})`, transformOrigin: "bottom right" }}
        >
          <ChannelIcon channel={canal} size="sm" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Aviso numa linha: o que aconteceu e, à direita, o que fazer. Fica no lugar
 * dos parágrafos laranja. Explicações longas vão para o `detalhe`, que abre
 * ao clicar.
 */
export function AvisoLinha({
  acao,
  children,
  detalhe,
  tom = "alerta",
}: {
  acao?: ReactNode;
  children: ReactNode;
  detalhe?: ReactNode;
  tom?: "alerta" | "info" | "perigo";
}) {
  const Icone = tom === "info" ? Info : AlertCircle;
  const conteudo = (
    <>
      <Icone aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {acao ? <span className="shrink-0 font-semibold">{acao}</span> : null}
    </>
  );
  if (detalhe) {
    // A ação fica fora do <summary>: clicar nela não abre nem fecha a explicação.
    return (
      <div className={`tela-aviso tela-aviso-${tom} flex items-start gap-2.5`}>
        <details className="group min-w-0 flex-1">
          <summary className="flex cursor-pointer list-none items-center gap-2.5">
            <Icone aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{children}</span>
          </summary>
          <div className="mt-2 pl-6.5 text-[0.8125rem] font-normal leading-relaxed opacity-90">{detalhe}</div>
        </details>
        {acao ? <span className="shrink-0 font-semibold">{acao}</span> : null}
      </div>
    );
  }
  return <div className={`tela-aviso tela-aviso-${tom} flex items-center gap-2.5`}>{conteudo}</div>;
}

/** Tela (ou bloco) vazio: o beija-flor, uma frase e, se houver, o próximo passo. */
export function VazioTela({
  acao,
  pose = "ola",
  texto,
  titulo,
}: {
  acao?: ReactNode;
  pose?: PoseMascote;
  texto?: ReactNode;
  titulo: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Mascote pose={pose} tamanho={84} />
      <p className="ds-titulo-3 mt-1 text-foreground">{titulo}</p>
      {texto ? <p className="max-w-[38ch] text-sm text-muted-foreground">{texto}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}

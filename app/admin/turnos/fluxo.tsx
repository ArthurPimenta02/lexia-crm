import {
  BellRing,
  CalendarPlus,
  ChevronRight,
  CircleSlash,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Dica } from "@/app/components/dica";
import { formatarDuracao, legivel, type Passo } from "@/lib/turnos/formatar";
import type { AcaoVisivel, EstadoFase, Fase, LinhaFluxo, TipoAcaoVisivel } from "@/lib/turnos/mapa";

/**
 * O caminho de uma resposta como uma linha do tempo: um ponto por etapa, como
 * os nós do n8n lidos de cima para baixo. O que importa (o que decidiu, o que
 * consultou) fica à vista; o detalhe de cada nó abre ao clicar na etapa.
 */

const PONTO: Record<EstadoFase, string> = {
  feito: "border-positive bg-positive",
  parou: "border-warning bg-warning",
  erro: "border-danger bg-danger",
  nao_usado: "border-border-strong bg-surface",
};

function Bloco({ texto }: { texto: string }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
      {texto ? (texto.length > 4000 ? `${texto.slice(0, 4000)}\n… (cortado)` : texto) : "(vazio)"}
    </pre>
  );
}

function Passos({ passos }: { passos: Passo[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Os {passos.length} passos, como no n8n</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {passos.map((p, i) => (
          <li key={i}>
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 truncate text-foreground">{p.no}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{formatarDuracao(p.ms)}</span>
              </summary>
              <div className="px-2.5 pb-2">
                <Bloco texto={legivel(p.saida)} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Consultas({ fase }: { fase: Fase }) {
  return (
    <ul className="flex flex-col gap-1">
      {fase.ferramentas.map((f, i) => (
        <li key={i}>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-0.5 text-[13px] hover:text-foreground [&::-webkit-details-marker]:hidden">
              <Wrench aria-hidden className={`size-3.5 shrink-0 ${f.erro ? "text-danger" : "text-muted-foreground"}`} />
              <span className={`min-w-0 flex-1 ${f.erro ? "text-danger" : "text-foreground"}`}>
                {f.titulo}
                {f.erro ? " (deu erro)" : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatarDuracao(f.ms)}</span>
            </summary>
            <div className="mt-1.5 mb-2 grid gap-1.5 pl-5">
              <span className="text-xs text-muted-foreground">Pediu</span>
              <Bloco texto={legivel(f.entrada)} />
              <span className="text-xs text-muted-foreground">Recebeu</span>
              <Bloco texto={f.erro ? f.erro : legivel(f.saida)} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Etapa({ fase, titulo, outros }: { fase: Fase; titulo?: string; outros?: string[] }) {
  const usada = fase.estado !== "nao_usado";
  const alerta = fase.estado === "erro" ? "text-danger" : fase.estado === "parou" ? "text-warning" : "";
  const temDetalhe = fase.ferramentas.length > 0 || fase.passos.length > 0;
  const cabeca = (
    <>
      <div className="flex items-baseline gap-2">
        <span className={`text-sm ${usada ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {titulo ?? fase.titulo}
        </span>
        {fase.explica ? <Dica texto={fase.explica} /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          {usada && fase.ms > 0 ? formatarDuracao(fase.ms) : usada ? "" : "não usada"}
          {temDetalhe ? (
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-150 group-open/abre:rotate-90"
            />
          ) : null}
        </span>
      </div>
      {fase.linhas.length || fase.ferramentas.length ? (
        <ul className="mt-1 flex flex-col gap-0.5 text-[13px] leading-snug text-muted-foreground">
          {fase.linhas.map((l, i) => (
            <li className={/^(Erro|Parou aqui|Trava agiu|Chamou a equipe)/.test(l) ? alerta || "text-warning" : ""} key={i}>
              {l}
            </li>
          ))}
          {fase.ferramentas.map((f, i) => (
            <li className={`flex items-center gap-1.5 ${f.erro ? "text-danger" : ""}`} key={`f${i}`}>
              <Wrench aria-hidden className="size-3 shrink-0" />
              {f.titulo}
              {f.erro ? " (deu erro)" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {outros?.length ? <p className="mt-1 text-xs text-muted-foreground">Não usados: {outros.join(", ")}</p> : null}
    </>
  );
  return (
    <li className="group/etapa relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute top-4 bottom-0 left-[9px] w-0.5 rounded-full bg-border-strong group-last/etapa:hidden" />
      <span aria-hidden className={`relative mt-1 size-[11px] justify-self-center rounded-full border-2 ${PONTO[fase.estado]}`} />
      {temDetalhe ? (
        <details className="group/abre min-w-0">
          <summary className="-mx-2 cursor-pointer list-none rounded-lg px-2 py-0.5 transition-colors duration-150 hover:bg-muted [&::-webkit-details-marker]:hidden">
            {cabeca}
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {fase.ferramentas.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">O que ela consultou</p>
                <Consultas fase={fase} />
              </div>
            ) : null}
            {fase.passos.length ? <Passos passos={fase.passos} /> : null}
          </div>
        </details>
      ) : (
        <div className="min-w-0 py-0.5">{cabeca}</div>
      )}
    </li>
  );
}

export function Fluxo({ linhas }: { linhas: LinhaFluxo[] }) {
  return (
    <ol className="flex flex-col">
      {linhas.map((l, i) => {
        if (l.tipo === "fase") return <Etapa fase={l.fase} key={i} />;
        // O ramo é uma etapa só: o caminho escolhido, e os outros numa linha discreta.
        const escolhido = l.fases.find((f) => f.estado !== "nao_usado");
        const outros = l.fases.filter((f) => f !== escolhido).map((f) => f.titulo);
        const base: Fase = escolhido ?? { ...l.fases[0], titulo: l.titulo, explica: "", linhas: [] };
        return (
          <Etapa
            fase={base}
            key={i}
            outros={outros}
            titulo={escolhido ? `Caminho: ${escolhido.titulo}` : "Caminho"}
          />
        );
      })}
    </ol>
  );
}

const ICONE: Record<TipoAcaoVisivel, LucideIcon> = {
  mensagem: MessageSquare,
  aviso: BellRing,
  agenda: CalendarPlus,
  arquivo: Paperclip,
  followup: Clock,
  cancelou: CircleSlash,
  registo: FileText,
};

export function OQueFez({ acoes }: { acoes: AcaoVisivel[] }) {
  if (!acoes.length) return <p className="text-sm text-muted-foreground">Nenhuma ação.</p>;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {acoes.map((a, i) => {
        const Icone = ICONE[a.icone];
        return (
          <li className="flex items-start gap-2.5" key={i}>
            <Icone aria-hidden className={`mt-0.5 size-4 shrink-0 ${a.recusada ? "text-danger" : "text-muted-foreground"}`} />
            <span className={a.recusada ? "text-danger" : "text-foreground"}>
              {a.texto}
              {a.recusada ? ` (não feito: ${a.recusada})` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

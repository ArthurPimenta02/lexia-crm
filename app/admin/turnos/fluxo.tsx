import { formatarDuracao, legivel, type Passo } from "@/lib/turnos/formatar";
import type { AcaoVisivel, EstadoFase, Fase, LinhaFluxo } from "@/lib/turnos/mapa";

/**
 * O desenho de um turno, de cima para baixo: cada caixa é uma etapa do
 * agente. Acesa = correu; tracejada = existe mas não foi usada neste turno;
 * amarela = parou ali; vermelha = deu erro ali. Dentro de cada caixa estão os
 * passos (os mesmos nós do n8n) com o que cada um devolveu.
 */

const PONTO: Record<EstadoFase, string> = {
  feito: "bg-positive",
  parou: "bg-warning",
  erro: "bg-danger",
  nao_usado: "bg-border-strong",
};

const MOLDURA: Record<EstadoFase, string> = {
  feito: "border-border bg-surface",
  parou: "border-warning bg-surface",
  erro: "border-danger bg-surface",
  nao_usado: "border-dashed border-border bg-surface-muted opacity-60",
};

function Ligacao() {
  return <div aria-hidden className="mx-auto h-4 w-px bg-border-strong" />;
}

function Bloco({ texto }: { texto: string }) {
  return (
    <pre className="mb-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 font-mono text-[11px] text-foreground">
      {texto ? (texto.length > 4000 ? `${texto.slice(0, 4000)}\n… (cortado)` : texto) : "(vazio)"}
    </pre>
  );
}

function SaidaDoPasso({ p }: { p: Passo }) {
  return (
    <details className="border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-xs">
        <span className="min-w-0 truncate">{p.no}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">{formatarDuracao(p.ms)}</span>
      </summary>
      <Bloco texto={legivel(p.saida)} />
    </details>
  );
}

function CaixaFase({ fase, compacta = false }: { fase: Fase; compacta?: boolean }) {
  const usada = fase.estado !== "nao_usado";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${MOLDURA[fase.estado]}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${PONTO[fase.estado]}`} />
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{fase.titulo}</span>
        {usada && fase.ms > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatarDuracao(fase.ms)}</span>
        ) : null}
      </div>
      {!compacta && fase.explica ? (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{fase.explica}</p>
      ) : null}
      {fase.linhas.length ? (
        <ul className="mt-2 flex flex-col gap-1 text-[13px] leading-snug text-foreground">
          {fase.linhas.map((l, i) => (
            <li
              className={
                /^(Erro|Parou aqui|Trava agiu|Chamou a equipe)/.test(l)
                  ? fase.estado === "erro" || l.startsWith("Erro")
                    ? "text-danger"
                    : "text-warning"
                  : ""
              }
              key={i}
            >
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      {fase.ferramentas.length ? (
        <div className="mt-2 flex flex-col gap-1">
          {fase.ferramentas.map((f, i) => (
            <details className="rounded-lg border border-border px-2 py-1" key={i}>
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-[13px]">
                <span className={f.erro ? "text-danger" : "text-foreground"}>
                  🔧 {f.titulo}
                  {f.erro ? " (deu erro)" : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatarDuracao(f.ms)}</span>
              </summary>
              <p className="mt-1.5 text-xs text-muted-foreground">Pediu</p>
              <Bloco texto={legivel(f.entrada)} />
              <p className="text-xs text-muted-foreground">Recebeu</p>
              <Bloco texto={f.erro ? f.erro : legivel(f.saida)} />
            </details>
          ))}
        </div>
      ) : null}
      {fase.passos.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Ver os {fase.passos.length} passos (como no n8n)
          </summary>
          <div className="mt-1 rounded-lg border border-border px-2">
            {fase.passos.map((p, i) => (
              <SaidaDoPasso key={i} p={p} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function Fluxo({ linhas }: { linhas: LinhaFluxo[] }) {
  return (
    <div className="flex flex-col">
      {linhas.map((l, i) => (
        <div key={i}>
          {i > 0 ? <Ligacao /> : null}
          {l.tipo === "fase" ? (
            <CaixaFase fase={l.fase} />
          ) : (
            <div className="rounded-xl border border-border bg-muted/40 p-2">
              <p className="px-1 pb-1.5 text-xs text-muted-foreground">{l.titulo}</p>
              <div className="flex flex-col gap-2">
                {l.fases
                  .filter((f) => f.estado !== "nao_usado")
                  .map((f) => (
                    <CaixaFase fase={f} key={f.id} />
                  ))}
                <div className="flex flex-wrap gap-2">
                  {l.fases
                    .filter((f) => f.estado === "nao_usado")
                    .map((f) => (
                      <span
                        className="rounded-lg border border-dashed border-border-strong px-2.5 py-1 text-xs text-muted-foreground"
                        key={f.id}
                        title={f.explica}
                      >
                        {f.titulo} · não usado
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Legenda() {
  const itens: [EstadoFase, string][] = [
    ["feito", "correu"],
    ["nao_usado", "não usada"],
    ["parou", "parou aqui"],
    ["erro", "erro"],
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {itens.map(([e, t]) => (
        <span className="flex items-center gap-1.5" key={e}>
          <span aria-hidden className={`size-2 rounded-full ${PONTO[e]}`} />
          {t}
        </span>
      ))}
    </div>
  );
}

export function OQueFez({ acoes, sombra }: { acoes: AcaoVisivel[]; sombra: boolean }) {
  if (!acoes.length) return <p className="text-sm text-muted-foreground">Nenhuma ação neste turno.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {acoes.map((a, i) => (
        <li className="flex gap-2" key={i}>
          <span aria-hidden>{a.icone}</span>
          <span className={a.recusada ? "text-danger" : ""}>
            {a.texto}
            {a.recusada ? ` (não feito: ${a.recusada})` : ""}
          </span>
        </li>
      ))}
      {sombra ? (
        <li className="pt-1 text-xs text-muted-foreground">
          Modo sombra: nada disto foi feito de verdade, quem respondeu ao cliente foi o n8n.
        </li>
      ) : null}
    </ul>
  );
}

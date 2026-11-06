import type { ReactNode } from "react";

import { AlertTriangle, Check, ChevronDown } from "lucide-react";

/**
 * Uma execução de teste na lista (cliente e admin usam a mesma linha).
 * Fechada mostra a mensagem, o começo da resposta e o estado; aberta mostra
 * o texto inteiro, o erro e os identificadores. Os textos chegam traduzidos.
 */
export type ExecucaoNaLista = {
  data: string;
  erro: string | null;
  extra?: ReactNode;
  id: string;
  ids: { rotulo: string; valor: string }[];
  mensagem: string;
  resposta: string;
  selos: string[];
};

export function ListaExecucoes({
  itens,
  rotulos,
}: {
  itens: ExecucaoNaLista[];
  rotulos: {
    erro: string;
    mensagem: string;
    resposta: string;
    sucesso: string;
  };
}) {
  return (
    <div className="tela-lista p-2">
      {itens.map((item) => {
        const comErro = Boolean(item.erro);
        return (
          <details className="group" key={item.id}>
            <summary className="tela-linha cursor-pointer list-none items-start [&::-webkit-details-marker]:hidden">
              <span
                className="ds-chip-icone mt-0.5"
                style={{
                  ["--chip" as string]: comErro
                    ? "var(--ds-perigo)"
                    : "var(--ds-acao)",
                }}
              >
                {comErro ? (
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {item.mensagem}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-5 text-muted-foreground group-open:hidden">
                  {comErro ? item.erro : item.resposta}
                </span>
                {item.selos.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.selos.map((selo, i) => (
                      <span
                        className="ds-selo ds-selo-neutro max-w-full"
                        key={`${selo}-${i}`}
                      >
                        <span className="truncate">{selo}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`ds-selo ds-selo-ponto ${comErro ? "ds-selo-perigo" : "ds-selo-verde"}`}
                >
                  {comErro ? rotulos.erro : rotulos.sucesso}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  {item.data}
                  <ChevronDown
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                  />
                </span>
              </span>
            </summary>

            <div className="flex flex-col gap-3 pr-3 pb-4 pl-3 text-sm sm:pl-[3.25rem]">
              <div>
                <p className="ds-sobretitulo">{rotulos.mensagem}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                  {item.mensagem}
                </p>
              </div>
              <div>
                <p className="ds-sobretitulo">{rotulos.resposta}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                  {item.resposta}
                </p>
              </div>
              {item.erro ? (
                <div className="tela-aviso tela-aviso-perigo whitespace-pre-wrap break-words">
                  {item.erro}
                </div>
              ) : null}
              {item.ids.length > 0 ? (
                <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
                  {item.ids.map((linha) => (
                    <p
                      className="truncate"
                      key={linha.rotulo}
                      title={linha.valor}
                    >
                      {linha.rotulo}: {linha.valor}
                    </p>
                  ))}
                </div>
              ) : null}
              {item.extra ? <div>{item.extra}</div> : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

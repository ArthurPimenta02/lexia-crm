"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * A busca, o botão Filtros e o painel que ele abre por baixo (desenho A+,
 * 14/11/2026). O painel fica dentro da coluna, a empurrar a lista para baixo:
 * por cima seria cortado, porque a coluna da lista corta o que transborda.
 * O conteúdo vem já desenhado do servidor; aqui só se guarda aberto/fechado.
 */
export function BotaoFiltros({
  busca,
  ligados,
  painel,
  rotulo,
  titulo,
}: {
  busca: ReactNode;
  ligados: number;
  painel: ReactNode;
  rotulo: string;
  titulo: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">{busca}</div>
        <button
          aria-controls="painel-filtros-conversas"
          aria-expanded={aberto}
          aria-label={rotulo}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            aberto ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-border"
          }`}
          onClick={() => setAberto((a) => !a)}
          title={titulo}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          {ligados > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums ring-2 ring-surface">
              {ligados}
            </span>
          ) : null}
        </button>
      </div>
      <div className="mt-3" hidden={!aberto} id="painel-filtros-conversas">
        {painel}
      </div>
    </div>
  );
}

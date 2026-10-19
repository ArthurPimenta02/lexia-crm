"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { construirCsv, nomeDoFicheiro, type Coluna } from "@/lib/exportar/csv";

/**
 * O botão que descarrega a lista que está no ecrã.
 *
 * Exporta **o que está à vista**, filtros incluídos, e não a tabela inteira.
 * É a escolha que não surpreende ninguém: quem filtrou os clientes de um canal
 * e carregou em exportar quer esses, e se o ficheiro trouxesse os 939 ia
 * procurar o defeito. O rodapé do ecrã diz quantas linhas vão sair, por isso a
 * conta está sempre à vista antes de carregar.
 *
 * As linhas chegam por propriedade porque o painel já as tem no navegador —
 * não há leitura nova nem rota nova. Em consequência, ninguém consegue
 * exportar dados que não estivesse já autorizado a ver.
 */
export function BotaoExportar<T>({
  assunto,
  colunas,
  linhas,
  rotulo = "Exportar",
}: {
  /** Entra no nome do ficheiro: `clientes-2026-10-19.csv`. */
  assunto: string;
  colunas: Coluna<T>[];
  linhas: T[];
  rotulo?: string;
}) {
  const [aExportar, setAExportar] = useState(false);

  function exportar() {
    setAExportar(true);

    try {
      const csv = construirCsv(linhas, colunas);
      // O `text/csv` com o charset declarado, para o caso de o ficheiro ser
      // aberto por algo que respeite o cabeçalho em vez do BOM.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const ligacao = document.createElement("a");

      ligacao.download = nomeDoFicheiro(assunto);
      ligacao.href = url;
      ligacao.click();

      // Sem isto o blob fica em memória até a página fechar. Numa sessão em
      // que se exporta várias listas seguidas, isso acumula.
      URL.revokeObjectURL(url);
    } finally {
      setAExportar(false);
    }
  }

  const vazio = linhas.length === 0;

  return (
    <button
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-muted-foreground transition hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      disabled={aExportar || vazio}
      onClick={exportar}
      title={
        vazio
          ? "Não há linhas para exportar."
          : `Descarregar ${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"} em CSV, para abrir no Excel.`
      }
      type="button"
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      {rotulo}
    </button>
  );
}

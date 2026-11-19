import "server-only";

import { procurarNasConversas } from "./buscar";
import type { DefinicaoLeitura } from "./comum";
import { analisarVariasConversas } from "./leitura-em-massa";
import { relatorioDoPeriodo } from "./relatorio";

/**
 * As três ferramentas de leitura do Analista (parte 4 da melhoria de 19/11).
 * Registo: ver `leitura.LEIA.md` (uma linha em `ferramentas.ts`).
 */
export const FERRAMENTAS_LEITURA: Record<string, DefinicaoLeitura> = {
  procurar_nas_conversas: procurarNasConversas,
  analisar_varias_conversas: analisarVariasConversas,
  relatorio_do_periodo: relatorioDoPeriodo,
};

export { usarNumerosDoNegocio } from "./relatorio";

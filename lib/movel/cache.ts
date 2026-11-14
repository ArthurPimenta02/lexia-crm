import "server-only";

import { unstable_cache } from "next/cache";

import { listarConversas } from "./conversas";
import { dadosHoje } from "./hoje";
import { dadosMais } from "./mais";
import { dadosResultados, type Intervalo } from "./resultados";

/**
 * Cópias curtas dos dados mais pesados do app, para as telas abrirem logo.
 * A chave leva sempre a empresa (`clienteSlug`): nunca se serve a uma empresa
 * o que foi lido para outra. Os tempos são curtos de propósito — o dono quer
 * ver o que acabou de acontecer.
 */
export const hojeRapido = unstable_cache(
  async (clienteSlug: string, fuso: string) => dadosHoje(clienteSlug, fuso, new Date()),
  ["m-hoje-v2"],
  { revalidate: 20 },
);

export const resultadosRapido = unstable_cache(
  async (clienteSlug: string, fuso: string, intervalo: Intervalo) => dadosResultados(clienteSlug, fuso, intervalo, new Date()),
  ["m-resultados-v2"],
  { revalidate: 60 },
);

export const maisRapido = unstable_cache(
  async (clienteSlug: string, fuso: string) => dadosMais(clienteSlug, fuso, new Date()),
  ["m-mais-v2"],
  { revalidate: 60 },
);

// A lista de conversas: 10 s (o chat em si atualiza-se sozinho a cada 3 s).
export const conversasRapido = unstable_cache(
  async (clienteSlug: string) => listarConversas(clienteSlug, new Date()),
  ["m-conversas-v2"],
  { revalidate: 10 },
);

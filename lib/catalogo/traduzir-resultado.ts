import "server-only";

import { getT } from "@/lib/i18n/servidor";

import type { TextoDaMensagem } from "./mensagem";

/**
 * Traduz a mensagem de uma escrita do catálogo para o idioma de quem a fez.
 * Usa a chave com variáveis quando a há; senão a mensagem é a própria chave.
 */
export async function traduzirResultado<
  R extends { mensagem: string; texto?: TextoDaMensagem },
>(resultado: R): Promise<R> {
  const t = await getT();

  return {
    ...resultado,
    mensagem: resultado.texto
      ? t(resultado.texto.chave, resultado.texto.variaveis)
      : t(resultado.mensagem),
  };
}

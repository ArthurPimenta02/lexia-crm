import { preencher, type Variaveis } from "@/lib/i18n/traduzir";

/**
 * Mensagens das escritas do catálogo (serviços, produtos, campanhas) com
 * variáveis dentro.
 *
 * As funções de `lib/` não sabem o idioma de quem está a ver (correm também
 * nos testes, sem cookies). Por isso devolvem a mensagem já preenchida em
 * pt-BR — que é o que os testes leem — e, ao lado, a chave e as variáveis,
 * para a server action a traduzir antes de chegar ao ecrã
 * (`lib/catalogo/traduzir-resultado.ts`). As mensagens sem variáveis não
 * precisam disto: a própria mensagem é a chave.
 */
export type TextoDaMensagem = { chave: string; variaveis?: Variaveis };

export function mensagemCom(chave: string, variaveis: Variaveis) {
  return {
    mensagem: preencher(chave, variaveis),
    texto: { chave, variaveis } satisfies TextoDaMensagem,
  };
}

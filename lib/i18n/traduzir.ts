import type { Idioma } from "./idiomas";

/** Um dicionário: texto-fonte em pt-BR → texto no idioma. */
export type Dicionario = Record<string, string>;

/** O que cada ficheiro de `textos/` exporta. */
export type TextosDaArea = Record<Exclude<Idioma, "pt-BR">, Dicionario>;

export type Variaveis = Record<string, string | number>;

export type FuncaoT = (texto: string, variaveis?: Variaveis) => string;

/**
 * `{nome}` no texto é trocado pela variável com esse nome. As variáveis têm
 * de ter o mesmo nome em todos os idiomas — o teste confere.
 */
export function preencher(texto: string, variaveis?: Variaveis) {
  if (!variaveis) return texto;
  return texto.replace(/\{(\w+)\}/g, (inteiro, nome: string) =>
    nome in variaveis ? String(variaveis[nome]) : inteiro,
  );
}

export function criarT(dicionario: Dicionario | null): FuncaoT {
  return (texto, variaveis) => preencher(dicionario?.[texto] ?? texto, variaveis);
}

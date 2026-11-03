import type { Idioma } from "./idiomas";
import type { Dicionario, TextosDaArea } from "./traduzir";

import moldura from "./textos/moldura";

/**
 * Cada área do painel tem o seu ficheiro em `textos/`. Estão separados para
 * que duas pessoas possam traduzir áreas diferentes sem pisar o mesmo
 * ficheiro. Uma área nova entra nesta lista.
 */
const AREAS: TextosDaArea[] = [moldura];

function juntar(idioma: Exclude<Idioma, "pt-BR">): Dicionario {
  return Object.assign({}, ...AREAS.map((area) => area[idioma]));
}

const DICIONARIOS: Record<Exclude<Idioma, "pt-BR">, Dicionario> = {
  "pt-PT": juntar("pt-PT"),
  es: juntar("es"),
  en: juntar("en"),
};

/** pt-BR não tem dicionário: o texto-fonte já é pt-BR. */
export function dicionarioDe(idioma: Idioma): Dicionario | null {
  return idioma === "pt-BR" ? null : DICIONARIOS[idioma];
}

export { AREAS };

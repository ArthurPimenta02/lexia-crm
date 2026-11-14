import type { Idioma } from "./idiomas";
import type { Dicionario, TextosDaArea } from "./traduzir";

import moldura from "./textos/moldura";
import dashboard from "./textos/dashboard";
import conversas from "./textos/conversas";
import agenda from "./textos/agenda";
import clientes from "./textos/clientes";
import catalogo from "./textos/catalogo";
import gestao from "./textos/gestao";
import operacao from "./textos/operacao";
import movel from "./textos/movel";
import movelTestes from "./textos/movel-testes";
import movelV5 from "./textos/movel-v5";
import conversasEnvio from "./textos/conversas-envio";
import ajudante from "./textos/ajudante";
import conectar from "./textos/conectar";
import admin from "./textos/admin";

/**
 * Cada área do painel tem o seu ficheiro em `textos/`. Estão separados para
 * que duas pessoas possam traduzir áreas diferentes sem pisar o mesmo
 * ficheiro. Uma área nova entra nesta lista.
 */
const AREAS: TextosDaArea[] = [
  moldura,
  dashboard,
  conversas,
  agenda,
  clientes,
  catalogo,
  gestao,
  operacao,
  movel,
  movelTestes,
  movelV5,
  conversasEnvio,
  ajudante,
  conectar,
  admin,
];

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

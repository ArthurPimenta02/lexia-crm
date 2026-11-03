import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { COOKIE_IDIOMA, eIdioma, idiomaDoNavegador, type Idioma } from "./idiomas";
import { dicionarioDe } from "./dicionarios";
import { criarT, type FuncaoT } from "./traduzir";

/** O idioma de quem está a ver: a escolha guardada, senão o do navegador. */
export const getIdioma = cache(async (): Promise<Idioma> => {
  const escolhido = (await cookies()).get(COOKIE_IDIOMA)?.value;
  if (eIdioma(escolhido)) return escolhido;
  return idiomaDoNavegador((await headers()).get("accept-language"));
});

/** Para componentes de servidor: `const t = await getT();` */
export async function getT(): Promise<FuncaoT> {
  return criarT(dicionarioDe(await getIdioma()));
}

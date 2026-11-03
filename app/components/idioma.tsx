"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { IDIOMA_PADRAO, LOCALE_DO_IDIOMA, type Idioma } from "@/lib/i18n/idiomas";
import { criarT, type Dicionario, type FuncaoT } from "@/lib/i18n/traduzir";

type ContextoIdioma = { idioma: Idioma; locale: string; t: FuncaoT };

const Contexto = createContext<ContextoIdioma>({
  idioma: IDIOMA_PADRAO,
  locale: LOCALE_DO_IDIOMA[IDIOMA_PADRAO],
  t: criarT(null),
});

/**
 * Leva o idioma aos componentes de cliente. Recebe só o dicionário do idioma
 * escolhido — os outros três não vão para o navegador.
 */
export function IdiomaProvider({
  children,
  dicionario,
  idioma,
}: {
  children: ReactNode;
  dicionario: Dicionario | null;
  idioma: Idioma;
}) {
  const valor = useMemo(
    () => ({ idioma, locale: LOCALE_DO_IDIOMA[idioma], t: criarT(dicionario) }),
    [dicionario, idioma],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Para componentes de cliente: `const { t } = useIdioma();` */
export function useIdioma() {
  return useContext(Contexto);
}

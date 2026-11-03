"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { IDIOMA_PADRAO, LOCALE_DO_IDIOMA, type Idioma } from "@/lib/i18n/idiomas";
import { criarT, type Dicionario, type FuncaoT } from "@/lib/i18n/traduzir";
import type { Tema } from "@/lib/tema";

type ContextoIdioma = { idioma: Idioma; locale: string; t: FuncaoT; tema: Tema };

const Contexto = createContext<ContextoIdioma>({
  idioma: IDIOMA_PADRAO,
  locale: LOCALE_DO_IDIOMA[IDIOMA_PADRAO],
  t: criarT(null),
  tema: "claro",
});

/**
 * Leva o idioma aos componentes de cliente. Recebe só o dicionário do idioma
 * escolhido — os outros três não vão para o navegador.
 */
export function IdiomaProvider({
  children,
  dicionario,
  idioma,
  tema,
}: {
  children: ReactNode;
  dicionario: Dicionario | null;
  idioma: Idioma;
  tema: Tema;
}) {
  const valor = useMemo(
    () => ({ idioma, locale: LOCALE_DO_IDIOMA[idioma], t: criarT(dicionario), tema }),
    [dicionario, idioma, tema],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Para componentes de cliente: `const { t } = useIdioma();` */
export function useIdioma() {
  return useContext(Contexto);
}

/**
 * Traduz um texto fixo em qualquer componente, de servidor ou de cliente:
 * `<Tr>Sem mensagens no período.</Tr>`. Serve para peças partilhadas que
 * não podem usar o hook. O teste de idiomas lê estas chaves também.
 */
export function Tr({ children }: { children: string }) {
  const { t } = useContext(Contexto);
  return <>{t(children.replace(/\s+/g, " ").trim())}</>;
}

/**
 * Os idiomas do painel.
 *
 * O texto-fonte do código é o português do Brasil: `t("Conversas")` devolve
 * "Conversas" em pt-BR sem precisar de dicionário, e os dicionários de
 * `textos/` dizem como fica nos outros três. Uma chave sem tradução cai no
 * texto-fonte, nunca numa chave crua no ecrã — e o teste `idiomas.test.mts`
 * falha antes disso chegar a produção.
 */
export const IDIOMAS = ["pt-BR", "pt-PT", "es", "en"] as const;

export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_PADRAO: Idioma = "pt-BR";

export const COOKIE_IDIOMA = "lexia_idioma";

export const NOME_DO_IDIOMA: Record<Idioma, string> = {
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  es: "Español",
  en: "English",
};

export const BANDEIRA_DO_IDIOMA: Record<Idioma, string> = {
  "pt-BR": "🇧🇷",
  "pt-PT": "🇵🇹",
  es: "🇪🇸",
  en: "🇺🇸",
};

/** O locale para datas e números (`Intl`, `toLocaleString`). */
export const LOCALE_DO_IDIOMA: Record<Idioma, string> = {
  "pt-BR": "pt-BR",
  "pt-PT": "pt-PT",
  es: "es-ES",
  en: "en-US",
};

export function eIdioma(valor: unknown): valor is Idioma {
  return typeof valor === "string" && (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * Primeira visita, sem escolha feita: só se decide entre os dois portugueses.
 *
 * Espanhol e inglês ficam por escolha no seletor. Os clientes que já usam o
 * painel liam-no em português; se o idioma seguisse o navegador, quem tem o
 * computador em inglês acordava um dia com o painel em inglês sem ter pedido.
 * Quem pede pt-PT recebe pt-PT; todo o resto começa em pt-BR.
 */
export function idiomaDoNavegador(acceptLanguage: string | null | undefined): Idioma {
  if (!acceptLanguage) return IDIOMA_PADRAO;
  const pedidos = acceptLanguage
    .split(",")
    .map((parte) => {
      const [tag, q] = parte.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q);

  const primeiroPortugues = pedidos.find((p) => p.tag.startsWith("pt"));
  return primeiroPortugues?.tag === "pt-pt" ? "pt-PT" : IDIOMA_PADRAO;
}

/**
 * O idioma do app do iPhone: o do próprio iPhone (Arthur, 05/11 — "o idioma tem
 * que ser o idioma do iPhone da pessoa"). Ao contrário do painel no
 * computador, aqui o inglês e o espanhol também valem sem escolha manual; um
 * iPhone noutro idioma qualquer cai no inglês.
 */
export function idiomaDoAparelho(acceptLanguage: string | null | undefined): Idioma {
  const tags = String(acceptLanguage ?? "")
    .split(",")
    .map((parte) => {
      const [tag, q] = parte.trim().split(";q=");
      return { q: q ? Number(q) : 1, tag: tag.toLowerCase() };
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag === "pt-pt" || tag.startsWith("pt-pt") || tag === "pt-ao" || tag === "pt-mz") return "pt-PT";
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("en")) return "en";
  }

  return tags.length ? "en" : IDIOMA_PADRAO;
}

import { readFileSync } from "node:fs";

/**
 * A "ficha técnica" do agente de cada cliente: como o agente daquele negócio
 * funciona (canais, agenda, lembretes, follow-ups, pausas, handoff…), escrita
 * para o DONO entender. Fonte: o código dos agentes em produção, lido a 19/11/2026.
 *
 * Um ficheiro .md por cliente, ao lado deste. Só os slugs desta lista têm
 * ficha; qualquer outro devolve null (nunca se lê um caminho vindo de fora).
 * Cada ficha fica abaixo de ~1.500 tokens (tests/ajudante-ficha.test.mts).
 */
export const SLUGS_COM_FICHA = ["miranda_skin_experts", "detail_by_cordeiro", "claudia_leite_spa", "asteric", "jessica_beauty"] as const;
export type SlugComFicha = (typeof SLUGS_COM_FICHA)[number];

// Uma leitura com caminho LITERAL por ficheiro: assim o bundler copia só estes
// .md para o pacote do servidor (um readFileSync com caminho variável faz a
// Vercel rastrear o projeto inteiro).
const LER: Record<SlugComFicha, () => string> = {
  asteric: () => readFileSync(new URL("./asteric.md", import.meta.url), "utf8"),
  claudia_leite_spa: () => readFileSync(new URL("./claudia_leite_spa.md", import.meta.url), "utf8"),
  detail_by_cordeiro: () => readFileSync(new URL("./detail_by_cordeiro.md", import.meta.url), "utf8"),
  jessica_beauty: () => readFileSync(new URL("./jessica_beauty.md", import.meta.url), "utf8"),
  miranda_skin_experts: () => readFileSync(new URL("./miranda_skin_experts.md", import.meta.url), "utf8"),
};

const temFicha = (slug: string): slug is SlugComFicha => (SLUGS_COM_FICHA as readonly string[]).includes(slug);

const cache = new Map<SlugComFicha, string>();

/** A ficha do agente deste cliente, ou null se ele não tiver ficha. */
export function fichaDoAgente(slug: string): string | null {
  if (!temFicha(slug)) return null;
  const guardada = cache.get(slug);
  if (guardada !== undefined) return guardada;
  let texto: string | null = null;
  try {
    texto = LER[slug]().trim();
  } catch {
    texto = null;
  }
  if (!texto) return null;
  cache.set(slug, texto);
  return texto;
}

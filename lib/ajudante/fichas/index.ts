import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// URLs estáticas (uma por ficheiro) para o bundler copiar os .md com o código do servidor.
const FICHEIROS: Record<SlugComFicha, URL> = {
  asteric: new URL("./asteric.md", import.meta.url),
  claudia_leite_spa: new URL("./claudia_leite_spa.md", import.meta.url),
  detail_by_cordeiro: new URL("./detail_by_cordeiro.md", import.meta.url),
  jessica_beauty: new URL("./jessica_beauty.md", import.meta.url),
  miranda_skin_experts: new URL("./miranda_skin_experts.md", import.meta.url),
};

const temFicha = (slug: string): slug is SlugComFicha => (SLUGS_COM_FICHA as readonly string[]).includes(slug);

const cache = new Map<SlugComFicha, string>();

/** A ficha do agente deste cliente, ou null se ele não tiver ficha. */
export function fichaDoAgente(slug: string): string | null {
  if (!temFicha(slug)) return null;
  const guardada = cache.get(slug);
  if (guardada !== undefined) return guardada;
  let texto: string | null = null;
  for (const ler of [() => readFileSync(FICHEIROS[slug], "utf8"), () => readFileSync(join(process.cwd(), "lib/ajudante/fichas", `${slug}.md`), "utf8")]) {
    try {
      texto = ler().trim();
      break;
    } catch {
      // tenta o caminho seguinte
    }
  }
  if (!texto) return null;
  cache.set(slug, texto);
  return texto;
}

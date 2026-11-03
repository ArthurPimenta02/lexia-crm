/** O tema do painel. "sistema" segue o claro/escuro do computador. */
export const TEMAS = ["claro", "escuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];
export const TEMA_PADRAO: Tema = "claro";
export const COOKIE_TEMA = "lexia_tema";

export function eTema(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as readonly string[]).includes(valor);
}

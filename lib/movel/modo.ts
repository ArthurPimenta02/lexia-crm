/** Aparência do app: automático (segue o iPhone), claro ou escuro. Fica num cookie do aparelho. */
export const COOKIE_MODO_MOVEL = "lexia_m_modo";
export type ModoMovel = "auto" | "claro" | "escuro";

export function modoValido(v: unknown): ModoMovel {
  return v === "claro" || v === "escuro" ? v : "auto";
}

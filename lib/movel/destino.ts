/** Só destinos do app do iPhone (/m…) e a ligação do Instagram (/conectar); qualquer outro valor é ignorado. */
export function destinoSeguro(valor: unknown): string | null {
  return typeof valor === "string" && /^\/(m|conectar)(\/|\?|$)/.test(valor) && !valor.includes("//") && !valor.includes("\\") ? valor : null;
}

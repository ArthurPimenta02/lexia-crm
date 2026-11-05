/** Só destinos do app do iPhone (/m…); qualquer outro valor é ignorado. */
export function destinoSeguro(valor: unknown): string | null {
  return typeof valor === "string" && /^\/m(\/|\?|$)/.test(valor) && !valor.includes("//") && !valor.includes("\\") ? valor : null;
}

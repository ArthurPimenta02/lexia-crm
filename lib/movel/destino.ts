/**
 * Destinos aceites depois de entrar: o app do iPhone (/m…), a ligação do Instagram (/conectar) e o onboarding
 * (quem entra de novo com uma resposta guardada volta à conversa, onde ela é reenviada). Qualquer outro valor é ignorado.
 */
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.includes("//") || valor.includes("\\")) return null;
  if (/^\/(m|conectar)(\/|\?|$)/.test(valor)) return valor;
  if (/^\/app\/onboarding$/.test(valor) || /^\/admin\/clientes\/[A-Za-z0-9_-]+\/onboarding$/.test(valor)) return valor;
  return null;
}

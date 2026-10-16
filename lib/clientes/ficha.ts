/**
 * O que cabe na ficha de um cliente, e o que o dono pode dizer sobre ele.
 *
 * Duas coisas vivem aqui: a lista fechada de canais de aquisição e a decisão
 * de que campos é que cada cliente vê. Ambas são tabelas pequenas que, se
 * ficassem espalhadas pelo formulário e pela ficha, acabariam em duas versões
 * que discordam uma da outra — foi o que aconteceu com os fusos horários.
 */

/**
 * Por onde é que a pessoa chegou, na voz do dono.
 *
 * A lista é fechada de propósito: em texto livre, "Instagram", "instagram",
 * "IG" e "insta" contam como quatro canais e o campo deixa de servir para
 * somar. Quem precisa de dizer outra coisa escolhe `outro` e escreve ao lado.
 */
export const canaisDeAquisicao = [
  { label: "Google", value: "google" },
  { label: "Meta", value: "meta" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Indicação", value: "indicacao" },
  { label: "Orgânico", value: "organico" },
  { label: "Cliente antigo", value: "cliente_antigo" },
  { label: "Outro", value: "outro" },
] as const;

export type CanalDeAquisicao = (typeof canaisDeAquisicao)[number]["value"];

/** O canal que obriga a escrever uma explicação ao lado. */
export const canalQuePedeNota: CanalDeAquisicao = "outro";

export function isCanalDeAquisicao(valor: string): valor is CanalDeAquisicao {
  return canaisDeAquisicao.some((canal) => canal.value === valor);
}

export function getCanalLabel(valor: string | null) {
  if (!valor) {
    return null;
  }

  return canaisDeAquisicao.find((canal) => canal.value === valor)?.label ?? valor;
}

/**
 * Os valores que o Omnichannel grava em `origem_tipo` a partir do referral da
 * Meta. Não são os mesmos que os de cima e não devem ser: estes foram medidos,
 * aqueles foram lembrados. Medido na base a 2026-10-16 — ctwa, instagram_ad,
 * instagram_post e organico são os quatro que existem.
 */
const origensCapturadas: Record<string, string> = {
  ctwa: "Anúncio para WhatsApp",
  instagram_ad: "Anúncio no Instagram",
  instagram_post: "Publicação no Instagram",
  organico: "Orgânico",
};

export function getOrigemCapturadaLabel(valor: string | null) {
  if (!valor) {
    return null;
  }

  return origensCapturadas[valor] ?? valor;
}

/**
 * Que campos é que este cliente vê.
 *
 * O "carro" existe para o Detail e não existe para a Miranda, que é uma
 * clínica de pele. Um campo vazio que ninguém preenche não é inofensivo: faz o
 * formulário parecer que falta lá qualquer coisa.
 */
const camposPorCliente: Record<string, { viatura: boolean }> = {
  detail_by_cordeiro: { viatura: true },
};

export function mostraViatura(clienteSlug: string) {
  return camposPorCliente[clienteSlug]?.viatura ?? false;
}

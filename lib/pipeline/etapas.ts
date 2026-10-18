/**
 * As etapas do pipeline — só as regras, sem base de dados.
 *
 * Vive à parte da leitura por duas razões. A primeira é a mesma do
 * `lib/clientes/telefone.ts`: importar a leitura num componente de cliente
 * arrastava a chave de serviço da Supabase para o pacote do navegador. A
 * segunda é que estas regras são o coração do painel e têm de poder ser
 * testadas sem levantar uma base de dados atrás.
 *
 * A regra que não se quebra: a ETAPA é derivada de factos — quem falou por
 * último, há quanto tempo, e se existe uma marcação ligada. O que a IA achou
 * da conversa é uma ETIQUETA separada, que viaja ao lado do cartão e nunca
 * decide a coluna. Misturar as duas coisas faria um lead mudar de coluna
 * porque um modelo mudou de ideias, e ninguém conseguiria explicar porquê.
 */

/** As colunas, pela ordem em que aparecem no painel. */
export const ETAPAS = [
  "por_responder",
  "agendado",
  "a_decorrer",
  "cliente",
  "a_arrefecer",
  "perdido",
] as const;

export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_ROTULO: Record<Etapa, string> = {
  a_arrefecer: "A arrefecer",
  a_decorrer: "A decorrer",
  agendado: "Agendado",
  cliente: "Cliente",
  perdido: "Perdido",
  por_responder: "Por responder",
};

export const ETAPA_DESCRICAO: Record<Etapa, string> = {
  a_arrefecer:
    "Sem falar há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.",
  a_decorrer: "A conversa está viva e a bola está do nosso lado.",
  agendado: "Tem uma marcação por acontecer.",
  cliente: "Já foi atendido. Aqui ganha-se a repetição.",
  perdido: "Um mês sem dizer nada. Fica fora da vista até alguém o procurar.",
  por_responder: "Escreveram e ainda ninguém respondeu.",
};

/**
 * Os limites, em dias, entre conversa viva, a arrefecer e perdida.
 *
 * Medido a 2026-10-18 nos dois clientes. Com 7 e 30 dias o Detail fica com
 * 232 cartões à vista e a Miranda com 248 — um painel que uma pessoa
 * consegue olhar. Alargar para 14 e 60 passava o Detail para mais de 400 e a
 * coluna "A arrefecer" deixava de significar "ainda dá para recuperar".
 */
export const DIAS_ACTIVO = 7;
export const DIAS_ARREFECER = 30;

/** Um dia em milissegundos. */
const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Quantos dias passaram, contados em dias de calendário e não em blocos de
 * 24 horas. Uma mensagem das 23h de ontem tem um dia, não zero.
 */
export function diasDesde(quando: Date, agora: Date) {
  const inicioDe = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  return Math.max(0, Math.round((inicioDe(agora) - inicioDe(quando)) / UM_DIA));
}

/**
 * A chave que liga um contacto a uma marcação: os últimos 9 dígitos.
 *
 * Não é o número inteiro de propósito. As duas pontas escrevem o mesmo
 * número de maneiras diferentes e a comparação exacta perde gente a sério.
 * Medido a 2026-10-18: no Detail, 15 das 18 marcações com telefone casavam
 * exactamente e 17 casam pelos últimos 9 — as que faltavam estavam escritas
 * à mão sem o 351. Na Miranda a diferença é o dobro, de 8 para 16 em 43,
 * porque os números americanos aparecem ora com o 1 à frente ora sem.
 *
 * O risco de juntar duas pessoas diferentes foi medido e é residual: 5
 * colisões em 975 contactos do Detail e nenhuma na Miranda, e as 5 são o
 * mesmo número escrito de duas maneiras (`558189603080` e `55818960-3080`),
 * ou seja a mesma pessoa.
 *
 * Devolve `null` quando não há dígitos que cheguem. Isso é o caso normal e
 * não um erro: nos canais da Meta a coluna `telefone` do contacto leva o
 * PSID, não um número, e um PSID nunca pode casar com uma marcação.
 */
export function chaveTelefone(digitos: string | null | undefined) {
  const texto = (digitos ?? "").replace(/\D/g, "");

  return texto.length >= 9 ? texto.slice(-9) : null;
}

/** O que se sabe de um cartão antes de lhe dar uma coluna. */
export type FactosDoCartao = {
  /** A marcação ligada mais próxima no futuro, se existir. */
  marcacaoFutura: Date | null;
  /** A marcação ligada mais recente já passada, se existir. */
  marcacaoPassada: Date | null;
  /** Quando foi a última mensagem, em qualquer direcção. */
  ultimaMensagemEm: Date | null;
  /** `true` se a última mensagem foi do contacto e ainda não houve resposta. */
  ultimaFoiRecebida: boolean;
};

export type EtapaDerivada = {
  dias: number;
  etapa: Etapa;
  /** Em texto, porque é que este cartão caiu nesta coluna. */
  porque: string;
};

/**
 * Decide a coluna de um cartão.
 *
 * A ordem das perguntas é a ordem da urgência, e é isso que a torna útil:
 *
 * 1. "Por responder" ganha a tudo. Alguém escreveu e está à espera — isso é
 *    mais urgente do que qualquer outra coisa que se saiba do cartão, mesmo
 *    que já tenha marcação. Um cliente que pergunta na véspera se pode mudar
 *    a hora não pode ficar escondido na coluna "Agendado".
 * 2. "Agendado" vem a seguir porque é um compromisso com data.
 * 3. Só depois é que o tempo decide.
 *
 * `agora` entra por parâmetro e não se lê o relógio aqui dentro: sem isso o
 * resultado dependia do instante em que o teste corre.
 */
export function derivarEtapa(
  factos: FactosDoCartao,
  agora: Date,
): EtapaDerivada {
  const referencia = factos.ultimaMensagemEm;
  const dias = referencia ? diasDesde(referencia, agora) : Number.MAX_SAFE_INTEGER;

  if (factos.ultimaFoiRecebida && dias <= DIAS_ACTIVO) {
    return {
      dias,
      etapa: "por_responder",
      porque:
        dias === 0
          ? "Escreveu hoje e ainda não teve resposta."
          : `Escreveu há ${dias} ${dias === 1 ? "dia" : "dias"} e ainda não teve resposta.`,
    };
  }

  if (factos.marcacaoFutura) {
    return { dias, etapa: "agendado", porque: "Tem uma marcação por acontecer." };
  }

  if (dias <= DIAS_ACTIVO) {
    return { dias, etapa: "a_decorrer", porque: "A conversa está viva." };
  }

  // Esta pergunta vem DEPOIS do tempo de propósito. Quem já foi atendido mas
  // voltou a escrever esta semana aparece em "A decorrer", que é onde há
  // alguma coisa para fazer; "Cliente" é para quem foi atendido e está
  // sossegado.
  if (factos.marcacaoPassada) {
    return { dias, etapa: "cliente", porque: "Já foi atendido." };
  }

  if (dias <= DIAS_ARREFECER) {
    return {
      dias,
      etapa: "a_arrefecer",
      porque: `Sem falar há ${dias} dias.`,
    };
  }

  return {
    dias,
    etapa: "perdido",
    porque: referencia
      ? `Sem falar há ${dias} dias.`
      : "Nunca trocou mensagens.",
  };
}

/**
 * As etiquetas da IA que vale a pena mostrar no cartão.
 *
 * Só entram os valores de vocabulário fechado da `lexia_conversation_insights`.
 * A coluna `intencao` fica de fora: medida a 2026-10-18 nas 920 análises do
 * Detail, tem texto livre com dezenas de variantes para a mesma coisa
 * ("obter_informacao" e "obter_informacoes" lado a lado), e uma etiqueta que
 * se escreve de duas maneiras não serve para filtrar nada.
 */
export const RESULTADO_ROTULO: Record<string, string> = {
  agendamento_mencionado: "Falou em marcar",
  desconhecido: "Por apurar",
  handoff: "Passou para a equipa",
  interessado: "Interessado",
  perdido: "Perdido",
  pos_venda: "Pós-venda",
  sem_desfecho: "Sem desfecho",
};

export function rotularResultado(resultado: string | null | undefined) {
  if (!resultado) {
    return null;
  }

  return RESULTADO_ROTULO[resultado] ?? null;
}

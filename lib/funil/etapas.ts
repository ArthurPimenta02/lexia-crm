/**
 * O funil dos agentes (18/11/2026): as mesmas seis etapas para todos os
 * clientes, medidas por conversa e agrupadas pela semana da 1.ª mensagem.
 *
 * Tudo aqui é puro (sem base de dados), para os testes poderem guardar as
 * regras. Quem lê a base é `lib/funil/read.ts`.
 *
 * Porque é que três etapas se medem no TEXTO das mensagens: nenhum agente
 * grava hoje um evento "disse o preço", "ofereceu horários" ou "pediu
 * confirmação". O que existe para todos é o que o agente escreveu, em
 * `lexia_mensagens`. Por isso a regra é deliberadamente estreita: um valor em
 * dinheiro com símbolo ou moeda, uma hora escrita como hora, uma pergunta de
 * confirmação com dia ou hora dentro. Prefere-se contar a menos a contar a
 * mais, e o ecrã diz em cada etapa como se mediu.
 */

import { chaveTelefone } from "@/lib/pipeline/etapas";

export const ETAPAS = ["conversa", "preco", "horarios", "resumo", "marcada", "compareceu"] as const;
export type EtapaFunil = (typeof ETAPAS)[number];

/**
 * Origens de mensagens enviadas que não contam como o agente a atender: a
 * equipe (humano, painel) e o lembrete de uma marcação que já existe (pede
 * "confirme a sua presença" e não é resposta a ninguém).
 */
const ORIGENS_FORA = new Set(["humano", "painel_cliente", "lembrete_agente"]);

export function enviadaPeloAgente(m: { direccao: string | null; origem: string | null }) {
  return m.direccao === "enviada" && !ORIGENS_FORA.has(m.origem ?? "");
}

/**
 * Um valor em dinheiro: símbolo de moeda colado a um número (US$ 40, R$ 150,
 * €60, $40) ou número seguido da moeda (60€, 60 euros, 40 dólares, 40 USD).
 * Um número solto ("3 sessões", "45 minutos") não conta.
 */
const PRECO =
  /(?:R\$|US\$|U\$|\$|€|£)\s?\d|\d(?:[\d.,]*\d)?\s?(?:€|euros?\b|reais\b|d[óo]lares\b|dollars?\b|usd\b|eur\b|brl\b)/i;

/**
 * Uma hora concreta: 15:30, 9h30, 14h, 7 PM, 6:30 pm.
 * "24h" (atendimento 24h) não conta.
 */
const HORA =
  /\b(?:[01]?\d|2[0-3])[:h][0-5]\d\b|\b(?:[01]?\d|2[0-3])h(?![a-z0-9])|\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s?[ap]\.?m\b\.?/i;

/** Um dia escrito: 20/11, 20-11. */
const DATA = /\b(?:[0-2]?\d|3[01])[/-](?:0?[1-9]|1[0-2])\b/;

/**
 * Uma pergunta de confirmação: "certo?", "Está tudo certo para eu
 * confirmar?", "Is that right?", "¿correcto?".
 */
const CONFIRMACAO =
  /(?:\bcerto|\bcorreto|\bconfirm\w*|\bcombinado|\bis that (?:right|correct|ok)|\bdoes that work|\b(?:look|sound)s? good|\bshall i (?:book|confirm)|\bcorrecto|\best[áa] bien|\bvale)[^?]{0,25}\?/i;

export function dissePreco(texto: string) {
  return PRECO.test(texto);
}

export function ofereceuHorario(texto: string) {
  return HORA.test(texto);
}

const temDiaOuHora = (texto: string) => HORA.test(texto) || DATA.test(texto);

/**
 * O resumo: uma pergunta de confirmação com o dia ou a hora dentro, ou logo a
 * seguir à mensagem do agente que os tinha (o agente às vezes manda o resumo
 * num balão e o "Confirmo?" no seguinte). `anterior` é a mensagem do agente
 * imediatamente antes.
 */
export function pediuConfirmacao(texto: string, anterior = "") {
  return CONFIRMACAO.test(texto) && (temDiaOuHora(texto) || temDiaOuHora(anterior));
}

/** O dia (AAAA-MM-DD) de um instante, no fuso do cliente. */
export function diaNoFuso(instante: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(instante);
}

function somarDias(dia: string, dias: number) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** A segunda-feira (AAAA-MM-DD) da semana de um instante, no fuso do cliente. */
export function segundaDaSemana(instante: Date, timeZone: string) {
  const dia = diaNoFuso(instante, timeZone);
  const [a, m, d] = dia.split("-").map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((semana + 6) % 7));
}

/** As segundas-feiras das últimas `n` semanas, a mais recente primeiro. */
export function ultimasSemanas(agora: Date, timeZone: string, n: number) {
  const atual = segundaDaSemana(agora, timeZone);
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * i));
}

export type MensagemFunil = {
  identificador_conversa: string;
  direccao: string | null;
  origem: string | null;
  conteudo: string | null;
  criado_em: string;
};

export type MarcacaoFunil = {
  telefone_digitos: string | null;
  criado_no_google: string | null;
  inicio: string | null;
  estado: string | null;
};

/** O que se apurou de uma conversa. */
export type ConversaFunil = {
  identificador: string;
  semana: string;
  escreveu: true;
  etapas: Record<EtapaFunil, boolean>;
  /** A marcação ligada já tinha a hora passada (para a taxa de comparecimento). */
  marcacaoJaPassou: boolean;
};

/**
 * Os dígitos do telefone de uma conversa: do próprio identificador
 * (`whatsapp:5511…`) ou, nos canais da Meta, do contacto (`telefoneDoContacto`).
 */
export function chaveDaConversa(identificador: string, telefoneDoContacto?: string | null) {
  if (identificador.startsWith("whatsapp:")) {
    return chaveTelefone(identificador.slice("whatsapp:".length));
  }
  return chaveTelefone(telefoneDoContacto);
}

/**
 * Apura as etapas de cada conversa.
 *
 * `mensagens` são as de conversas cuja PRIMEIRA mensagem recebida caiu na
 * janela (quem chama já tirou as que tinham histórico antes). As etapas 2 a 4
 * só contam mensagens do agente enviadas depois da 1.ª mensagem do cliente.
 * As etapas 5 e 6 só contam marcações criadas depois da 1.ª mensagem (uma hora
 * de folga, porque o espelho do Google grava o instante do Google).
 */
export function apurarConversas({
  agora,
  mensagens,
  marcacoes,
  telefonesDosContactos,
  timeZone,
}: {
  agora: Date;
  mensagens: MensagemFunil[];
  marcacoes: MarcacaoFunil[] | null;
  telefonesDosContactos: ReadonlyMap<string, string | null>;
  timeZone: string;
}): ConversaFunil[] {
  const porConversa = new Map<string, MensagemFunil[]>();
  for (const m of mensagens) {
    if (m.identificador_conversa.startsWith("teste:")) continue;
    const lista = porConversa.get(m.identificador_conversa);
    if (lista) lista.push(m);
    else porConversa.set(m.identificador_conversa, [m]);
  }

  const marcacoesPorTelefone = new Map<string, MarcacaoFunil[]>();
  for (const mc of marcacoes ?? []) {
    const chave = chaveTelefone(mc.telefone_digitos);
    if (!chave) continue;
    const lista = marcacoesPorTelefone.get(chave);
    if (lista) lista.push(mc);
    else marcacoesPorTelefone.set(chave, [mc]);
  }

  const FOLGA = 60 * 60 * 1000;
  const resultado: ConversaFunil[] = [];

  for (const [identificador, lista] of porConversa) {
    lista.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const primeira = lista.find((m) => m.direccao === "recebida");
    if (!primeira) continue;
    const inicio = new Date(primeira.criado_em);

    const doAgente = lista.filter(
      (m) => enviadaPeloAgente(m) && m.criado_em >= primeira.criado_em,
    );
    const textos = doAgente.map((m) => m.conteudo ?? "");

    const chave = chaveDaConversa(identificador, telefonesDosContactos.get(identificador));
    const ligadas = (chave ? (marcacoesPorTelefone.get(chave) ?? []) : []).filter(
      (mc) =>
        mc.criado_no_google !== null &&
        new Date(mc.criado_no_google).getTime() >= inicio.getTime() - FOLGA,
    );
    const validas = ligadas.filter((mc) => mc.estado !== "cancelado");
    const passadas = validas.filter(
      (mc) => mc.inicio !== null && new Date(mc.inicio).getTime() <= agora.getTime(),
    );

    resultado.push({
      escreveu: true,
      etapas: {
        conversa: doAgente.length > 0,
        preco: textos.some(dissePreco),
        horarios: textos.some(ofereceuHorario),
        resumo: textos.some((t, i) => pediuConfirmacao(t, i > 0 ? textos[i - 1] : "")),
        marcada: marcacoes !== null && ligadas.length > 0,
        compareceu: marcacoes !== null && passadas.length > 0,
      },
      identificador,
      marcacaoJaPassou:
        marcacoes !== null &&
        ligadas.some((mc) => mc.inicio !== null && new Date(mc.inicio).getTime() <= agora.getTime()),
      semana: segundaDaSemana(inicio, timeZone),
    });
  }

  return resultado;
}

export type SemanaFunil = {
  semana: string;
  /** Conversas que começaram (o cliente escreveu) nesta semana. */
  escreveram: number;
  contagens: Record<EtapaFunil, number>;
  /**
   * Taxa de cada etapa sobre a anterior, em %, entre as conversas que
   * chegaram à anterior (nunca passa de 100). `null` quando não há base.
   * Na 1.ª etapa a base é quem escreveu; no comparecimento é quem tinha uma
   * marcação cuja hora já passou.
   */
  taxas: Record<EtapaFunil, number | null>;
};

function taxa(parte: number, base: number) {
  return base > 0 ? Math.round((parte / base) * 100) : null;
}

/** Junta as conversas por semana (as `semanas` vêm por ordem, sem buracos). */
export function agruparPorSemana(conversas: ConversaFunil[], semanas: string[]): SemanaFunil[] {
  return semanas.map((semana) => agrupar(conversas.filter((c) => c.semana === semana), semana));
}

/** O mesmo, para um conjunto qualquer (o total das semanas). */
export function agrupar(conversas: ConversaFunil[], semana: string): SemanaFunil {
  const contagens = Object.fromEntries(
    ETAPAS.map((e) => [e, conversas.filter((c) => c.etapas[e]).length]),
  ) as Record<EtapaFunil, number>;

  const taxas = Object.fromEntries(
    ETAPAS.map((e, i) => {
      if (i === 0) return [e, taxa(contagens.conversa, conversas.length)];
      const anterior = ETAPAS[i - 1];
      if (e === "compareceu") {
        const base = conversas.filter((c) => c.etapas.marcada && c.marcacaoJaPassou);
        return [e, taxa(base.filter((c) => c.etapas.compareceu).length, base.length)];
      }
      const base = conversas.filter((c) => c.etapas[anterior]);
      return [e, taxa(base.filter((c) => c.etapas[e]).length, base.length)];
    }),
  ) as Record<EtapaFunil, number | null>;

  return { contagens, escreveram: conversas.length, semana, taxas };
}

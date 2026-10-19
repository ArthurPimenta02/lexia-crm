/**
 * Em que fuso é que uma data aparece ao dono.
 *
 * Isto existe porque havia duas respostas diferentes à mesma pergunta. As
 * métricas já sabiam o fuso de cada cliente, mas as páginas que escrevem uma
 * data no ecrã chamavam `Intl.DateTimeFormat` sem `timeZone` — e aí o fuso
 * passa a ser o da máquina. No servidor da Vercel a máquina está em UTC. Medido
 * na base real: 1206 das 7333 mensagens da Miranda (16,4%) apareciam no dia
 * errado, com 4 a 5 horas a mais. Uma conversa das 09:45 em Boston era mostrada
 * como 13:45.
 *
 * A regra, então: nenhuma data se formata sem dizer em que fuso. O fuso vem
 * daqui, e há um teste que falha se alguém voltar a formatar sem ele.
 */

/**
 * O fuso em que cada cliente vive. Isto devia vir da base — `lexia_clientes`
 * ainda não tem coluna para o fuso — mas enquanto não vier, vive aqui e só
 * aqui, em vez de espalhado por `if`s nas páginas.
 */
const clientTimezones: Record<string, string> = {
  detail_by_cordeiro: "Europe/Lisbon",
  miranda_skin_experts: "America/New_York",
};

/** O fuso de quem ainda não está no mapa. */
export const fallbackTimezone = "America/Sao_Paulo";

export function getClientTimezone(clienteSlug: string) {
  return clientTimezones[clienteSlug] ?? fallbackTimezone;
}

/**
 * `label` é o texto curto do botão da barra; `nome` é o que aparece em frases
 * ("horas de Lisboa"). São diferentes de propósito, mas vêm da mesma linha —
 * havia três cópias desta tabela espalhadas e nenhuma sabia das outras.
 */
export const timezoneOptions = [
  {
    label: "Brasil",
    nome: "Brasília",
    timeZone: "America/Sao_Paulo",
    value: "brasil",
  },
  {
    label: "Lisboa",
    nome: "Lisboa",
    timeZone: "Europe/Lisbon",
    value: "lisboa",
  },
  {
    label: "New York",
    nome: "Nova Iorque",
    timeZone: "America/New_York",
    value: "new_york",
  },
] as const;

export type TimezoneValue = (typeof timezoneOptions)[number]["value"];

function findByTimeZone(timeZone: string) {
  return (
    timezoneOptions.find((option) => option.timeZone === timeZone) ??
    timezoneOptions[0]
  );
}

/** O nome do fuso para escrever numa frase. */
export function getTimezoneLabel(timeZone: string) {
  return findByTimeZone(timeZone).nome;
}

/** O valor que a barra das conversas põe no `?fuso=`. */
export function getTimezoneValue(timeZone: string) {
  return findByTimeZone(timeZone).value;
}

/**
 * O fuso escolhido à mão na barra das conversas. Sem escolha, usa-se o do
 * cliente — e não o primeiro da lista, que era o Brasil para toda a gente.
 */
export function getSelectedTimezone(
  value: string | string[] | undefined,
  clienteSlug?: string | null,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const chosen = timezoneOptions.find((option) => option.value === raw);

  if (chosen) {
    return chosen;
  }

  const clientTimeZone = clienteSlug
    ? getClientTimezone(clienteSlug)
    : fallbackTimezone;

  return (
    timezoneOptions.find((option) => option.timeZone === clientTimeZone) ??
    timezoneOptions[0]
  );
}

/**
 * Quantos minutos é que este fuso está à frente do UTC, naquele instante.
 *
 * Formata o instante no fuso pedido, volta a lê-lo como se fosse UTC, e a
 * diferença é o desvio. É a forma de o fazer sem biblioteca de datas, e tem de
 * ser por instante e não por fuso: `Europe/Lisbon` é +00:00 em Janeiro e
 * +01:00 em Julho.
 */
function desvioEmMinutos(instante: Date, timeZone: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(instante);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");

  const comoSeFosseUtc = Date.UTC(
    valor("year"),
    valor("month") - 1,
    valor("day"),
    // Meia-noite sai como "24" em algumas plataformas.
    valor("hour") % 24,
    valor("minute"),
    valor("second"),
  );

  return (comoSeFosseUtc - instante.getTime()) / 60_000;
}

/**
 * O instante do meio-dia de um dia escrito como `2026-10-14`, no fuso do
 * cliente.
 *
 * Meio-dia e não meia-noite de propósito. A base guarda um instante e o painel
 * volta a mostrá-lo com `formatDayInTimezone`; se o instante ficasse encostado
 * à meia-noite, qualquer desvio punha o serviço a aparecer no dia anterior.
 * Com o meio-dia há doze horas de folga de cada lado.
 *
 * Devolve `null` se o dia não tiver a forma esperada.
 */
export function instanteAoMeioDiaNoFuso(dia: string, timeZone: string) {
  const partido = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia.trim());

  if (!partido) {
    return null;
  }

  const [, ano, mes, diaDoMes] = partido.map(Number);
  const provisorio = Date.UTC(ano, mes - 1, diaDoMes, 12, 0, 0);
  const confirmacao = new Date(provisorio);

  // `Date.UTC` transborda em silêncio: o mês 13 vira Janeiro do ano seguinte e
  // o dia 45 passa para o mês a seguir. Sem esta confirmação, uma data
  // impossível gravava um serviço num dia que ninguém escolheu.
  if (
    confirmacao.getUTCFullYear() !== ano ||
    confirmacao.getUTCMonth() !== mes - 1 ||
    confirmacao.getUTCDate() !== diaDoMes
  ) {
    return null;
  }

  // Uma passagem chega: as mudanças de hora acontecem de madrugada, longe do
  // meio-dia, por isso o desvio medido no instante provisório é o mesmo do
  // instante final.
  const desvio = desvioEmMinutos(new Date(provisorio), timeZone);
  const instante = new Date(provisorio - desvio * 60_000);

  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

/**
 * O instante de uma hora concreta — `2026-10-25` às `09:00` — no fuso do
 * cliente.
 *
 * Isto não podia ser o `instanteAoMeioDiaNoFuso`, e a diferença é mais do que
 * a hora. Esse existe para registar um serviço que já aconteceu, onde só o dia
 * importa e o meio-dia é uma almofada contra desvios. Aqui a hora **é** o
 * dado: é o que vai bloquear a agenda do Martim, por isso tem de ficar certa
 * ao minuto.
 *
 * Porque é que o desvio se mede duas vezes: no meio-dia uma passagem bastava,
 * porque as mudanças de hora acontecem de madrugada e nunca mudam o desvio do
 * meio-dia. Uma hora qualquer não tem essa folga. Às 01:30 do dia em que o
 * relógio muda, o desvio do instante provisório e o do instante final são
 * diferentes — a primeira passagem aterra do lado errado da mudança. A segunda
 * passagem corrige. Horas que não existem (o relógio salta de 00:59 para
 * 02:00) são recusadas em vez de aterrarem numa hora que ninguém escolheu.
 */
export function instanteNoFuso(dia: string, hora: string, timeZone: string) {
  const diaPartido = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia.trim());
  const horaPartida = /^(\d{2}):(\d{2})$/.exec(hora.trim());

  if (!diaPartido || !horaPartida) {
    return null;
  }

  const [, ano, mes, diaDoMes] = diaPartido.map(Number);
  const [, horas, minutos] = horaPartida.map(Number);

  if (horas > 23 || minutos > 59) {
    return null;
  }

  const provisorio = Date.UTC(ano, mes - 1, diaDoMes, horas, minutos, 0);
  const confirmacao = new Date(provisorio);

  // `Date.UTC` transborda em silêncio — o dia 45 passa para o mês seguinte.
  if (
    confirmacao.getUTCFullYear() !== ano ||
    confirmacao.getUTCMonth() !== mes - 1 ||
    confirmacao.getUTCDate() !== diaDoMes
  ) {
    return null;
  }

  const primeiro = new Date(
    provisorio - desvioEmMinutos(confirmacao, timeZone) * 60_000,
  );
  const instante = new Date(
    provisorio - desvioEmMinutos(primeiro, timeZone) * 60_000,
  );

  if (Number.isNaN(instante.getTime())) {
    return null;
  }

  // A prova: voltar a ler o instante no fuso tem de devolver a hora escolhida.
  // Quando não devolve, a hora não existe naquele dia naquele fuso.
  const voltaAtras = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(instante);

  if (voltaAtras.replace("24:", "00:") !== `${hora.trim()}`) {
    return null;
  }

  return instante.toISOString();
}

export function formatDateInTimezone(
  date: string | null,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  },
) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone,
  }).format(new Date(date));
}

/** Só o dia, sem horas — o formato que as fichas e as tabelas usam. */
export function formatDayInTimezone(date: string | null, timeZone: string) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(date));
}

// 13/11/2026 (Arthur): o filtro de todas as telas é Hoje · Ontem · Uma semana · Período total · Personalizado.
// "mes" (Este mês) deixou de aparecer, mas continua a ser lido: links e sessões guardadas não partem.
export type DashboardPeriod = "hoje" | "ontem" | "semana" | "tudo" | "personalizado" | "mes";

export type DashboardDateRange = {
  end: Date;
  key: DashboardPeriod;
  label: string;
  start: Date;
};

export const dashboardTimeZone = "America/Sao_Paulo";

export const dashboardPeriodOptions = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Uma semana" },
  { key: "tudo", label: "Período total" },
  { key: "personalizado", label: "Personalizado" },
] as const;

/** Onde começa o "Período total": antes disto não há dados na plataforma (o mais antigo é de 05/2025). */
export const INICIO_DO_PERIODO_TOTAL = { ano: 2025, mes: 1, dia: 1 } as const;

export function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function getZonedParts(
  date: Date,
  timeZone: string = dashboardTimeZone,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    month: getPart("month"),
    second: getPart("second"),
    year: getPart("year"),
  };
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function getDateInTimeZone(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day));
  const offset = getTimeZoneOffset(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offset);
}

function addCalendarDays(date: Date, days: number, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const target = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return getDateInTimeZone(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    timeZone,
  );
}

export function getInclusiveRangeEnd(end: Date) {
  return new Date(end.getTime() - 1);
}

function parseDateInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return getDateInTimeZone(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    timeZone,
  );
}

export function formatRangeDate(
  date: Date,
  timeZone: string = dashboardTimeZone,
) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone,
  }).format(date);
}

export function getDateInputValue(
  date: Date,
  timeZone: string = dashboardTimeZone,
) {
  const parts = getZonedParts(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");

  return `${parts.year}-${month}-${day}`;
}

export function getDateRange(
  period: string,
  customStart: string,
  customEnd: string,
  timeZone: string = dashboardTimeZone,
): DashboardDateRange {
  const nowParts = getZonedParts(new Date(), timeZone);
  const todayStart = getDateInTimeZone(
    nowParts.year,
    nowParts.month,
    nowParts.day,
    timeZone,
  );
  const tomorrowStart = addCalendarDays(todayStart, 1, timeZone);
  const normalizedPeriod = dashboardPeriodOptions.some(
    (option) => option.key === period,
  ) || period === "mes"
    ? (period as DashboardPeriod)
    : "hoje";

  if (normalizedPeriod === "ontem") {
    const start = addCalendarDays(todayStart, -1, timeZone);
    return { end: todayStart, key: "ontem", label: formatRangeDate(start, timeZone), start };
  }

  if (normalizedPeriod === "tudo") {
    const start = getDateInTimeZone(INICIO_DO_PERIODO_TOTAL.ano, INICIO_DO_PERIODO_TOTAL.mes, INICIO_DO_PERIODO_TOTAL.dia, timeZone);
    return { end: tomorrowStart, key: "tudo", label: "Período total", start };
  }

  if (normalizedPeriod === "personalizado") {
    const start = parseDateInput(customStart, timeZone) ?? todayStart;
    const parsedEnd = parseDateInput(customEnd, timeZone) ?? start;
    const lastDay = parsedEnd < start ? start : parsedEnd;
    const end = addCalendarDays(lastDay, 1, timeZone);

    return {
      end,
      key: "personalizado",
      label: `${formatRangeDate(start, timeZone)} - ${formatRangeDate(
        getInclusiveRangeEnd(end),
        timeZone,
      )}`,
      start,
    };
  }

  if (normalizedPeriod === "semana") {
    // "Uma semana" = os últimos 7 dias, hoje incluído.
    const start = addCalendarDays(todayStart, -6, timeZone);
    const end = tomorrowStart;

    return {
      end,
      key: "semana",
      label: `${formatRangeDate(start, timeZone)} - ${formatRangeDate(
        getInclusiveRangeEnd(end),
        timeZone,
      )}`,
      start,
    };
  }

  if (normalizedPeriod === "mes") {
    const start = getDateInTimeZone(
      nowParts.year,
      nowParts.month,
      1,
      timeZone,
    );
    const end =
      nowParts.month === 12
        ? getDateInTimeZone(nowParts.year + 1, 1, 1, timeZone)
        : getDateInTimeZone(nowParts.year, nowParts.month + 1, 1, timeZone);

    return {
      end,
      key: "mes",
      label: `${formatRangeDate(start, timeZone)} - ${formatRangeDate(
        getInclusiveRangeEnd(end),
        timeZone,
      )}`,
      start,
    };
  }

  return {
    end: tomorrowStart,
    key: "hoje",
    label: formatRangeDate(todayStart, timeZone),
    start: todayStart,
  };
}

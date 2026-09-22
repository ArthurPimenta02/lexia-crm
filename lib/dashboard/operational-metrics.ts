export const autonomyDataStart = new Date("2026-08-01T00:00:00.000Z");

const interventionOrigins = new Set(["humano", "painel_cliente"]);

export type DashboardMessageMetricRow = {
  cliente_slug: string;
  criado_em: string | null;
  direccao?: string | null;
  id?: string;
  identificador_conversa: string;
  origem: string | null;
};

export type AutonomyMetrics = {
  autonomousConversations: number;
  dataAvailable: boolean;
  effectiveStart: Date;
  interventionConversations: number;
  limitedByDataStart: boolean;
  percentage: number | null;
  totalConversations: number;
};

type MetricsRange = {
  end: Date;
  start: Date;
};

export type FollowupRecoveryMetrics = {
  followupConversations: number;
  followupsSent: number;
  recoveredConversations: number;
  recoveryRate: number | null;
};

export type OutOfHoursMetrics = {
  outsideCount: number;
  percentage: number | null;
  sentCount: number;
};

export type FirstResponseMetrics = {
  averageSeconds: number | null;
  samples: number;
  totalSeconds: number;
};

export type HeatmapCell = {
  day: string;
  hour: number;
  value: number;
};

export function getConversationKey(
  message: Pick<
    DashboardMessageMetricRow,
    "cliente_slug" | "identificador_conversa"
  >,
) {
  return `${message.cliente_slug}:${message.identificador_conversa}`;
}

export function isMessageInRange(
  message: DashboardMessageMetricRow,
  range: MetricsRange,
) {
  if (!message.criado_em) {
    return false;
  }

  const createdAt = new Date(message.criado_em);

  return createdAt >= range.start && createdAt < range.end;
}

export function getStartedConversationKeys(
  messages: DashboardMessageMetricRow[],
  range: MetricsRange,
) {
  const firstInboundByConversation = new Map<string, number>();

  for (const message of messages) {
    if (message.direccao !== "recebida" || !message.criado_em) {
      continue;
    }

    const key = getConversationKey(message);
    const createdAt = new Date(message.criado_em).getTime();
    const current = firstInboundByConversation.get(key);

    if (current === undefined || createdAt < current) {
      firstInboundByConversation.set(key, createdAt);
    }
  }

  return new Set(
    Array.from(firstInboundByConversation.entries())
      .filter(
        ([, createdAt]) =>
          createdAt >= range.start.getTime() && createdAt < range.end.getTime(),
      )
      .map(([key]) => key),
  );
}

export function getStartedConversationCountsByClient(
  messages: DashboardMessageMetricRow[],
  rangesByClient: Map<string, MetricsRange>,
) {
  const firstInboundByConversation = new Map<
    string,
    { clienteSlug: string; createdAt: number }
  >();

  for (const message of messages) {
    if (message.direccao !== "recebida" || !message.criado_em) {
      continue;
    }

    const key = getConversationKey(message);
    const createdAt = new Date(message.criado_em).getTime();
    const current = firstInboundByConversation.get(key);

    if (!current || createdAt < current.createdAt) {
      firstInboundByConversation.set(key, {
        clienteSlug: message.cliente_slug,
        createdAt,
      });
    }
  }

  const counts = new Map<string, number>();

  for (const { clienteSlug, createdAt } of firstInboundByConversation.values()) {
    const range = rangesByClient.get(clienteSlug);

    if (
      range &&
      createdAt >= range.start.getTime() &&
      createdAt < range.end.getTime()
    ) {
      counts.set(clienteSlug, (counts.get(clienteSlug) ?? 0) + 1);
    }
  }

  return counts;
}

export function getUniqueConversationCount(
  messages: DashboardMessageMetricRow[],
) {
  return new Set(messages.map(getConversationKey)).size;
}

export function getUniqueConversationCountsByClient(
  messages: DashboardMessageMetricRow[],
) {
  const conversationsByClient = new Map<string, Set<string>>();

  for (const message of messages) {
    const current = conversationsByClient.get(message.cliente_slug) ?? new Set();

    current.add(message.identificador_conversa);
    conversationsByClient.set(message.cliente_slug, current);
  }

  return new Map(
    Array.from(conversationsByClient.entries()).map(([clienteSlug, values]) => [
      clienteSlug,
      values.size,
    ]),
  );
}

export function getAutonomyMetrics(
  messages: DashboardMessageMetricRow[],
  range: MetricsRange,
): AutonomyMetrics {
  const effectiveStart =
    range.start < autonomyDataStart ? autonomyDataStart : range.start;
  const limitedByDataStart = range.start < autonomyDataStart;
  const dataAvailable = range.end > autonomyDataStart;
  const conversations = new Set<string>();
  const interventionConversations = new Set<string>();

  if (!dataAvailable) {
    return {
      autonomousConversations: 0,
      dataAvailable: false,
      effectiveStart,
      interventionConversations: 0,
      limitedByDataStart,
      percentage: null,
      totalConversations: 0,
    };
  }

  for (const message of messages) {
    if (!message.criado_em) {
      continue;
    }

    const createdAt = new Date(message.criado_em);

    if (createdAt < effectiveStart || createdAt >= range.end) {
      continue;
    }

    const conversationKey = getConversationKey(message);

    conversations.add(conversationKey);

    if (message.origem && interventionOrigins.has(message.origem)) {
      interventionConversations.add(conversationKey);
    }
  }

  const totalConversations = conversations.size;
  const interventionCount = interventionConversations.size;
  const autonomousConversations = Math.max(
    totalConversations - interventionCount,
    0,
  );

  return {
    autonomousConversations,
    dataAvailable: true,
    effectiveStart,
    interventionConversations: interventionCount,
    limitedByDataStart,
    percentage:
      totalConversations > 0
        ? Math.round((autonomousConversations / totalConversations) * 1000) / 10
        : null,
    totalConversations,
  };
}

function getCreatedTime(message: DashboardMessageMetricRow) {
  return message.criado_em ? new Date(message.criado_em).getTime() : 0;
}

function getSortedMessages(messages: DashboardMessageMetricRow[]) {
  return [...messages].sort(
    (a, b) =>
      getCreatedTime(a) - getCreatedTime(b) ||
      (a.id ?? "").localeCompare(b.id ?? ""),
  );
}

export function getFollowupRecoveryMetrics(
  messages: DashboardMessageMetricRow[],
  range: MetricsRange,
): FollowupRecoveryMetrics {
  const messagesByConversation = new Map<string, DashboardMessageMetricRow[]>();
  let followupsSent = 0;
  const followupConversations = new Set<string>();
  const recoveredConversations = new Set<string>();

  for (const message of messages) {
    const key = getConversationKey(message);
    const current = messagesByConversation.get(key) ?? [];

    current.push(message);
    messagesByConversation.set(key, current);

    if (
      message.origem === "followup_rapido" &&
      isMessageInRange(message, range)
    ) {
      followupsSent += 1;
      followupConversations.add(key);
    }
  }

  for (const key of followupConversations) {
    const conversationMessages = messagesByConversation.get(key) ?? [];
    const sortedMessages = getSortedMessages(conversationMessages);
    const firstFollowup = sortedMessages.find(
      (message) =>
        message.origem === "followup_rapido" &&
        isMessageInRange(message, range),
    );

    if (!firstFollowup?.criado_em) {
      continue;
    }

    const followupTime = new Date(firstFollowup.criado_em).getTime();
    const hasRecovery = sortedMessages.some(
      (message) =>
        message.direccao === "recebida" &&
        getCreatedTime(message) > followupTime,
    );

    if (hasRecovery) {
      recoveredConversations.add(key);
    }
  }

  return {
    followupConversations: followupConversations.size,
    followupsSent,
    recoveredConversations: recoveredConversations.size,
    recoveryRate:
      followupConversations.size > 0
        ? Math.round(
            (recoveredConversations.size / followupConversations.size) * 1000,
          ) / 10
        : null,
  };
}

export function getFollowupsSentCount(messages: DashboardMessageMetricRow[]) {
  return messages.filter(
    (message) =>
      message.direccao === "enviada" &&
      (message.origem === "followup_agente" ||
        message.origem === "followup_rapido"),
  ).length;
}

function getZonedDayAndHour(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
    weekday: "short",
  }).formatToParts(date);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "Mon",
  };
}

export function getOutOfHoursMetrics(
  messages: DashboardMessageMetricRow[],
  timeZone: string,
): OutOfHoursMetrics {
  let sentCount = 0;
  let outsideCount = 0;

  for (const message of messages) {
    if (
      message.direccao !== "enviada" ||
      message.origem === "humano" ||
      message.origem === "painel_cliente" ||
      !message.criado_em
    ) {
      continue;
    }

    sentCount += 1;

    const { hour, weekday } = getZonedDayAndHour(
      new Date(message.criado_em),
      timeZone,
    );

    if (weekday === "Sat" || weekday === "Sun" || hour < 9 || hour >= 19) {
      outsideCount += 1;
    }
  }

  return {
    outsideCount,
    percentage:
      sentCount > 0 ? Math.round((outsideCount / sentCount) * 1000) / 10 : null,
    sentCount,
  };
}

export function getFirstResponseMetrics(
  messages: DashboardMessageMetricRow[],
  range: MetricsRange,
): FirstResponseMetrics {
  const messagesByConversation = new Map<string, DashboardMessageMetricRow[]>();
  const responseTimes: number[] = [];

  for (const message of messages) {
    const key = getConversationKey(message);
    const current = messagesByConversation.get(key) ?? [];

    current.push(message);
    messagesByConversation.set(key, current);
  }

  for (const conversationMessages of messagesByConversation.values()) {
    const sortedMessages = getSortedMessages(conversationMessages);
    const firstInboundIndex = sortedMessages.findIndex(
      (message) => message.direccao === "recebida" && message.criado_em,
    );

    if (firstInboundIndex === -1) {
      continue;
    }

    const firstInbound = sortedMessages[firstInboundIndex];

    if (!isMessageInRange(firstInbound, range) || !firstInbound.criado_em) {
      continue;
    }

    const nextSent = sortedMessages
      .slice(firstInboundIndex + 1)
      .find(
        (candidate) =>
          candidate.direccao === "enviada" &&
          candidate.origem !== "humano" &&
          candidate.origem !== "painel_cliente",
      );

    if (!nextSent?.criado_em) {
      continue;
    }

    const deltaSeconds =
      (new Date(nextSent.criado_em).getTime() -
        new Date(firstInbound.criado_em).getTime()) /
      1000;

    if (deltaSeconds >= 0 && deltaSeconds <= 3600) {
      responseTimes.push(deltaSeconds);
    }
  }

  const totalSeconds = responseTimes.reduce((total, value) => total + value, 0);

  return {
    averageSeconds:
      responseTimes.length > 0
        ? Math.round(totalSeconds / responseTimes.length)
        : null,
    samples: responseTimes.length,
    totalSeconds,
  };
}

export function getReceivedMessagesHeatmap(
  messages: DashboardMessageMetricRow[],
  timeZone: string,
): HeatmapCell[] {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const weekdayMap = new Map([
    ["Mon", "Seg"],
    ["Tue", "Ter"],
    ["Wed", "Qua"],
    ["Thu", "Qui"],
    ["Fri", "Sex"],
    ["Sat", "Sáb"],
    ["Sun", "Dom"],
  ]);
  const values = new Map<string, number>();

  for (const message of messages) {
    if (message.direccao !== "recebida" || !message.criado_em) {
      continue;
    }

    const { hour, weekday } = getZonedDayAndHour(
      new Date(message.criado_em),
      timeZone,
    );
    const day = weekdayMap.get(weekday) ?? "Seg";
    const key = `${day}:${hour}`;

    values.set(key, (values.get(key) ?? 0) + 1);
  }

  return days.flatMap((day) =>
    Array.from({ length: 24 }, (_, hour) => ({
      day,
      hour,
      value: values.get(`${day}:${hour}`) ?? 0,
    })),
  );
}

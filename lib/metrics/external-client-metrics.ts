import { createClient } from "@supabase/supabase-js";

import { getClientTimezone } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

export type ExternalClientMetrics = {
  /** Quando cada agendamento do período foi criado (para o gráfico por dia). */
  appointmentDates: string[];
  appointmentWeekdays: { label: string; value: number }[];
  appointments: number | null;
  isConfigured: boolean;
  services: { label: string; value: number }[];
};

type MetricsRange = {
  end: Date;
  start: Date;
};

type ExternalClientConfig = {
  appointments: {
    appointmentDateColumn: string;
    dateColumn: string;
    hasClienteSlug: boolean;
    serviceColumn: string;
    statusColumn: string;
    statusValues: string[];
    table: string;
    /** Só as linhas com esta coluna = valor (ex.: origem = agente). */
    onlyWhere?: { column: string; value: string };
  };
  envPrefix: string;
  /**
   * As marcações estão na Supabase CENTRAL (lexia_agendamentos, o espelho do Google), não numa base do
   * cliente. Claudia, 13/11/2026: as marcações dela só existem no Google Calendar.
   */
  central?: boolean;
};

const clientConfigs: Record<string, ExternalClientConfig> = {
  detail_by_cordeiro: {
    appointments: {
      appointmentDateColumn: "data_inicio",
      dateColumn: "criado_em",
      hasClienteSlug: true,
      serviceColumn: "servico",
      statusColumn: "estado",
      statusValues: ["confirmada", "pendente_sinal"],
      table: "marcacoes",
    },
    envPrefix: "DETAIL_BY_CORDEIRO",
  },
  miranda_skin_experts: {
    appointments: {
      appointmentDateColumn: "inicio",
      dateColumn: "criado_em",
      hasClienteSlug: false,
      serviceColumn: "servico",
      statusColumn: "status",
      statusValues: ["confirmado"],
      table: "agendamentos_miranda_skin",
    },
    envPrefix: "MIRANDA",
  },
  claudia_leite_spa: {
    appointments: {
      appointmentDateColumn: "inicio",
      dateColumn: "criado_no_google",
      hasClienteSlug: true,
      // As que a Carla marcou (como a Miranda, cuja tabela é a do agente): a conversão é do agente.
      onlyWhere: { column: "origem", value: "agente" },
      serviceColumn: "servico",
      statusColumn: "estado",
      statusValues: ["confirmado"],
      table: "lexia_agendamentos",
    },
    central: true,
    envPrefix: "CLAUDIA_LEITE_SPA",
  },
};

const emptyAppointmentWeekdays = [
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
  "Dom",
].map((label) => ({ label, value: 0 }));

function emptyExternalMetrics(isConfigured: boolean): ExternalClientMetrics {
  return {
    appointmentDates: [],
    appointmentWeekdays: emptyAppointmentWeekdays,
    appointments: null,
    isConfigured,
    services: [],
  };
}

function createExternalClient(config: ExternalClientConfig) {
  if (config.central) {
    return createAdminClient();
  }

  const supabaseUrl = process.env[`${config.envPrefix}_SUPABASE_URL`]?.trim();
  const serviceRoleKey =
    process.env[`${config.envPrefix}_SUPABASE_SERVICE_ROLE_KEY`]?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listAppointments(
  supabase: ReturnType<typeof createExternalClient>,
  config: ExternalClientConfig,
  clienteSlug: string,
  range: MetricsRange,
) {
  if (!supabase) {
    return { data: null, error: null };
  }

  const selectedColumns = Array.from(
    new Set([
      "id",
      config.appointments.appointmentDateColumn,
      config.appointments.dateColumn,
      config.appointments.serviceColumn,
    ]),
  ).join(",");

  return fetchAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
    let query = supabase
      .from(config.appointments.table)
      .select(selectedColumns)
      .in(config.appointments.statusColumn, config.appointments.statusValues)
      .gte(config.appointments.dateColumn, range.start.toISOString())
      .lt(config.appointments.dateColumn, range.end.toISOString());

    if (config.appointments.hasClienteSlug) {
      query = query.eq("cliente_slug", clienteSlug);
    }

    if (config.appointments.onlyWhere) {
      query = query.eq(config.appointments.onlyWhere.column, config.appointments.onlyWhere.value);
    }

    const result = await query
      .order(config.appointments.dateColumn, { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    return {
      data: (result.data ?? []) as unknown as Record<string, unknown>[],
      error: result.error,
    };
  });
}

function getTextValue(row: Record<string, unknown>, column: string) {
  const value = row[column];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildServiceRanking(
  rows: Record<string, unknown>[],
  config: ExternalClientConfig,
) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const service = getTextValue(row, config.appointments.serviceColumn);

    if (!service) {
      continue;
    }

    counts.set(service, (counts.get(service) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildWeekdayCounts(
  rows: Record<string, unknown>[],
  config: ExternalClientConfig,
  timeZone: string,
) {
  const counts = [...emptyAppointmentWeekdays];
  const weekdayIndexes = new Map([
    ["Mon", 0],
    ["Tue", 1],
    ["Wed", 2],
    ["Thu", 3],
    ["Fri", 4],
    ["Sat", 5],
    ["Sun", 6],
  ]);

  for (const row of rows) {
    const dateValue = getTextValue(row, config.appointments.appointmentDateColumn);

    if (!dateValue) {
      continue;
    }

    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(new Date(dateValue));
    const mondayFirstIndex = weekdayIndexes.get(weekday);

    if (mondayFirstIndex === undefined) {
      continue;
    }

    counts[mondayFirstIndex] = {
      ...counts[mondayFirstIndex],
      value: counts[mondayFirstIndex].value + 1,
    };
  }

  return counts;
}

export async function getExternalClientMetrics(
  clienteSlug: string,
  range: MetricsRange,
): Promise<ExternalClientMetrics> {
  const config = clientConfigs[clienteSlug];

  if (!config) {
    return emptyExternalMetrics(false);
  }

  const supabase = createExternalClient(config);

  if (!supabase) {
    return emptyExternalMetrics(false);
  }
  const appointmentsListResult = await listAppointments(
    supabase,
    config,
    clienteSlug,
    range,
  );

  if (appointmentsListResult.error) {
    console.error(
      "Erro ao listar agendamentos externos",
      appointmentsListResult.error,
    );
  }

  const appointmentRows =
    ((appointmentsListResult.data ?? []) as Record<string, unknown>[]) ?? [];

  return {
    appointmentDates: appointmentsListResult.error
      ? []
      : appointmentRows
          .map((row) => getTextValue(row, config.appointments.dateColumn))
          .filter((valor): valor is string => Boolean(valor)),
    appointmentWeekdays: appointmentsListResult.error
      ? emptyAppointmentWeekdays
      : buildWeekdayCounts(
          appointmentRows,
          config,
          getClientTimezone(clienteSlug),
        ),
    appointments: appointmentsListResult.error ? null : appointmentRows.length,
    isConfigured: true,
    services: appointmentsListResult.error
      ? []
      : buildServiceRanking(appointmentRows, config),
  };
}

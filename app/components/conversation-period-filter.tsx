import Link from "next/link";
import Form from "next/form";

import { FormSubmitButton } from "@/app/components/form-submit-button";

import {
  dashboardPeriodOptions,
  type DashboardDateRange,
  type DashboardPeriod,
  getDateInputValue,
  getInclusiveRangeEnd,
} from "@/lib/dashboard/date-range";

export type ConversationPeriodState = {
  end: string;
  key: DashboardPeriod;
  start: string;
};

export function getConversationPeriodState(
  range: DashboardDateRange,
  timeZone: string,
): ConversationPeriodState {
  return {
    end: getDateInputValue(getInclusiveRangeEnd(range.end), timeZone),
    key: range.key,
    start: getDateInputValue(range.start, timeZone),
  };
}

export function appendConversationPeriodParams(
  params: URLSearchParams,
  period: ConversationPeriodState,
) {
  params.set("periodo", period.key);

  if (period.key === "personalizado") {
    params.set("inicio", period.start);
    params.set("fim", period.end);
  }
}

function buildPeriodHref({
  basePath,
  channel,
  clientSlug,
  currentPeriod,
  period,
  timezone,
}: {
  basePath: string;
  channel: string;
  clientSlug?: string;
  currentPeriod: ConversationPeriodState;
  period: DashboardPeriod;
  timezone: string;
}) {
  const params = new URLSearchParams();

  if (clientSlug) {
    params.set("cliente", clientSlug);
  }

  if (channel) {
    params.set("canal", channel);
  }

  params.set("fuso", timezone);
  params.set("periodo", period);

  if (period === "personalizado") {
    params.set("inicio", currentPeriod.start);
    params.set("fim", currentPeriod.end);
  }

  return `${basePath}?${params.toString()}`;
}

export function ConversationPeriodFilter({
  basePath,
  channel,
  clientSlug,
  period,
  rangeLabel,
  timezone,
}: {
  basePath: string;
  channel: string;
  clientSlug?: string;
  period: ConversationPeriodState;
  rangeLabel: string;
  timezone: string;
}) {
  return (
    <div className="mt-4 border-t border-zinc-200/70 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          Período
        </p>
        <p className="text-xs text-zinc-500">{rangeLabel}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {dashboardPeriodOptions.map((option) => {
          const isActive = option.key === period.key;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
              href={buildPeriodHref({
                basePath,
                channel,
                clientSlug,
                currentPeriod: period,
                period: option.key,
                timezone,
              })}
              key={option.key}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {period.key === "personalizado" ? (
        <Form
          action={basePath}
          className="mt-3 grid grid-cols-2 gap-2"
          replace
          scroll={false}
        >
          <input name="periodo" type="hidden" value="personalizado" />
          <input name="fuso" type="hidden" value={timezone} />
          {clientSlug ? (
            <input name="cliente" type="hidden" value={clientSlug} />
          ) : null}
          {channel ? (
            <input name="canal" type="hidden" value={channel} />
          ) : null}

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-zinc-600">
            Início
            <input
              className="h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-950"
              defaultValue={period.start}
              name="inicio"
              type="date"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-zinc-600">
            Fim
            <input
              className="h-9 min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-950"
              defaultValue={period.end}
              name="fim"
              type="date"
            />
          </label>
          <FormSubmitButton
            className="col-span-2 h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800"
            pendingLabel="Aplicando..."
          >
            Aplicar período
          </FormSubmitButton>
        </Form>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import Form from "next/form";
import { Check } from "lucide-react";

import { FormSubmitButton } from "@/app/components/form-submit-button";

import {
  getDateInputValue,
  getInclusiveRangeEnd,
} from "@/lib/dashboard/date-range";
import {
  type ConversationDateRange,
  conversationPeriodOptions,
  type ConversationPeriod,
} from "@/lib/conversations/date-range";

export type ConversationPeriodState = {
  end: string;
  key: ConversationPeriod;
  start: string;
};

export function getConversationPeriodState(
  range: ConversationDateRange,
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
  searchQuery,
  timezone,
}: {
  basePath: string;
  channel: string;
  clientSlug?: string;
  currentPeriod: ConversationPeriodState;
  period: ConversationPeriod;
  searchQuery?: string;
  timezone: string;
}) {
  const params = new URLSearchParams();

  if (clientSlug) {
    params.set("cliente", clientSlug);
  }

  if (channel) {
    params.set("canal", channel);
  }

  if (searchQuery) {
    params.set("busca", searchQuery);
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
  searchQuery = "",
  timezone,
}: {
  basePath: string;
  channel: string;
  clientSlug?: string;
  period: ConversationPeriodState;
  rangeLabel: string;
  searchQuery?: string;
  timezone: string;
}) {
  return (
    <div className="mt-3 border-t border-zinc-200/70 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
          Período
        </p>
        <p className="text-xs text-zinc-500">{rangeLabel}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {conversationPeriodOptions.map((option) => {
          const isActive = option.key === period.key;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-8 items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
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
                searchQuery,
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
          className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-1.5"
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
          {searchQuery ? (
            <input name="busca" type="hidden" value={searchQuery} />
          ) : null}

          <label className="min-w-0">
            <span className="sr-only">Início</span>
            <input
              className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-950"
              defaultValue={period.start}
              name="inicio"
              type="date"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Fim</span>
            <input
              className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900 outline-none transition focus:border-zinc-950"
              defaultValue={period.end}
              name="fim"
              type="date"
            />
          </label>
          <FormSubmitButton
            aria-label="Aplicar período"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-950 text-white transition hover:bg-zinc-800"
            pendingLabel=""
            title="Aplicar período"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
          </FormSubmitButton>
        </Form>
      ) : null}
    </div>
  );
}

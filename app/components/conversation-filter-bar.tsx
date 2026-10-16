import Form from "next/form";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

import {
  ChannelFilterLink,
  getChannelLabel,
} from "@/app/components/channel-brand";
import {
  appendConversationPeriodParams,
  ConversationPeriodFilter,
  type ConversationPeriodState,
} from "@/app/components/conversation-period-filter";
import { TimezoneSwitcher } from "@/app/components/conversation-timezone";
import { getSelectedTimezone } from "@/lib/clientes/timezone";
import { conversationPeriodOptions } from "@/lib/conversations/date-range";

const channelFilters = [
  { label: "Todas", value: "" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Messenger", value: "messenger" },
  { label: "Instagram", value: "instagram" },
];

type ConversationFilterBarProps = {
  basePath: string;
  channel: string;
  clientSlug?: string;
  conversationId?: string | null;
  leading?: ReactNode;
  period: ConversationPeriodState;
  rangeLabel: string;
  searchQuery: string;
  timezone: string;
};

function buildHref({
  basePath,
  channel,
  clientSlug,
  conversationId,
  period,
  searchQuery,
  timezone,
}: Omit<ConversationFilterBarProps, "leading" | "rangeLabel">) {
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

  if (conversationId) {
    params.set("conversa", conversationId);
  }

  params.set("fuso", timezone);
  appendConversationPeriodParams(params, period);

  return `${basePath}?${params.toString()}`;
}

function FilterHiddenFields({
  channel,
  clientSlug,
  period,
  timezone,
}: Pick<
  ConversationFilterBarProps,
  "channel" | "clientSlug" | "period" | "timezone"
>) {
  return (
    <>
      {clientSlug ? (
        <input name="cliente" type="hidden" value={clientSlug} />
      ) : null}
      {channel ? <input name="canal" type="hidden" value={channel} /> : null}
      <input name="fuso" type="hidden" value={timezone} />
      <input name="periodo" type="hidden" value={period.key} />
      {period.key === "personalizado" ? (
        <>
          <input name="inicio" type="hidden" value={period.start} />
          <input name="fim" type="hidden" value={period.end} />
        </>
      ) : null}
    </>
  );
}

export function ConversationFilterBar({
  basePath,
  channel,
  clientSlug,
  conversationId,
  leading,
  period,
  rangeLabel,
  searchQuery,
  timezone,
}: ConversationFilterBarProps) {
  const selectedTimezone = getSelectedTimezone(timezone);
  const periodLabel =
    conversationPeriodOptions.find((option) => option.key === period.key)
      ?.label ??
    rangeLabel;
  const activeFilterCount =
    Number(Boolean(channel)) +
    Number(period.key !== "mes") +
    Number(timezone !== "brasil");
  const searchClearHref = buildHref({
    basePath,
    channel,
    clientSlug,
    conversationId: null,
    period,
    searchQuery: "",
    timezone,
  });
  const resetParams = new URLSearchParams();

  if (clientSlug) {
    resetParams.set("cliente", clientSlug);
  }

  if (searchQuery) {
    resetParams.set("busca", searchQuery);
  }

  const resetHref = resetParams.size
    ? `${basePath}?${resetParams.toString()}`
    : basePath;

  return (
    <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/95 p-2 shadow-sm">
      {leading}

      <Form
        action={basePath}
        className="relative min-w-56 flex-1 lg:max-w-[340px]"
        replace
        scroll={false}
      >
        <FilterHiddenFields
          channel={channel}
          clientSlug={clientSlug}
          period={period}
          timezone={timezone}
        />
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          aria-label="Pesquisar conversa por nome ou telefone"
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pr-16 pl-9 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white"
          defaultValue={searchQuery}
          inputMode="search"
          maxLength={80}
          name="busca"
          placeholder="Buscar por nome"
          type="text"
        />
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
          {searchQuery ? (
            <Link
              aria-label="Limpar pesquisa"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-800"
              href={searchClearHref}
              title="Limpar pesquisa"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          <button
            aria-label="Pesquisar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950"
            title="Pesquisar"
            type="submit"
          >
            <Search aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      </Form>

      <p className="ml-auto hidden min-w-0 truncate text-xs text-zinc-500 md:block">
        {getChannelLabel(channel)} · {searchQuery ? "Busca global" : periodLabel}
        {" · "}
        {selectedTimezone.label}
      </p>

      <details className="group relative">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          <span>Filtros</span>
          {activeFilterCount > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </summary>

        <div className="absolute top-[calc(100%+0.5rem)] right-0 z-50 max-h-[min(70dvh,560px)] w-[min(430px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_22px_60px_rgba(0,0,0,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                Filtrar conversas
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{rangeLabel}</p>
            </div>
            <Link
              className="text-xs font-semibold text-zinc-500 transition hover:text-zinc-950"
              href={resetHref}
            >
              Limpar filtros
            </Link>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold tracking-[0.18em] text-zinc-500 uppercase">
              Canal
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {channelFilters.map((filter) => (
                <ChannelFilterLink
                  active={channel === filter.value}
                  channel={filter.value}
                  href={buildHref({
                    basePath,
                    channel: filter.value,
                    clientSlug,
                    conversationId: null,
                    period,
                    searchQuery,
                    timezone,
                  })}
                  key={filter.label}
                />
              ))}
            </div>
          </div>

          <ConversationPeriodFilter
            basePath={basePath}
            channel={channel}
            clientSlug={clientSlug}
            period={period}
            rangeLabel={rangeLabel}
            searchQuery={searchQuery}
            timezone={timezone}
          />

          <div className="mt-3 border-t border-zinc-200/70 pt-3">
            <TimezoneSwitcher
              activeValue={timezone}
              buildHref={(nextTimezone) =>
                buildHref({
                  basePath,
                  channel,
                  clientSlug,
                  conversationId,
                  period,
                  searchQuery,
                  timezone: nextTimezone,
                })
              }
            />
          </div>
        </div>
      </details>
    </div>
  );
}

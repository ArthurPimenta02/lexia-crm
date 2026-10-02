import {
  dashboardPeriodOptions,
  getDateRange,
  type DashboardDateRange,
  type DashboardPeriod,
} from "@/lib/dashboard/date-range";

export type ConversationPeriod = DashboardPeriod | "tudo";

export type ConversationDateRange = Omit<DashboardDateRange, "key"> & {
  key: ConversationPeriod;
};

export const conversationPeriodOptions = [
  ...dashboardPeriodOptions,
  { key: "tudo", label: "Todo o período" },
] as const;

export function getConversationDateRange(
  period: string,
  customStart: string,
  customEnd: string,
  timeZone: string,
): ConversationDateRange {
  if (period !== "tudo") {
    return getDateRange(period, customStart, customEnd, timeZone);
  }

  const today = getDateRange("hoje", "", "", timeZone);

  return {
    end: today.end,
    key: "tudo",
    label: "Todo o período",
    start: new Date(0),
  };
}

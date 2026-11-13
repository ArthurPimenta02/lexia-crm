import {
  dashboardPeriodOptions,
  getDateRange,
  type DashboardDateRange,
  type DashboardPeriod,
} from "@/lib/dashboard/date-range";

// 13/11/2026: as conversas usam o mesmo filtro de todas as telas (que já traz "Período total").
export type ConversationPeriod = DashboardPeriod;

export type ConversationDateRange = Omit<DashboardDateRange, "key"> & {
  key: ConversationPeriod;
};

export const conversationPeriodOptions = dashboardPeriodOptions;

export function getConversationDateRange(
  period: string,
  customStart: string,
  customEnd: string,
  timeZone: string,
): ConversationDateRange {
  return getDateRange(period, customStart, customEnd, timeZone);
}

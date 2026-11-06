import Form from "next/form";
import { Check } from "lucide-react";

import { FormSubmitButton } from "@/app/components/form-submit-button";

import {
  getDateInputValue,
  getInclusiveRangeEnd,
} from "@/lib/dashboard/date-range";
import type { EstadoConversas } from "@/app/components/conversation-filter-bar";
import {
  type ConversationDateRange,
  type ConversationPeriod,
} from "@/lib/conversations/date-range";
import { getT } from "@/lib/i18n/servidor";

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

/** As datas do período "Personalizada", logo abaixo da barra de períodos. */
export async function ConversationCustomPeriodForm({
  estado,
}: {
  estado: EstadoConversas;
}) {
  const t = await getT();

  return (
    <Form
      action={estado.basePath}
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      replace
      scroll={false}
    >
      <input name="periodo" type="hidden" value="personalizado" />
      <input name="fuso" type="hidden" value={estado.fuso} />
      {estado.cliente ? (
        <input name="cliente" type="hidden" value={estado.cliente} />
      ) : null}
      {estado.canal ? (
        <input name="canal" type="hidden" value={estado.canal} />
      ) : null}
      {estado.busca ? (
        <input name="busca" type="hidden" value={estado.busca} />
      ) : null}
      {estado.situacao ? (
        <input name="situacao" type="hidden" value={estado.situacao} />
      ) : null}

      <label className="min-w-0">
        <span className="sr-only">{t("Início")}</span>
        <input
          className="ds-campo h-8 w-auto min-w-0 px-2 text-xs"
          defaultValue={estado.periodo.start}
          name="inicio"
          type="date"
        />
      </label>
      <label className="min-w-0">
        <span className="sr-only">{t("Fim")}</span>
        <input
          className="ds-campo h-8 w-auto min-w-0 px-2 text-xs"
          defaultValue={estado.periodo.end}
          name="fim"
          type="date"
        />
      </label>
      <FormSubmitButton
        aria-label={t("Aplicar período")}
        className="ds-botao ds-botao-primario ds-botao-p"
        pendingLabel="..."
        title={t("Aplicar período")}
      >
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        {t("Aplicar")}
      </FormSubmitButton>
    </Form>
  );
}

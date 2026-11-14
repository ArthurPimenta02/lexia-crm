import Link from "next/link";

import { dashboardPeriodOptions } from "@/lib/dashboard/date-range";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import type { Intervalo } from "@/lib/movel/resultados";

import { Personalizado } from "../resultados/personalizado";

/**
 * Os períodos do app: EXATAMENTE os do painel (Hoje · Ontem · Uma semana ·
 * Período total · Personalizado), lidos de `dashboardPeriodOptions`.
 */
export function Periodos({ caminho, hoje, intervalo, t }: { caminho: string; hoje: string; intervalo: Intervalo; t: FuncaoT }) {
  return (
    <nav aria-label={t("Período")} className="m6-chips">
      {dashboardPeriodOptions.map((o) =>
        o.key === "personalizado" ? (
          <Personalizado activo={intervalo.chave === "personalizado"} ate={intervalo.ate} caminho={caminho} de={intervalo.de} hoje={hoje} key={o.key} textos={{ aplicar: t("Ver resultados"), ate: t("Até"), de: t("De"), personalizado: t(o.label) }} />
        ) : (
          <Link aria-current={intervalo.chave === o.key ? "true" : undefined} className={`m6-chip${intervalo.chave === o.key ? " on" : ""}`} href={`${caminho}?p=${o.key}`} key={o.key} replace scroll={false}>{t(o.label)}</Link>
        ),
      )}
    </nav>
  );
}

import { redirect } from "next/navigation";

import { ResultadosFollowupTela } from "@/app/components/resultados-followup";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getSearchValue } from "@/lib/dashboard/date-range";
import { configResultados, getResultadosFollowup, type PeriodoResultados } from "@/lib/followups/resultados";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";

/** A mesma tela que o cliente vê em /app/followups, aberta pelo admin para um cliente. */
export default async function ResultadosFollowupAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string | string[] }>;
}) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const [t, idioma, params] = await Promise.all([getT(), getIdioma(), searchParams]);
  const slug = getSearchValue(params.cliente) || "detail_by_cordeiro";
  // Sempre os últimos 30 dias (Arthur, 21/11): é o ritmo atual do follow-up, sem filtro.
  const periodo: PeriodoResultados = configResultados(slug).diasDeDados === 60 ? "60d" : "30d";
  const r = await getResultadosFollowup(slug, periodo);

  return (
    <ResultadosFollowupTela
      locale={LOCALE_DO_IDIOMA[idioma]}
      periodo={periodo}
      r={r}
      t={t}
      timezone={getClientTimezone(slug)}
    />
  );
}

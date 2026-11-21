import { redirect } from "next/navigation";

import { ResultadosFollowupTela } from "@/app/components/resultados-followup";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { configResultados, getResultadosFollowup, type PeriodoResultados } from "@/lib/followups/resultados";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";

export default async function FollowupsPage() {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (!isClientRole(profile.role)) redirect("/admin");
  exigirEcra(profile.cliente_slug, "/app/followups");
  if (!profile.cliente_slug) redirect("/app");

  const [t, idioma] = await Promise.all([getT(), getIdioma()]);
  // Sempre os últimos 30 dias (Arthur, 21/11): é o ritmo atual do follow-up, sem filtro.
  const periodo: PeriodoResultados = configResultados(profile.cliente_slug).diasDeDados === 60 ? "60d" : "30d";
  const r = await getResultadosFollowup(profile.cliente_slug, periodo);

  return (
    <ResultadosFollowupTela
      locale={LOCALE_DO_IDIOMA[idioma]}
      periodo={periodo}
      r={r}
      t={t}
      timezone={getClientTimezone(profile.cliente_slug)}
    />
  );
}

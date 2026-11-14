import { redirect } from "next/navigation";

import { Desempenho, type AdminDashboardProps } from "@/app/admin/desempenho";
import { SecaoHoje } from "@/app/admin/hoje";
import { lerHoje } from "@/lib/admin/hoje";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Página inicial do admin (14/11/2026, desenho 2c aprovado): em cima "Hoje" —
 * o que precisa de atenção em cada cliente —, em baixo "Desempenho" — os
 * gráficos do painel anterior, com o filtro de período e de cliente.
 */
export default async function AdminPage({ searchParams }: AdminDashboardProps) {
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const hoje = await lerHoje(createAdminClient(), t);

  return (
    <div className="flex w-full min-w-0 flex-col gap-12">
      <SecaoHoje agora={hoje.agora} hoje={hoje} locale={locale} t={t} />
      <div className="border-t border-border pt-10">
        <Desempenho searchParams={searchParams} />
      </div>
    </div>
  );
}

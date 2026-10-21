import { redirect } from "next/navigation";

import { CampaignsPanel } from "@/app/components/campaigns-panel";
import { CampaignsRefreshButton } from "@/app/components/campaigns-refresh-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getPainelCampanhas } from "@/lib/campaigns/read";
import {
  getDateInputValue,
  getDateRange,
  getInclusiveRangeEnd,
  getSearchValue,
} from "@/lib/dashboard/date-range";
import { getClientTimezone } from "@/lib/clientes/timezone";

import { atualizarCampanhasAction } from "./actions";

type CampanhasPageProps = {
  searchParams: Promise<{
    fim?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

export default async function CampanhasPage({
  searchParams,
}: CampanhasPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/campanhas");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const clienteSlug = profile.cliente_slug;
  const timezone = getClientTimezone(clienteSlug);
  const params = await searchParams;
  /*
   * "hoje" como em todo o resto do produto, com uma ressalva que vale a pena
   * saber: o gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC (ver o
   * cron no `vercel.json`). O número de hoje é o que havia à hora da
   * sincronização e não acompanha o dia — só fecha na corrida seguinte. Quem
   * quiser o gasto consolidado escolhe "Este mês" no filtro.
   */
  const range = getDateRange(
    getSearchValue(params.periodo) || "hoje",
    getSearchValue(params.inicio),
    getSearchValue(params.fim),
    timezone,
  );

  const inicio = getDateInputValue(range.start, timezone);
  const fim = getDateInputValue(getInclusiveRangeEnd(range.end), timezone);

  const painel = await getPainelCampanhas({
    clienteSlug,
    fim,
    fimIso: range.end.toISOString(),
    inicio,
    inicioIso: range.start.toISOString(),
    timezone,
  });

  const atualizadoEm = painel.atualizadoEm
    ? new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        timeZone: timezone,
      }).format(new Date(painel.atualizadoEm))
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PaginaCabecalho
        acoes={
          <CampaignsRefreshButton
            action={atualizarCampanhasAction}
            atualizadoEm={atualizadoEm}
          />
        }
        titulo="Campanhas"
      />

      <CampaignsPanel
        basePath="/app/campanhas"
        fim={fim}
        inicio={inicio}
        painel={painel}
        periodKey={range.key}
        rangeLabel={range.label}
        timezone={timezone}
        vazioMensagem={
          'Carrega em "Atualizar dados" para puxar o histórico da Meta. Se continuar vazio, a conta de anúncios ainda não está ligada a esta empresa.'
        }
      />
    </div>
  );
}

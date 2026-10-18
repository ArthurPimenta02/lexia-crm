import { redirect } from "next/navigation";

import { AgendaPanel } from "@/app/components/agenda-panel";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getAgendaSemana } from "@/lib/agenda/read";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getServicosConfig } from "@/lib/servicos/config";

export const metadata = {
  title: "Agenda",
};

const primeiro = (valor: string | string[] | undefined) =>
  (Array.isArray(valor) ? valor[0] : valor) ?? "";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    executor?: string | string[];
    semana?: string | string[];
  }>;
}) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const params = await searchParams;
  const executor = primeiro(params.executor);
  const timeZone = getClientTimezone(profile.cliente_slug);

  const agenda = await getAgendaSemana({
    clienteSlug: profile.cliente_slug,
    dia: primeiro(params.semana) || undefined,
    executor: executor || undefined,
    timeZone,
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <PaginaCabecalho titulo="Agenda" />

      {agenda.erro ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          {agenda.erro}
        </p>
      ) : (
        <AgendaPanel
          agenda={agenda}
          executorEscolhido={executor}
          // Sem catálogo não se sabe a moeda, e escrever "EUR" para um
          // cliente de Boston era inventar. A Miranda não tem `valor_previsto`
          // em linha nenhuma, por isso não se perde nada.
          moeda={getServicosConfig(profile.cliente_slug)?.moeda ?? null}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}

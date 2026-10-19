import { redirect } from "next/navigation";

import { marcarNaAgendaAction } from "@/app/app/agenda/actions";
import {
  AgendaPanel,
  type MarcarNaAgenda,
} from "@/app/components/agenda-panel";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { marcarEstaLigado } from "@/lib/agenda/marcar";
import { getAgenda, VISTAS, type Vista } from "@/lib/agenda/read";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getContactosParaEscolha } from "@/lib/clientes/read";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getServicosConfig } from "@/lib/servicos/config";
import { getServicosAgendaveis } from "@/lib/servicos/read";

export const metadata = {
  title: "Agenda",
};

const primeiro = (valor: string | string[] | undefined) =>
  (Array.isArray(valor) ? valor[0] : valor) ?? "";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    dia?: string | string[];
    executor?: string | string[];
    vista?: string | string[];
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

  // Um `?vista=` que não conhecemos cai na semana em vez de rebentar: o
  // endereço é partilhado por quem o copia da barra, e já cá chegou um
  // `?semana=` do nome antigo do parâmetro.
  const pedida = primeiro(params.vista);
  const vista: Vista = (VISTAS as readonly string[]).includes(pedida)
    ? (pedida as Vista)
    : "semana";

  const agenda = await getAgenda({
    clienteSlug: profile.cliente_slug,
    dia: primeiro(params.dia) || undefined,
    executor: executor || undefined,
    timeZone,
    vista,
  });

  /*
   * Marcar só aparece quando as três condições se verificam, e as leituras só
   * acontecem nesse caso.
   *
   * - `cliente_admin`: é o que a server action exige, e um formulário que
   *   devolvia sempre "sessão sem permissão" era pior do que não existir.
   * - `marcarEstaLigado()`: sem a porta para o n8n configurada não há como
   *   escrever no Google, e escrever só nesta tabela punha o agente a oferecer
   *   a mesma hora a outra pessoa.
   * - serviços agendáveis: sem catálogo de agendamento não há duração nem
   *   preço, e é a Miranda — que não tem `clientConfigs`.
   */
  const podeMarcar =
    profile.role === "cliente_admin" && !agenda.erro && marcarEstaLigado();

  const [contactos, servicos] = podeMarcar
    ? await Promise.all([
        getContactosParaEscolha(profile.cliente_slug),
        getServicosAgendaveis(profile.cliente_slug),
      ])
    : [[], []];

  const marcar: MarcarNaAgenda | null =
    servicos.length > 0 && contactos.length > 0
      ? { action: marcarNaAgendaAction, contactos, servicos }
      : null;

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
          marcar={marcar}
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

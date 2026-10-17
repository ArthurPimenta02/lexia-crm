import Form from "next/form";
import { redirect } from "next/navigation";

import { CampaignsPanel } from "@/app/components/campaigns-panel";
import { CampaignsRefreshButton } from "@/app/components/campaigns-refresh-button";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getPainelCampanhas } from "@/lib/campaigns/read";
import {
  getDateInputValue,
  getDateRange,
  getInclusiveRangeEnd,
  getSearchValue,
} from "@/lib/dashboard/date-range";
import { getMetaAdsAccountEnvName, getMetaAdsConfig } from "@/lib/meta/ads";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { createClient } from "@/lib/supabase/server";

import { atualizarCampanhasAdminAction } from "./actions";

type AdminCliente = {
  id: string;
  nome: string | null;
  slug: string;
};

type AdminCampanhasPageProps = {
  searchParams: Promise<{
    cliente?: string | string[];
    fim?: string | string[];
    inicio?: string | string[];
    periodo?: string | string[];
  }>;
};

export default async function AdminCampanhasPage({
  searchParams,
}: AdminCampanhasPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const params = await searchParams;
  const periodo = getSearchValue(params.periodo) || "mes";
  const customStart = getSearchValue(params.inicio);
  const customEnd = getSearchValue(params.fim);
  const clientePedido = getSearchValue(params.cliente);
  const supabase = await createClient();

  const { data: clientesData, error: clientesError } = await supabase
    .from("lexia_clientes")
    .select("id, nome, slug")
    .eq("status", "ativo")
    .order("nome");

  if (clientesError) {
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clientes = (clientesData ?? []) as AdminCliente[];
  const clienteSelecionado =
    clientes.find((cliente) => cliente.slug === clientePedido) ??
    clientes[0] ??
    null;

  const cabecalho = <PaginaCabecalho titulo="Campanhas" />;

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {cabecalho}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Nenhum cliente activo disponível.
        </div>
      </div>
    );
  }

  const clienteSlug = clienteSelecionado.slug;
  const timezone = getClientTimezone(clienteSlug);
  // Padrão "mes": o gasto do dia corrente está sempre incompleto.
  const range = getDateRange(periodo, customStart, customEnd, timezone);
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

  // Quem não tem conta ligada não é uma avaria: é um cliente que ainda não
  // anuncia. Dizer qual variável falta poupa a adivinhar a convenção do nome.
  const temContaLigada = getMetaAdsConfig(clienteSlug) !== null;
  const nomesSemConta = new Set(
    clientes
      .filter((cliente) => getMetaAdsConfig(cliente.slug) === null)
      .map((cliente) => cliente.slug),
  );

  const selectorDeCliente = (
    <Form
      action="/admin/campanhas"
      className="flex min-w-0 flex-wrap items-end gap-2"
      replace
      scroll={false}
    >
      <label
        className="flex min-w-0 flex-col gap-2 text-sm font-semibold text-foreground"
        htmlFor="cliente"
      >
        Cliente
        <select
          className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm font-normal tracking-normal text-foreground normal-case outline-none transition focus:border-foreground sm:min-w-56"
          defaultValue={clienteSlug}
          id="cliente"
          name="cliente"
        >
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.slug}>
              {cliente.nome ?? cliente.slug}
              {nomesSemConta.has(cliente.slug) ? " (sem conta ligada)" : ""}
            </option>
          ))}
        </select>
      </label>
      <input name="periodo" type="hidden" value={range.key} />
      {range.key === "personalizado" ? (
        <>
          <input name="inicio" type="hidden" value={inicio} />
          <input name="fim" type="hidden" value={fim} />
        </>
      ) : null}
      <FormSubmitButton
        className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
        pendingLabel="..."
      >
        Selecionar
      </FormSubmitButton>
    </Form>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PaginaCabecalho
        acoes={
          <CampaignsRefreshButton
            action={atualizarCampanhasAdminAction}
            atualizadoEm={atualizadoEm}
            clienteSlug={clienteSlug}
          />
        }
        titulo="Campanhas"
      />

      <CampaignsPanel
        basePath="/admin/campanhas"
        fim={fim}
        inicio={inicio}
        leading={selectorDeCliente}
        painel={painel}
        parametrosFixos={{ cliente: clienteSlug }}
        periodKey={range.key}
        rangeLabel={range.label}
        timezone={timezone}
        vazioMensagem={
          temContaLigada
            ? 'Este cliente tem conta de anúncios ligada, mas ainda não há gasto gravado. Carrega em "Atualizar dados" para puxar o histórico da Meta.'
            : `Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente ${getMetaAdsAccountEnvName(clienteSlug)}.`
        }
      />
    </div>
  );
}

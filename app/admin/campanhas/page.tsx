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
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { getMetaAdsConfig, getMetaAdsVariaveisEmFalta } from "@/lib/meta/ads";
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

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const params = await searchParams;
  const periodo = getSearchValue(params.periodo) || "hoje";
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
    throw new Error(t("Não foi possível buscar os clientes."));
  }

  const clientes = (clientesData ?? []) as AdminCliente[];
  const clienteSelecionado =
    clientes.find((cliente) => cliente.slug === clientePedido) ??
    clientes[0] ??
    null;

  const cabecalho = <PaginaCabecalho titulo={t("Campanhas")} />;

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {cabecalho}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          {t("Nenhum cliente ativo disponível.")}
        </div>
      </div>
    );
  }

  const clienteSlug = clienteSelecionado.slug;
  const timezone = getClientTimezone(clienteSlug);
  /*
   * "hoje" como em todo o resto do produto, com a mesma ressalva do ecrã do
   * cliente: o gasto da Meta sincroniza uma vez por dia, às 06:00 UTC, por
   * isso o número de hoje não acompanha o dia. "Este mês" dá o consolidado.
   */
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
    ? new Intl.DateTimeFormat(locale, {
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
  // Podem faltar duas: a conta e o token. Listar as duas evita o caminho em que
  // alguém cria a conta, continua sem dados, e não sabe o que mais lhe falta.
  const variaveisEmFalta = getMetaAdsVariaveisEmFalta(clienteSlug);
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
        {t("Cliente")}
        <select
          className="ds-campo min-w-0 font-normal tracking-normal normal-case sm:min-w-56"
          defaultValue={clienteSlug}
          id="cliente"
          name="cliente"
        >
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.slug}>
              {cliente.nome ?? cliente.slug}
              {nomesSemConta.has(cliente.slug)
                ? ` ${t("(sem conta ligada)")}`
                : ""}
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
        className="ds-botao ds-botao-primario shrink-0"
        pendingLabel="..."
      >
        {t("Selecionar")}
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
        titulo={t("Campanhas")}
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
            ? t(
                'Este cliente tem conta de anúncios ligada, mas ainda não há gasto salvo. Clique em "Atualizar dados" para puxar o histórico da Meta.',
              )
            : variaveisEmFalta.length > 1
              ? t(
                  "Este cliente não tem conta de anúncios ligada. Faltam as variáveis de ambiente {variaveis}.",
                  { variaveis: variaveisEmFalta.join(` ${t("e")} `) },
                )
              : t(
                  "Este cliente não tem conta de anúncios ligada. Falta a variável de ambiente {variavel}.",
                  { variavel: variaveisEmFalta.join("") },
                )
        }
      />
    </div>
  );
}

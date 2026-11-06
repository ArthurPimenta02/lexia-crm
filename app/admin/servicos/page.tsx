import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { ServicosPanel } from "@/app/components/servicos-panel";
import { CabecalhoTela, VazioTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import {
  getServicosAgendaveisConfig,
  getServicosConfig,
} from "@/lib/servicos/config";
import { getPainelServicos } from "@/lib/servicos/read";
import { createClient } from "@/lib/supabase/server";

import {
  definirReceitaAdminAction,
  excluirServicoAdminAction,
  gravarServicoAdminAction,
  registarExecucaoAdminAction,
  reporServicoAdminAction,
} from "./actions";

type AdminCliente = {
  id: string;
  nome: string | null;
  slug: string;
};

type AdminServicosPageProps = {
  searchParams: Promise<{
    categoria?: string | string[];
    cliente?: string | string[];
    escalao?: string | string[];
  }>;
};

function lerParametro(valor: string | string[] | undefined) {
  if (Array.isArray(valor)) {
    return valor[0] ?? "";
  }

  return valor ?? "";
}

export default async function AdminServicosPage({
  searchParams,
}: AdminServicosPageProps) {
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
  const clientePedido = lerParametro(params.cliente);
  const escalaoPedido = lerParametro(params.escalao);
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
  // Preferir um cliente que tenha catálogo ligado: abrir num cliente sem
  // serviços mostraria um ecrã vazio sem o problema ser do ecrã.
  const clienteSelecionado =
    clientes.find((cliente) => cliente.slug === clientePedido) ??
    clientes.find((cliente) => getServicosConfig(cliente.slug) !== null) ??
    clientes[0] ??
    null;

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <CabecalhoTela resto={t("Serviços")} />
        <div className="ds-bloco">
          <VazioTela titulo={t("Nenhum cliente ativo disponível.")} />
        </div>
      </div>
    );
  }

  const clienteSlug = clienteSelecionado.slug;
  const painel = await getPainelServicos({
    clienteSlug,
    escalao: escalaoPedido || undefined,
  });

  // Quem só tem tabela de agendamento também aparece com serviços, só que
  // sem deixar mexer — por isso não entra aqui.
  const semCatalogo = new Set(
    clientes
      .filter(
        (cliente) =>
          getServicosConfig(cliente.slug) === null &&
          !getServicosAgendaveisConfig(cliente.slug)?.catalogo,
      )
      .map((cliente) => cliente.slug),
  );

  const selectorDeCliente = (
    <Form
      action="/admin/servicos"
      className="flex min-w-0 flex-wrap items-center gap-2"
      replace
      scroll={false}
    >
      <label className="sr-only" htmlFor="cliente">
        {t("Cliente")}
      </label>
      <select
          className="ds-campo w-auto min-w-0 sm:min-w-56"
          defaultValue={clienteSlug}
          id="cliente"
          name="cliente"
        >
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.slug}>
              {cliente.nome ?? cliente.slug}
              {semCatalogo.has(cliente.slug)
                ? ` ${t("(sem catálogo ligado)")}`
                : ""}
            </option>
          ))}
        </select>
      <input name="escalao" type="hidden" value={painel.escalaoActivo} />
      <FormSubmitButton
        className="ds-botao ds-botao-secundario"
        pendingLabel="..."
      >
        {t("Selecionar")}
      </FormSubmitButton>
    </Form>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <ServicosPanel
        action={gravarServicoAdminAction}
        actionExcluir={excluirServicoAdminAction}
        actionExecucao={registarExecucaoAdminAction}
        actionReceita={definirReceitaAdminAction}
        actionRepor={reporServicoAdminAction}
        basePath="/admin/servicos"
        categoria={lerParametro(params.categoria) || undefined}
        clienteSlug={clienteSlug}
        leading={selectorDeCliente}
        locale={locale}
        painel={painel}
        parametrosFixos={{ cliente: clienteSlug }}
        podeEditar={!painel.somenteLeitura}
        sobretitulo={`${clienteSelecionado.nome ?? clienteSlug} · ${t("Serviços")}`}
        t={t}
      />
    </div>
  );
}

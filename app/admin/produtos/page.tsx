import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { ProdutosPanel } from "@/app/components/produtos-panel";
import { CabecalhoTela, VazioTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getT } from "@/lib/i18n/servidor";
import {
  getProdutos,
  getProdutosExcluidos,
  getServicosPorProduto,
} from "@/lib/produtos/read";
import { getServicosConfig } from "@/lib/servicos/config";
import { getServicosSimples } from "@/lib/servicos/read";
import { createClient } from "@/lib/supabase/server";

import {
  criarProdutoAdminAction,
  definirReceitaDoProdutoAdminAction,
  excluirProdutoAdminAction,
  registarAjusteAdminAction,
  registarCompraAdminAction,
  reporProdutoAdminAction,
} from "./actions";

type AdminCliente = {
  id: string;
  nome: string | null;
  slug: string;
};

export default async function AdminProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string | string[] }>;
}) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const t = await getT();
  const params = await searchParams;
  const pedido = Array.isArray(params.cliente)
    ? (params.cliente[0] ?? "")
    : (params.cliente ?? "");

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
    clientes.find((cliente) => cliente.slug === pedido) ?? clientes[0] ?? null;

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <CabecalhoTela resto={t("Produtos")} />
        <div className="ds-bloco">
          <VazioTela titulo={t("Nenhum cliente ativo disponível.")} />
        </div>
      </div>
    );
  }

  const clienteSlug = clienteSelecionado.slug;
  const [produtos, servicos, excluidos] = await Promise.all([
    getProdutos(clienteSlug),
    getServicosSimples(clienteSlug),
    getProdutosExcluidos(clienteSlug),
  ]);

  const servicosPorProduto = await getServicosPorProduto(
    clienteSlug,
    produtos,
    new Map(servicos.map((servico) => [servico.id, servico.nome])),
  );

  const moeda = getServicosConfig(clienteSlug)?.moeda ?? "EUR";

  const selectorDeCliente = (
    <Form
      action="/admin/produtos"
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
          </option>
        ))}
      </select>
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
      <ProdutosPanel
        actionAjuste={registarAjusteAdminAction}
        actionCompra={registarCompraAdminAction}
        actionCriar={criarProdutoAdminAction}
        actionExcluir={excluirProdutoAdminAction}
        actionReceita={definirReceitaDoProdutoAdminAction}
        actionRepor={reporProdutoAdminAction}
        clienteSlug={clienteSlug}
        excluidos={excluidos}
        leading={selectorDeCliente}
        moeda={moeda}
        podeEditar
        produtos={produtos}
        servicos={servicos}
        servicosPorProduto={servicosPorProduto}
        sobretitulo={`${clienteSelecionado.nome ?? clienteSlug} · ${t("Produtos")}`}
        timeZone={getClientTimezone(clienteSlug)}
      />
    </div>
  );
}

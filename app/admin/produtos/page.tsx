import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { ProdutosPanel } from "@/app/components/produtos-panel";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
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
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clientes = (clientesData ?? []) as AdminCliente[];

  const cabecalho = <PaginaCabecalho titulo="Produtos" />;

  const clienteSelecionado =
    clientes.find((cliente) => cliente.slug === pedido) ?? clientes[0] ?? null;

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {cabecalho}
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          Nenhum cliente activo disponível.
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
    <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <Form
        action="/admin/produtos"
        className="flex flex-wrap items-end gap-2"
        replace
        scroll={false}
      >
        <label
          className="flex flex-col gap-2 text-sm font-semibold text-foreground"
          htmlFor="cliente"
        >
          Cliente
          <select
            className="h-10 min-w-56 rounded-2xl border border-border-strong bg-surface px-3 text-sm font-normal tracking-normal text-foreground normal-case outline-none transition focus:border-foreground"
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
        </label>
        <FormSubmitButton
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          pendingLabel="..."
        >
          Selecionar
        </FormSubmitButton>
      </Form>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {cabecalho}

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
        timeZone={getClientTimezone(clienteSlug)}
      />
    </div>
  );
}

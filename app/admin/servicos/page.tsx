import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { ServicosPanel } from "@/app/components/servicos-panel";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getServicosConfig } from "@/lib/servicos/config";
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
    throw new Error("Não foi possível buscar os clientes.");
  }

  const clientes = (clientesData ?? []) as AdminCliente[];
  // Preferir um cliente que tenha catálogo ligado: abrir num cliente sem
  // serviços mostraria um ecrã vazio sem o problema ser do ecrã.
  const clienteSelecionado =
    clientes.find((cliente) => cliente.slug === clientePedido) ??
    clientes.find((cliente) => getServicosConfig(cliente.slug) !== null) ??
    clientes[0] ??
    null;

  const cabecalho = (
    <div>
      <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
        Serviços
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
        Custo e margem por serviço
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600">
        Preço e duração vêm da base de dados do cliente. A receita de produtos
        de cada serviço vive na Lexia, e é dela que sai o custo de produto e a
        margem.
      </p>
    </div>
  );

  if (!clienteSelecionado) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {cabecalho}
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-8 text-center text-sm text-zinc-600 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          Nenhum cliente activo disponível.
        </div>
      </div>
    );
  }

  const clienteSlug = clienteSelecionado.slug;
  const painel = await getPainelServicos({
    clienteSlug,
    escalao: escalaoPedido || undefined,
  });

  const semCatalogo = new Set(
    clientes
      .filter((cliente) => getServicosConfig(cliente.slug) === null)
      .map((cliente) => cliente.slug),
  );

  const selectorDeCliente = (
    <Form
      action="/admin/servicos"
      className="flex flex-wrap items-end gap-2"
      replace
      scroll={false}
    >
      <label
        className="flex flex-col gap-2 text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase"
        htmlFor="cliente"
      >
        Cliente
        <select
          className="h-10 min-w-56 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal tracking-normal text-zinc-900 normal-case outline-none transition focus:border-zinc-950"
          defaultValue={clienteSlug}
          id="cliente"
          name="cliente"
        >
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.slug}>
              {cliente.nome ?? cliente.slug}
              {semCatalogo.has(cliente.slug) ? " (sem catálogo ligado)" : ""}
            </option>
          ))}
        </select>
      </label>
      <input name="escalao" type="hidden" value={painel.escalaoActivo} />
      <FormSubmitButton
        className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
        pendingLabel="..."
      >
        Selecionar
      </FormSubmitButton>
    </Form>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {cabecalho}
      </div>

      <ServicosPanel
        action={gravarServicoAdminAction}
        actionExcluir={excluirServicoAdminAction}
        actionExecucao={registarExecucaoAdminAction}
        actionReceita={definirReceitaAdminAction}
        actionRepor={reporServicoAdminAction}
        basePath="/admin/servicos"
        clienteSlug={clienteSlug}
        leading={selectorDeCliente}
        painel={painel}
        parametrosFixos={{ cliente: clienteSlug }}
        podeEditar
      />
    </div>
  );
}

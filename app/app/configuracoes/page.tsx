import Link from "next/link";
import { redirect } from "next/navigation";

import { PaginaCabecalho } from "@/app/components/painel-ui";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type LexiaClient = {
  nome: string | null;
  slug: string;
  status: string | null;
  modo_teste: boolean | null;
  cor_principal: string | null;
};

type LexiaWorkflow = {
  id: string;
  nome: string | null;
  tipo: string | null;
  status: string | null;
};

function InfoItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 break-words font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function formatLabel(value: string | null) {
  if (!value) {
    return "Sem valor";
  }

  return value.replaceAll("_", " ");
}

export default async function ClientSettingsPage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/configuracoes");

  const clienteSlug = profile.cliente_slug;
  const supabase = await createClient();

  const [
    { data: client, error: clientError },
    { data: activeWorkflowsData, error: workflowError },
  ] = await Promise.all([
    clienteSlug
      ? supabase
          .from("lexia_clientes")
          .select("nome, slug, status, modo_teste, cor_principal")
          .eq("slug", clienteSlug)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    clienteSlug
      ? supabase
          .from("lexia_workflows")
          .select("id, nome, tipo, status")
          .eq("cliente_slug", clienteSlug)
          .eq("status", "ativo")
          .order("nome")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clientError) {
    throw new Error("Não foi possível buscar os dados do cliente.");
  }

  if (workflowError) {
    throw new Error("Não foi possível buscar o workflow ativo.");
  }

  const clientData = client as LexiaClient | null;
  const activeWorkflows = (activeWorkflowsData ?? []) as LexiaWorkflow[];

  return (
    <section className="flex w-full max-w-5xl flex-col gap-6">
      <PaginaCabecalho titulo="Configurações" />

      {clientData?.modo_teste ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          O agente está em modo teste. Use a Área de testes para simular
          conversas antes da produção.
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Cliente</h2>
          <Link
            className="h-10 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            href="/app/area-testes"
          >
            Ir para Área de testes
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoItem label="Nome">{clientData?.nome ?? "Sem nome"}</InfoItem>
          <InfoItem label="Slug">
            {clientData?.slug ?? clienteSlug ?? "Sem cliente"}
          </InfoItem>
          <InfoItem label="Status">
            {clientData?.status ?? "Sem status"}
          </InfoItem>
          <InfoItem label="Modo teste">
            {clientData?.modo_teste ? "Ativo" : "Inativo"}
          </InfoItem>
          <InfoItem label="Cor principal">
            <div className="flex items-center gap-2">
              {clientData?.cor_principal ? (
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-border-strong"
                  style={{ backgroundColor: clientData.cor_principal }}
                />
              ) : null}
              <span>{clientData?.cor_principal ?? "Sem cor"}</span>
            </div>
          </InfoItem>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Workflows ativos</h2>
        {activeWorkflows.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {activeWorkflows.map((workflow) => (
              <div
                className="rounded-lg border border-border p-4"
                key={workflow.id}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <InfoItem label="Nome">
                    {workflow.nome ?? "Sem nome"}
                  </InfoItem>
                  <InfoItem label="Tipo">
                    {workflow.tipo ?? "Sem tipo"}
                  </InfoItem>
                  <InfoItem label="Status">
                    {workflow.status ?? "Sem status"}
                  </InfoItem>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum workflow ativo configurado.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">Acesso do usuário</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InfoItem label="Role">{formatLabel(profile.role)}</InfoItem>
          <InfoItem label="Status do vínculo">
            {formatLabel(profile.status)}
          </InfoItem>
        </div>
      </section>
    </section>
  );
}

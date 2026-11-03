import Link from "next/link";
import { redirect } from "next/navigation";

import { PaginaCabecalho } from "@/app/components/painel-ui";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

function formatLabel(value: string | null, t: FuncaoT) {
  if (!value) {
    return t("Sem valor");
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
  const t = await getT();
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
      <PaginaCabecalho titulo={t("Configurações")} />

      {clientData?.modo_teste ? (
        <div className="rounded-lg border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          {t(
            "O agente está em modo teste. Use a Área de testes para simular conversas antes da produção.",
          )}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("Cliente")}</h2>
          <Link
            className="ds-botao ds-botao-primario w-fit"
            href="/app/area-testes"
          >
            {t("Ir para Área de testes")}
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <InfoItem label={t("Nome")}>{clientData?.nome ?? t("Sem nome")}</InfoItem>
          <InfoItem label="Slug">
            {clientData?.slug ?? clienteSlug ?? t("Sem cliente")}
          </InfoItem>
          <InfoItem label={t("Status")}>
            {clientData?.status ?? t("Sem status")}
          </InfoItem>
          <InfoItem label={t("Modo teste")}>
            {clientData?.modo_teste ? t("Ativo") : t("Inativo")}
          </InfoItem>
          <InfoItem label={t("Cor principal")}>
            <div className="flex items-center gap-2">
              {clientData?.cor_principal ? (
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-border-strong"
                  style={{ backgroundColor: clientData.cor_principal }}
                />
              ) : null}
              <span>{clientData?.cor_principal ?? t("Sem cor")}</span>
            </div>
          </InfoItem>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-foreground">{t("Workflows ativos")}</h2>
        {activeWorkflows.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {activeWorkflows.map((workflow) => (
              <div
                className="rounded-lg border border-border p-4"
                key={workflow.id}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <InfoItem label={t("Nome")}>
                    {workflow.nome ?? t("Sem nome")}
                  </InfoItem>
                  <InfoItem label={t("Tipo")}>
                    {workflow.tipo ?? t("Sem tipo")}
                  </InfoItem>
                  <InfoItem label={t("Status")}>
                    {workflow.status ?? t("Sem status")}
                  </InfoItem>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("Nenhum workflow ativo configurado.")}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-foreground">{t("Acesso do usuário")}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InfoItem label={t("Role")}>{formatLabel(profile.role, t)}</InfoItem>
          <InfoItem label={t("Status do vínculo")}>
            {formatLabel(profile.status, t)}
          </InfoItem>
        </div>
      </section>
    </section>
  );
}

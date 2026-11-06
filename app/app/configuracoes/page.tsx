import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowUpRight, Workflow } from "lucide-react";

import { AvisoLinha, CabecalhoTela, VazioTela } from "@/app/components/tela";
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
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
  const nome = clientData?.nome ?? clientData?.slug ?? clienteSlug ?? null;

  return (
    <section className="flex w-full max-w-5xl flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-primario" href="/app/area-testes">
            {t("Ir para Área de testes")}
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        }
        destaque={nome ?? undefined}
        resto={
          !clientData
            ? t("Configurações")
            : clientData.modo_teste
              ? t("em modo teste.")
              : clientData.status === "ativo"
                ? t("no ar.")
                : formatLabel(clientData.status, t)
        }
        sobretitulo={t("Configurações")}
        subtitulo={
          activeWorkflows.length === 1
            ? t("1 workflow ativo")
            : t("{n} workflows ativos", { n: activeWorkflows.length })
        }
      />

      {clientData?.modo_teste ? (
        <AvisoLinha acao={<Link href="/app/area-testes">{t("Abrir")}</Link>}>
          {t(
            "O agente está em modo teste. Use a Área de testes para simular conversas antes da produção.",
          )}
        </AvisoLinha>
      ) : null}

      <section className="ds-bloco p-5">
        <h2 className="ds-titulo-3 text-foreground">{t("Cliente")}</h2>

        <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-5">
          <InfoItem label={t("Nome")}>
            {clientData?.nome ?? t("Sem nome")}
          </InfoItem>
          <InfoItem label="Slug">
            <span className="font-mono text-sm">
              {clientData?.slug ?? clienteSlug ?? t("Sem cliente")}
            </span>
          </InfoItem>
          <InfoItem label={t("Status")}>
            {clientData?.status ? (
              <span
                className={`ds-selo ds-selo-ponto ${
                  clientData.status === "ativo"
                    ? "ds-selo-verde"
                    : "ds-selo-neutro"
                }`}
              >
                {clientData.status}
              </span>
            ) : (
              t("Sem status")
            )}
          </InfoItem>
          <InfoItem label={t("Modo teste")}>
            <span
              className={`ds-selo ${
                clientData?.modo_teste ? "ds-selo-alerta" : "ds-selo-neutro"
              }`}
            >
              {clientData?.modo_teste ? t("Ativo") : t("Inativo")}
            </span>
          </InfoItem>
          <InfoItem label={t("Cor principal")}>
            <div className="flex items-center gap-2">
              {clientData?.cor_principal ? (
                <span
                  className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border-strong"
                  style={{ backgroundColor: clientData.cor_principal }}
                />
              ) : null}
              <span className="font-mono text-sm">
                {clientData?.cor_principal ?? t("Sem cor")}
              </span>
            </div>
          </InfoItem>
        </div>
      </section>

      <section className="ds-bloco p-2">
        <h2 className="ds-titulo-3 px-3 pt-3 pb-2 text-foreground">
          {t("Workflows ativos")}
        </h2>
        {activeWorkflows.length > 0 ? (
          <div className="tela-lista">
            {activeWorkflows.map((workflow) => (
              <div className="tela-linha" key={workflow.id}>
                <span className="ds-chip-icone">
                  <Workflow aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {workflow.nome ?? t("Sem nome")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {workflow.tipo ?? t("Sem tipo")}
                  </p>
                </div>
                <span
                  className={`ds-selo ds-selo-ponto shrink-0 ${
                    workflow.status === "ativo"
                      ? "ds-selo-verde"
                      : "ds-selo-neutro"
                  }`}
                >
                  {workflow.status ?? t("Sem status")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <VazioTela titulo={t("Nenhum workflow ativo configurado.")} />
        )}
      </section>

      <section className="ds-bloco p-5">
        <h2 className="ds-titulo-3 text-foreground">
          {t("Acesso do usuário")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InfoItem label={t("Role")}>{formatLabel(profile.role, t)}</InfoItem>
          <InfoItem label={t("Status do vínculo")}>
            {formatLabel(profile.status, t)}
          </InfoItem>
        </div>
      </section>
    </section>
  );
}

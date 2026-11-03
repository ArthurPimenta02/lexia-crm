import Form from "next/form";
import { redirect } from "next/navigation";

import { ConexaoForm } from "@/app/admin/conexoes/conexao-form";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { tiposDoAmbito } from "@/lib/conexoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Conexões de cada agente: onde o Arthur cola os tokens de WhatsApp, Meta,
 * Redis e bases, e escolhe a agenda. O agente em código lê daqui.
 *
 * O servidor nunca manda um segredo para o navegador: só `campos` (o que não
 * é segredo) e `finais` (os 4 últimos caracteres). A coluna `segredos` nem é
 * pedida à base nesta página.
 */

type ConexoesPageProps = {
  searchParams: Promise<{ cliente?: string | string[] }>;
};

const GLOBAL = "__lexia";

type LinhaConexao = {
  tipo: string;
  campos: Record<string, string> | null;
  finais: Record<string, string> | null;
  atualizado_em: string | null;
};

export default async function ConexoesPage({ searchParams }: ConexoesPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const pedido = Array.isArray(params.cliente) ? (params.cliente[0] ?? "") : (params.cliente ?? "");

  const admin = createAdminClient();
  const { data: clientesData } = await admin
    .from("lexia_clientes")
    .select("slug, nome")
    .order("nome");
  const clientes = (clientesData ?? []) as { slug: string; nome: string | null }[];

  const selecionado =
    pedido === GLOBAL || clientes.some((c) => c.slug === pedido) ? pedido : "";
  const global = selecionado === GLOBAL;

  let linhas: LinhaConexao[] = [];
  let faltaMigration = false;
  if (selecionado) {
    let consulta = admin.from("lexia_conexoes").select("tipo, campos, finais, atualizado_em");
    consulta = global ? consulta.is("cliente_slug", null) : consulta.eq("cliente_slug", selecionado);
    const { data, error } = await consulta;
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") faltaMigration = true;
      else throw new Error("Não foi possível buscar as conexões.");
    }
    linhas = (data ?? []) as LinhaConexao[];
  }

  const tipos = tiposDoAmbito(global ? "global" : "cliente");

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo={t("Conexões")} />

      <Form
        action="/admin/conexoes"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        <label className="flex min-w-[260px] flex-col gap-2 text-sm font-medium text-muted-foreground">
          {t("De quem são as conexões")}
          <select
            className="ds-campo"
            defaultValue={selecionado}
            name="cliente"
          >
            <option value="">{t("Escolha…")}</option>
            <option value={GLOBAL}>{t("Lexia (vale para todos os clientes)")}</option>
            {clientes.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome || c.slug}
              </option>
            ))}
          </select>
        </label>
        <FormSubmitButton
          className="ds-botao ds-botao-primario"
          pendingLabel={t("Aguarde...")}
        >
          {t("Abrir")}
        </FormSubmitButton>
      </Form>

      {!selecionado ? (
        <p className="text-sm text-muted-foreground">
          {t("Escolha um cliente para ver e salvar as conexões dele.")}
        </p>
      ) : faltaMigration ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "A tabela de conexões ainda não existe. Falta rodar a migration da Fase 19 no Supabase central.",
          )}
        </p>
      ) : (
        <div className="grid gap-4">
          {tipos.map((definicao) => {
            const linha = linhas.find((l) => l.tipo === definicao.tipo);
            return (
              <ConexaoForm
                atualizadoEm={
                  linha?.atualizado_em
                    ? new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(linha.atualizado_em))
                    : null
                }
                campos={linha?.campos ?? {}}
                clienteSlug={global ? "" : selecionado}
                definicao={definicao}
                finais={linha?.finais ?? {}}
                key={definicao.tipo}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

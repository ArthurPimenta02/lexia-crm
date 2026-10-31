import Form from "next/form";
import { redirect } from "next/navigation";

import { ConexaoForm } from "@/app/admin/conexoes/conexao-form";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { formatDateInTimezone } from "@/lib/clientes/timezone";
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
      <PaginaCabecalho titulo="Conexões" />

      <Form
        action="/admin/conexoes"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        <label className="flex min-w-[260px] flex-col gap-2 text-sm font-medium text-muted-foreground">
          De quem são as conexões
          <select
            className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-foreground"
            defaultValue={selecionado}
            name="cliente"
          >
            <option value="">Escolha…</option>
            <option value={GLOBAL}>Lexia (vale para todos os clientes)</option>
            {clientes.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome || c.slug}
              </option>
            ))}
          </select>
        </label>
        <FormSubmitButton>Abrir</FormSubmitButton>
      </Form>

      {!selecionado ? (
        <p className="text-sm text-muted-foreground">
          Escolha um cliente para ver e gravar as conexões dele.
        </p>
      ) : faltaMigration ? (
        <p className="text-sm text-muted-foreground">
          A tabela de conexões ainda não existe. Falta correr a migration da Fase 19 no
          Supabase central.
        </p>
      ) : (
        <div className="grid gap-4">
          {tipos.map((definicao) => {
            const linha = linhas.find((l) => l.tipo === definicao.tipo);
            return (
              <ConexaoForm
                atualizadoEm={
                  linha?.atualizado_em
                    ? formatDateInTimezone(linha.atualizado_em, "America/Sao_Paulo")
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

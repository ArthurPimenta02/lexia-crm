import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { GrupoMetricas, PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  descreverEstado,
  formatarCusto,
  type TurnoLinha,
} from "@/lib/turnos/formatar";

/**
 * Turnos do agente em código: o equivalente à tela de execuções do n8n.
 *
 * Cada linha é uma vez em que a agente recebeu uma mensagem e decidiu o que
 * fazer. A tabela `lexia_turnos` é fechada à service_role (traz prompts e
 * regras internas), por isso esta página só existe no admin e lê do servidor.
 */

type TurnosPageProps = {
  searchParams: Promise<{
    cliente?: string | string[];
    estado?: string | string[];
    modo?: string | string[];
    conversa?: string | string[];
  }>;
};

const estados = ["", "respondido", "parado", "juntado_a_outra", "erro"];
const modos = ["", "teste", "sombra", "producao"];

function valor(v: string | string[] | undefined) {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function TurnosPage({ searchParams }: TurnosPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const cliente = valor(params.cliente);
  const estadoPedido = valor(params.estado);
  const estado = estados.includes(estadoPedido) ? estadoPedido : "";
  const conversa = valor(params.conversa).trim();
  const modoPedido = valor(params.modo);
  const modo = modos.includes(modoPedido) ? modoPedido : "";

  const admin = createAdminClient();
  let query = admin
    .from("lexia_turnos")
    .select(
      "id, cliente_slug, agente, modo, identificador_conversa, canal, estado, motivo, erro, mensagem_cliente, mensagens, custo_usd, duracao_ms, criado_em",
    )
    .order("criado_em", { ascending: false })
    .limit(200);
  if (cliente) query = query.eq("cliente_slug", cliente);
  if (estado) query = query.eq("estado", estado);
  if (modo) query = query.eq("modo", modo);
  if (conversa) query = query.eq("identificador_conversa", conversa);

  const [{ data, error }, { data: clientesData }] = await Promise.all([
    query,
    admin.from("lexia_clientes").select("slug").order("slug"),
  ]);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return (
        <section className="flex flex-col gap-6">
          <PaginaCabecalho titulo="Turnos do agente" />
          <p className="text-sm text-muted-foreground">
            A tabela de turnos ainda não existe. Falta correr a migration da
            Fase 18 no Supabase central.
          </p>
        </section>
      );
    }
    throw new Error("Não foi possível buscar os turnos.");
  }

  const turnos = (data ?? []) as TurnoLinha[];
  const clientes = (clientesData ?? []).map((c) => c.slug as string);
  const custoTotal = turnos.reduce((s, t) => s + Number(t.custo_usd ?? 0), 0);

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo="Turnos do agente" />

      <GrupoMetricas
        itens={[
          { label: "Turnos listados", valor: turnos.length },
          {
            label: "Responderam",
            valor: turnos.filter((t) => t.estado === "respondido").length,
          },
          {
            label: "Com erro",
            valor: turnos.filter((t) => t.estado === "erro").length,
          },
          {
            dica: "Soma do custo de IA dos turnos listados. Modelos sem preço na tabela não entram.",
            label: "Custo de IA",
            valor: formatarCusto(custoTotal),
          },
        ]}
      />

      <Form
        action="/admin/turnos"
        className="rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
          <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
            Cliente
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-foreground"
              defaultValue={cliente}
              name="cliente"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
            Resultado
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-foreground"
              defaultValue={estado}
              name="estado"
            >
              <option value="">Todos</option>
              {estados.filter(Boolean).map((e) => (
                <option key={e} value={e}>
                  {descreverEstado(e)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
            Modo
            <select
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-foreground"
              defaultValue={modo}
              name="modo"
            >
              <option value="">Todos</option>
              <option value="teste">Área de testes</option>
              <option value="sombra">Sombra (real, não enviado)</option>
              <option value="producao">Produção</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
            Conversa
            <input
              className="h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-foreground"
              defaultValue={conversa}
              name="conversa"
              placeholder="identificador da conversa"
            />
          </label>
          <div className="flex items-end">
            <FormSubmitButton>Filtrar</FormSubmitButton>
          </div>
        </div>
      </Form>

      {turnos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum turno com estes filtros.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Cliente disse</th>
                <th className="px-4 py-3 font-medium">Agente respondeu</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Custo</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => {
                const resposta = Array.isArray(t.mensagens)
                  ? (t.mensagens as unknown[]).map(String).join(" · ")
                  : "";
                return (
                  <tr className="border-b border-border last:border-0 align-top" key={t.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateInTimezone(t.criado_em, getClientTimezone(t.agente))}
                      <div className="text-xs">
                        {t.modo} · {t.canal ?? "?"}
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <span className="line-clamp-3">{t.mensagem_cliente || "—"}</span>
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <span className="line-clamp-3">
                        {resposta || (t.erro ?? t.motivo ?? "—")}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${t.estado === "erro" ? "text-danger" : ""}`}>
                      {descreverEstado(t.estado)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatarCusto(t.custo_usd)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                        href={`/admin/turnos/${t.id}`}
                      >
                        Ver passo a passo
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

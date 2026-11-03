import Form from "next/form";
import { redirect } from "next/navigation";

import { BloqueioForm } from "@/app/admin/bloqueios/bloqueio-form";
import { removerBloqueio } from "@/app/admin/bloqueios/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Contactos bloqueados de cada agente (Fase 21): a agente em código não
 * responde a quem está aqui. Vale para o agente em código; o n8n continua a
 * usar as listas escritas nos nós até à virada.
 */

type BloqueiosPageProps = { searchParams: Promise<{ cliente?: string | string[] }> };

type Bloqueio = {
  id: string;
  canal: string;
  identificador: string;
  nome: string | null;
  motivo: string | null;
  criado_em: string;
};

const CANAIS: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

export default async function BloqueiosPage({ searchParams }: BloqueiosPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const pedido = Array.isArray(params.cliente) ? (params.cliente[0] ?? "") : (params.cliente ?? "");

  const admin = createAdminClient();
  const { data: clientesData } = await admin.from("lexia_clientes").select("slug, nome").order("nome");
  const clientes = (clientesData ?? []) as { slug: string; nome: string | null }[];
  const selecionado = clientes.some((c) => c.slug === pedido) ? pedido : "";

  let bloqueios: Bloqueio[] = [];
  let faltaMigration = false;
  if (selecionado) {
    const { data, error } = await admin
      .from("lexia_bloqueios")
      .select("id, canal, identificador, nome, motivo, criado_em")
      .eq("cliente_slug", selecionado)
      .order("criado_em", { ascending: false });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") faltaMigration = true;
      else throw new Error("Não foi possível buscar os bloqueios.");
    }
    bloqueios = (data ?? []) as Bloqueio[];
  }

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo={t("Contatos bloqueados")} />

      <Form
        action="/admin/bloqueios"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5"
        replace
        scroll={false}
      >
        <label className="flex min-w-[260px] flex-col gap-2 text-sm font-medium text-muted-foreground">
          {t("Cliente")}
          <select
            className="ds-campo"
            defaultValue={selecionado}
            name="cliente"
          >
            <option value="">{t("Escolha…")}</option>
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
          {t("Escolha um cliente para ver quem a agente não atende.")}
        </p>
      ) : faltaMigration ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "A tabela de bloqueios ainda não existe. Falta rodar a migration da Fase 21 no Supabase central.",
          )}
        </p>
      ) : (
        <>
          <BloqueioForm clienteSlug={selecionado} />

          <p className="text-xs text-muted-foreground">
            {t(
              "Vale para a agente em código. Quem estiver salvo na agenda do celular do responsável também não é atendido, sem precisar estar nesta lista.",
            )}
          </p>

          {bloqueios.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Ninguém bloqueado neste cliente.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("Nome")}</th>
                    <th className="px-4 py-3 font-medium">{t("Canal")}</th>
                    <th className="px-4 py-3 font-medium">{t("Número / conta")}</th>
                    <th className="px-4 py-3 font-medium">{t("Motivo")}</th>
                    <th className="px-4 py-3 font-medium">{t("Desde")}</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {bloqueios.map((b) => (
                    <tr className="border-b border-border text-foreground last:border-0" key={b.id}>
                      <td className="px-4 py-3">{b.nome || "—"}</td>
                      <td className="px-4 py-3">{CANAIS[b.canal] ?? b.canal}</td>
                      <td className="px-4 py-3 font-mono text-xs">{b.identificador}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.motivo || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "short",
                          timeZone: getClientTimezone(selecionado),
                        }).format(new Date(b.criado_em))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ConfirmActionButton
                          action={removerBloqueio.bind(null, selecionado, b.id)}
                          className="ds-botao ds-botao-secundario ds-botao-p"
                          confirmMessage={t("Desbloquear {nome}? A agente volta a responder a esta pessoa.", {
                            nome: b.nome || b.identificador,
                          })}
                          pendingLabel="..."
                        >
                          {t("Desbloquear")}
                        </ConfirmActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

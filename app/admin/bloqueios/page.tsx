import { redirect } from "next/navigation";

import { BloqueioForm } from "@/app/admin/bloqueios/bloqueio-form";
import { removerBloqueio } from "@/app/admin/bloqueios/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import {
  AvatarCanal,
  AvisoLinha,
  CabecalhoTela,
  FiltroTrilho,
  VazioTela,
} from "@/app/components/tela";
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

  const nomeSelecionado = clientes.find((c) => c.slug === selecionado)?.nome || selecionado;
  const total = bloqueios.length;

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        destaque={
          selecionado && !faltaMigration && total > 0
            ? total === 1
              ? t("1 contato")
              : t("{n} contatos", { n: total })
            : undefined
        }
        resto={
          !selecionado || faltaMigration
            ? t("Contatos bloqueados")
            : total > 0
              ? t("que o agente não atende.")
              : t("Ninguém bloqueado neste cliente.")
        }
        sobretitulo={
          selecionado ? `${t("Contatos bloqueados")} · ${nomeSelecionado}` : t("Admin Lexia")
        }
      />

      <div className="flex min-w-0">
        <FiltroTrilho
          opcoes={clientes.map((c) => ({
            ativo: c.slug === selecionado,
            href: `/admin/bloqueios?cliente=${encodeURIComponent(c.slug)}`,
            label: c.nome || c.slug,
          }))}
          rotulo={t("Cliente")}
        />
      </div>

      {!selecionado ? (
        <div className="ds-bloco">
          <VazioTela
            texto={t("Escolha um cliente para ver quem a agente não atende.")}
            titulo={t("Escolha um cliente")}
          />
        </div>
      ) : faltaMigration ? (
        <AvisoLinha>
          {t(
            "A tabela de bloqueios ainda não existe. Falta rodar a migration da Fase 21 no Supabase central.",
          )}
        </AvisoLinha>
      ) : (
        <>
          <BloqueioForm clienteSlug={selecionado} />

          <AvisoLinha tom="info">
            {t(
              "Vale para a agente em código. Quem estiver salvo na agenda do celular do responsável também não é atendido, sem precisar estar nesta lista.",
            )}
          </AvisoLinha>

          <section className="ds-bloco min-w-0 overflow-hidden">
            {bloqueios.length === 0 ? (
              <VazioTela
                pose="feliz"
                texto={t("Use o formulário acima para bloquear alguém.")}
                titulo={t("Ninguém bloqueado neste cliente.")}
              />
            ) : (
              <div className="tela-lista p-1.5">
                {bloqueios.map((b) => (
                  <div className="tela-linha flex-wrap sm:flex-nowrap" key={b.id}>
                    <AvatarCanal canal={b.canal} nome={b.nome || b.identificador} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {b.nome || "—"}
                        </span>
                        <span className="ds-selo ds-selo-neutro">{CANAIS[b.canal] ?? b.canal}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="font-mono">{b.identificador}</span>
                        {b.motivo ? ` · ${b.motivo}` : ""}
                        {" · "}
                        {t("desde {data}", {
                          data: new Intl.DateTimeFormat(locale, {
                            dateStyle: "short",
                            timeZone: getClientTimezone(selecionado),
                          }).format(new Date(b.criado_em)),
                        })}
                      </p>
                    </div>
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
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

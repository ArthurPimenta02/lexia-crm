import { redirect } from "next/navigation";

import { AvatarCanal, AvisoLinha, CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Eventos à Meta (13/11/2026): o que o agente em código mandou para a Meta e o que
 * ela respondeu. Duas origens, as duas gravadas em `lexia_eventos`:
 * - `meta_evento`: Conversions API de mensagens (conversas vindas de anúncio de
 *   WhatsApp, com o código do clique) — LeadSubmitted, QualifiedLead, Purchase;
 * - `meta_pixel`: pixel do cliente, todas as marcações (telefone em hash) —
 *   Schedule ao marcar, Purchase ao comparecer.
 */

type EventosPageProps = { searchParams: Promise<{ cliente?: string | string[] }> };

type Linha = {
  id: string;
  tipo: string;
  ocorrido_em: string;
  identificador_conversa: string | null;
  dados: { evento?: string; valor?: number | null; aceite?: boolean; anuncio?: string; servico?: string; resposta?: unknown };
};

const NOME_EVENTO: Record<string, string> = {
  LeadSubmitted: "Lead do anúncio",
  QualifiedLead: "Agendou",
  Schedule: "Agendou",
  Purchase: "Compareceu",
};

export default async function EventosMetaPage({ searchParams }: EventosPageProps) {
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

  let linhas: Linha[] = [];
  if (selecionado) {
    const { data, error } = await admin
      .from("lexia_eventos")
      .select("id, tipo, ocorrido_em, identificador_conversa, dados")
      .eq("cliente_slug", selecionado)
      .in("tipo", ["meta_evento", "meta_pixel"])
      .order("ocorrido_em", { ascending: false })
      .limit(300);
    if (error) throw new Error("Não foi possível buscar os eventos.");
    linhas = (data ?? []) as Linha[];
  }

  const nomeSelecionado = clientes.find((c) => c.slug === selecionado)?.nome || selecionado;
  const aceites = linhas.filter((l) => l.dados?.aceite).length;
  const recusados = linhas.length - aceites;
  const conta = (tipo: string, evento: string) => linhas.filter((l) => l.tipo === tipo && l.dados?.evento === evento && l.dados?.aceite).length;
  const resumo = [
    { rotulo: t("Leads de anúncio"), n: conta("meta_evento", "LeadSubmitted") },
    { rotulo: t("Agendaram"), n: conta("meta_pixel", "Schedule") },
    { rotulo: t("Compareceram"), n: conta("meta_pixel", "Purchase") },
    {
      rotulo: t("Valor enviado"),
      n: `US$ ${linhas.filter((l) => l.tipo === "meta_pixel" && l.dados?.evento === "Purchase" && l.dados?.aceite).reduce((s, l) => s + (Number(l.dados?.valor) || 0), 0)}`,
    },
  ];
  const quando = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: getClientTimezone(selecionado) }).format(new Date(iso));

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        destaque={selecionado && linhas.length > 0 ? t("{n} eventos", { n: linhas.length }) : undefined}
        resto={!selecionado ? t("Eventos enviados à Meta") : linhas.length > 0 ? t("enviados à Meta.") : t("Nenhum evento enviado ainda.")}
        sobretitulo={selecionado ? `${t("Eventos enviados à Meta")} · ${nomeSelecionado}` : t("Admin Lexia")}
      />

      <div className="flex min-w-0">
        <FiltroTrilho
          opcoes={clientes.map((c) => ({
            ativo: c.slug === selecionado,
            href: `/admin/eventos-meta?cliente=${encodeURIComponent(c.slug)}`,
            label: c.nome || c.slug,
          }))}
          rotulo={t("Cliente")}
        />
      </div>

      {!selecionado ? (
        <div className="ds-bloco">
          <VazioTela texto={t("Escolha um cliente para ver o que foi enviado à Meta.")} titulo={t("Escolha um cliente")} />
        </div>
      ) : (
        <>
          <AvisoLinha tom="info">
            {t(
              "Conversas vindas de anúncio de WhatsApp mandam o lead, o agendamento e o comparecimento com o código do clique. Todas as marcações vão também para o pixel, com o telefone protegido, para públicos semelhantes.",
            )}
          </AvisoLinha>

          {linhas.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {resumo.map((r) => (
                <div className="ds-bloco p-4" key={r.rotulo}>
                  <p className="text-xs text-muted-foreground">{r.rotulo}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{r.n}</p>
                </div>
              ))}
            </div>
          ) : null}

          {recusados > 0 ? (
            <AvisoLinha>{t("{n} eventos foram recusados pela Meta. Veja o motivo em cada linha.", { n: recusados })}</AvisoLinha>
          ) : null}

          <section className="ds-bloco min-w-0 overflow-hidden">
            {linhas.length === 0 ? (
              <VazioTela
                pose="feliz"
                texto={t("Os eventos aparecem aqui quando a agente marcar horários ou receber conversas de anúncio.")}
                titulo={t("Nenhum evento enviado ainda.")}
              />
            ) : (
              <div className="tela-lista p-1.5">
                {linhas.map((l) => {
                  const canal = (l.identificador_conversa ?? "").split(":")[0];
                  const evento = String(l.dados?.evento ?? "");
                  const motivo = l.dados?.aceite ? "" : JSON.stringify(l.dados?.resposta ?? "").slice(0, 160);
                  return (
                    <div className="tela-linha flex-wrap sm:flex-nowrap" key={l.id}>
                      <AvatarCanal canal={canal} nome={l.identificador_conversa ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {t(NOME_EVENTO[evento] ?? evento)}
                            {l.dados?.valor ? ` · US$ ${l.dados.valor}` : ""}
                          </span>
                          <span className="ds-selo ds-selo-neutro">{l.tipo === "meta_pixel" ? t("Pixel") : t("Anúncio de WhatsApp")}</span>
                          <span className={`ds-selo ${l.dados?.aceite ? "ds-selo-verde" : "ds-selo-perigo"}`}>
                            {l.dados?.aceite ? t("Aceito") : t("Recusado")}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <span className="font-mono">{l.identificador_conversa}</span>
                          {l.dados?.servico ? ` · ${l.dados.servico}` : ""}
                          {l.dados?.anuncio ? ` · ${t("anúncio {id}", { id: l.dados.anuncio })}` : ""}
                          {` · ${quando(l.ocorrido_em)}`}
                          {motivo ? ` · ${motivo}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

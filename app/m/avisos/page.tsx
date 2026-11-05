import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcCalendario, IcConversa, IcSino } from "../_c/icones";
import { BotaoVoltar } from "../_c/voltar";
import { VazioMascote } from "@/app/m/_c/vazio";

export const dynamic = "force-dynamic";

/**
 * Avisos: os últimos avisos que o app mandou sobre esta empresa (cliente à
 * espera, agendamentos, resumo da manhã). Tocar abre o mesmo sítio que o
 * aviso abria. Ligar e desligar cada tipo fica nos Ajustes.
 */
export default async function AvisosMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const agora = new Date();
  const { data, error } = await createAdminClient()
    .from("lexia_app_envios")
    .select("id, tipo, titulo, corpo, url, criado_em")
    .eq("cliente_slug", c.clienteSlug)
    .order("criado_em", { ascending: false })
    .limit(50);
  // Só links para dentro do app.
  const destino = (url: string) => (url.startsWith("/m") ? url : "/m");

  return (
    <main className="m-pagina">
      <div className="m-topo">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Avisos")}</b></div>
        <Link className="m-pill" href="/m/ajustes#avisos">{t("Ajustes")}</Link>
      </div>
      {error ? <div className="m-vazio">{t("Não foi possível carregar.")}</div> : !data?.length ? (
        <VazioMascote pose="piscadinha">{t("Ainda não houve avisos.")}</VazioMascote>
      ) : (
        <div className="m-lista-conv">
          {data.map((a) => (
            <Link className="m-conv" href={destino(String(a.url ?? ""))} key={a.id} prefetch={false}>
              <div className="m-av" style={{ background: a.tipo === "a_espera" ? "var(--m-laranja-claro)" : "var(--m-acento-claro)", color: a.tipo === "a_espera" ? "var(--m-laranja)" : "var(--m-acento)" }}>
                {a.tipo === "a_espera" ? <IcConversa tamanho={16} /> : String(a.tipo).startsWith("agendamento") ? <IcCalendario tamanho={16} /> : <IcSino tamanho={16} />}
              </div>
              <div className="m-meio"><b>{a.titulo}</b><span>{a.corpo}</span></div>
              <div className="dir"><span className="h">{a.criado_em ? quandoCurto(a.criado_em, agora, c.fuso, c.locale, t("Ontem")) : ""}</span></div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

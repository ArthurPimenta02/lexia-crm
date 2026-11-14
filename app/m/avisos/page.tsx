import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcEngrenagem } from "../_c/icones";
import { BotaoVoltar } from "../_c/voltar";
import { VazioMascote } from "@/app/m/_c/vazio";
import { AvatarMascote } from "@/app/components/mascote";

export const dynamic = "force-dynamic";

// Avisos de alguém à espera de uma pessoa (regras de 14/11): bolinha laranja.
const TIPOS_ESPERA = new Set(["a_espera", "pediu_pessoa", "irritado"]);

/**
 * Avisos: os últimos avisos que o app mandou sobre esta empresa (cliente à
 * espera, pediu uma pessoa, irritado, agendamentos, resumos da manhã e da
 * semana, meta batida). Tocar abre o mesmo sítio que o
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
    <main className="m-pagina m6">
      <header className="m6-cab volta">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <h1>{t("Avisos")}</h1>
        <Link aria-label={t("Ajustes")} className="m-ic sup" href="/m/ajustes#avisos"><IcEngrenagem tamanho={18} /></Link>
      </header>
      {error ? <div className="m-vazio">{t("Não foi possível carregar.")}</div> : !data?.length ? (
        <VazioMascote pose="piscadinha">{t("Ainda não houve avisos.")}</VazioMascote>
      ) : (
        <div className="m-lista-conv">
          {data.map((a) => (
            <Link className="m-conv" href={destino(String(a.url ?? ""))} key={a.id} prefetch={false}>
              {/* O beija-flor em todos os avisos; a bolinha diz o tipo (laranja = alguém à espera de uma pessoa). */}
              <div className="m-av" style={{ background: "transparent" }}>
                <AvatarMascote tamanho={40} />
                <span className="canal" style={{ background: TIPOS_ESPERA.has(String(a.tipo)) ? "var(--m-alerta)" : "var(--m-acento)" }} />
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

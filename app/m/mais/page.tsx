import Link from "next/link";

import { ecraPermitido } from "@/lib/auth/ecras";
import { maisRapido } from "@/lib/movel/cache";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia } from "@/lib/movel/formato";
import type { DadosMais } from "@/lib/movel/mais";

import { IcCheck } from "../_c/icones";

export const dynamic = "force-dynamic";

export default async function MaisMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  let d: DadosMais | null = null;
  try {
    d = await maisRapido(c.clienteSlug, c.fuso);
  } catch {
    d = null;
  }
  const hoje = chaveDoDia(new Date(), c.fuso);
  const pode = (ecra: string) => ecraPermitido(c.clienteSlug, ecra);
  const grandes = [
    pode("/app/campanhas") ? { destaque: true, emo: "📣", href: "/m/campanhas", r: t("Campanhas") } : null,
    pode("/app/area-testes") ? { destaque: false, emo: "🧪", href: "/m/testes", r: t("Área de testes") } : null,
  ].filter(Boolean) as { destaque: boolean; emo: string; href: string; r: string }[];
  const pequenos = [
    pode("/app/clientes") ? { emo: "👥", href: "/m/clientes", r: t("Clientes") } : null,
    pode("/app/agenda") ? { emo: "📅", href: "/m/agenda", r: t("Agenda") } : null,
    { emo: "🔔", href: "/m/avisos", r: t("Avisos") },
    { emo: "⚙️", href: "/m/ajustes", r: t("Ajustes") },
  ].filter(Boolean) as { emo: string; href: string; r: string }[];

  const feitos = d ? (c.meta.conta === "agente" ? d.mes.agente : d.mes.todos) : 0;
  const pct = c.meta.mes ? Math.min(100, Math.round((feitos / c.meta.mes) * 100)) : 0;
  const ultimo = d ? new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.mes.ultimoDia}T12:00:00Z`)) : "";
  const inicialDoDia = (k: string) => new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "narrow" }).format(new Date(`${k}T12:00:00Z`));
  const naSemana = d ? d.semana.reduce((a, x) => a + x.agente, 0) : 0;

  return (
    <main className="m-pagina">
      <div className="m-titulo"><h1>{t("Mais")}</h1></div>

      <Link className="m-tile destaque m-tile-largo" href="/m/ajudante?tela=/m/mais"><span className="emo">✦</span><b>{t("Analista Lexia")}</b><small>{t("Pergunte qualquer coisa sobre o seu negócio")}</small></Link>
      {grandes.length ? (
        <div className="m-g2">
          {grandes.map((g) => <Link className={`m-tile${g.destaque ? " destaque" : ""}`} href={g.href} key={g.href}><span className="emo">{g.emo}</span>{g.r}</Link>)}
        </div>
      ) : null}
      <div className="m-g4">
        {pequenos.map((g) => <Link className="m-tile" href={g.href} key={g.href}><span className="emo4">{g.emo}</span>{g.r}</Link>)}
      </div>

      {d ? (
        <>
          <div className="m-sec"><h2>{t("Semana do agente")}</h2><span>{naSemana === 1 ? t("1 marcação") : t("{n} marcações", { n: naSemana })}</span></div>
          <div className="m-semana">
            {d.semana.map((x) => (
              <div className={x.dia === hoje ? "hoje" : ""} key={x.dia}>
                <span style={{ textTransform: "uppercase" }}>{inicialDoDia(x.dia)}</span>
                <i className={x.agente ? "ok" : ""}>{x.agente > 1 ? x.agente : x.agente ? <IcCheck tamanho={14} /> : null}</i>
              </div>
            ))}
          </div>

          <div className="m-sec" style={{ marginTop: 24 }}>
            <h2>{t("Meta do mês")}</h2>
            {c.meta.mes ? <span>{t("{n} de {total}", { n: feitos, total: c.meta.mes })}</span> : <Link href="/m/ajustes#meta">{t("Definir")}</Link>}
          </div>
          {c.meta.mes ? (
            <>
              <div className="m-meta"><i style={{ width: `${pct}%` }} /></div>
              <div className="m-meta-l">
                <span>{feitos >= c.meta.mes ? t("Meta batida 🎉") : t("{p}% · faltam {n}", { n: c.meta.mes - feitos, p: pct })}</span>
                <span>{t("até {dia}", { dia: ultimo })}</span>
              </div>
            </>
          ) : (
            <Link className="m-vazio m-vazio-link" href="/m/ajustes#meta">{t("Escolha nos Ajustes quantos agendamentos quer fazer por mês. Este mês: {n}.", { n: d.mes.todos })}</Link>
          )}
        </>
      ) : <div className="m-vazio">{t("Não foi possível carregar.")}</div>}
    </main>
  );
}

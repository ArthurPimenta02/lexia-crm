import Link from "next/link";

import { resultadosRapido } from "@/lib/movel/cache";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda } from "@/lib/movel/formato";
import { intervaloDe, type DadosResultados } from "@/lib/movel/resultados";

import { Curva } from "../_c/curva";
import { IcSeta } from "../_c/icones";
import { Personalizado } from "./personalizado";
import { moedaPadraoDoCliente } from "@/lib/servicos/config";

export const dynamic = "force-dynamic";

function variacao(atual: number, antes: number) {
  if (!antes) return null;
  return Math.round(((atual - antes) / antes) * 100);
}

export default async function ResultadosMovel({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const params = await searchParams;
  const hoje = chaveDoDia(new Date(), c.fuso);
  const intervalo = intervaloDe(params.p, params.de, params.ate, hoje);
  let d: DadosResultados | null = null;
  try {
    d = await resultadosRapido(c.clienteSlug, c.fuso, intervalo);
  } catch {
    d = null;
  }
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? moedaPadraoDoCliente(c.clienteSlug));
  const curto = (k: string) => new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`));
  const rotuloPeriodo = intervalo.de === intervalo.ate ? curto(intervalo.de) : `${curto(intervalo.de)} – ${curto(intervalo.ate)}`;
  const chips = [
    ["hoje", t("Hoje")],
    ["ontem", t("Ontem")],
    ["semana", t("Uma semana")],
    ["tudo", t("Período total")],
  ] as const;

  return (
    <main className="m-pagina">
      <div className="m-titulo"><h1>{t("Resultados")}</h1><span className="m-periodo">{rotuloPeriodo}</span></div>
      <div className="m-chips">
        {chips.map(([k, r]) => <Link className={`m-chip${intervalo.chave === k ? " on" : ""}`} href={`/m/resultados?p=${k}`} key={k} replace scroll={false}>{r}</Link>)}
        <Personalizado activo={intervalo.chave === "personalizado"} ate={intervalo.ate} de={intervalo.de} hoje={hoje} textos={{ aplicar: t("Ver resultados"), ate: t("Até"), de: t("De"), personalizado: t("Personalizado") }} />
      </div>

      {!d ? <div className="m-vazio">{t("Não foi possível carregar os resultados.")}</div> : (() => {
        const v = variacao(d.atual.agendamentos, d.anterior.agendamentos);
        const funil = [
          { n: d.atual.conversas, r: t("conversas") },
          { n: d.atual.leads, r: t("leads novos") },
          { n: d.atual.doAgente, r: t("agendados pelo agente") },
          { n: d.atual.vieram, r: t("já vieram") },
        ];
        const topo = Math.max(1, ...funil.map((f) => f.n));
        const rotulos = d.dias <= 7
          ? d.leadsPorDia.map((x) => new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${x.dia}T12:00:00Z`)).replace(".", ""))
          : [0, 0.25, 0.5, 0.75, 1].map((f) => curto(d!.leadsPorDia[Math.round(f * (d!.leadsPorDia.length - 1))].dia));
        return (
          <>
            <div className="m-rot">{t("Agendamentos marcados")}</div>
            <div className="m-grande">{d.atual.agendamentos} <span>· {t("{n} pelo agente", { n: d.atual.doAgente })}</span></div>

            {d.dias > 1 ? (
              <>
                <Curva bolha={(n) => (n === 1 ? t("1 lead") : t("{n} leads", { n }))} valores={d.leadsPorDia.map((x) => x.n)} />
                <div aria-hidden="true" className="m-eixo">{rotulos.map((r, i) => <span key={i}>{r}</span>)}</div>
              </>
            ) : <div style={{ height: 16 }} />}

            <div className="m-duas">
              <div className="m-vc"><small>{t("Leads novos")}</small><strong>{d.atual.leads}</strong><em>{t("{n} de anúncio", { n: d.atual.leadsAnuncio })}</em></div>
              <div className="m-vc"><small>{t("Custo por lead")}</small><strong>{d.atual.leads && d.gasto ? dinheiro(d.gasto / d.atual.leads) : "—"}</strong><em>{t("{valor} investidos", { valor: dinheiro(d.gasto) })}</em></div>
            </div>
            <Link className="m-faixa-l" href="/m/campanhas">
              <span>{v === null ? t("Sem período anterior para comparar") : <><b>{v > 0 ? `+${v}%` : `${v}%`}</b>{t("em relação ao período anterior")}</>}</span>
              <IcSeta tamanho={16} />
            </Link>

            <div className="m-sec"><h2>{t("Do contato ao agendamento")}</h2></div>
            <div className="m-funil">
              {funil.map((f) => <div className="f" key={f.r}><div className="bar" style={{ width: `${Math.max(16, (f.n / topo) * 72)}%` }}>{f.n}</div><span>{f.r}</span></div>)}
            </div>
            <p className="m-discreto">
              {[t("{n} à mão", { n: d.atual.aMao }), d.atual.cancelados ? (d.atual.cancelados === 1 ? t("1 cancelado") : t("{n} cancelados", { n: d.atual.cancelados })) : null, d.atual.valor ? t("Valor dos agendamentos com preço: {valor}", { valor: dinheiro(d.atual.valor) }) : null].filter(Boolean).join(" · ")}
            </p>

            {d.anuncios.length ? (
              <>
                <div className="m-sec"><h2>{t("Anúncios")}</h2><Link href="/m/campanhas">{t("Campanhas")}</Link></div>
                <div className="m-cartao-num">
                  <div className="m-anuncios" style={{ marginTop: 0 }}>
                    {d.anuncios.map((a) => (
                      <div className="m-anuncio" key={a.nome}>
                        <div className="topo-a"><b>{a.nome}</b><span>{a.leads === 1 ? t("1 lead") : t("{n} leads", { n: a.leads })}</span></div>
                        <div className="m-progresso"><i style={{ width: `${Math.round((a.leads / Math.max(1, d!.atual.leadsAnuncio)) * 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </>
        );
      })()}
    </main>
  );
}

import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda } from "@/lib/movel/formato";
import { dadosResultados, intervaloDe, type DadosResultados } from "@/lib/movel/resultados";

import { IcCalendario, IcConversa, IcEuro, IcPessoa } from "../_c/icones";
import { Personalizado } from "./personalizado";

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
    d = await dadosResultados(c.clienteSlug, c.fuso, intervalo);
  } catch {
    d = null;
  }
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? "EUR");
  const curto = (k: string) => new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`));
  const rotuloPeriodo = intervalo.de === intervalo.ate ? curto(intervalo.de) : `${curto(intervalo.de)} – ${curto(intervalo.ate)}`;
  const chips = [
    ["hoje", t("Hoje")],
    ["ontem", t("Ontem")],
    ["semana", t("Esta semana")],
    ["mes", t("Este mês")],
  ] as const;

  return (
    <main className="m-pagina">
      <div className="m-titulo"><h1>{t("Resultados")}</h1></div>
      <div className="m-chips" style={{ marginTop: 0 }}>
        {chips.map(([k, r]) => <Link className={`m-chip${intervalo.chave === k ? " on" : ""}`} href={`/m/resultados?p=${k}`} key={k} replace>{r}</Link>)}
        <Personalizado activo={intervalo.chave === "personalizado"} ate={intervalo.ate} de={intervalo.de} hoje={hoje} textos={{ aplicar: t("Ver resultados"), ate: t("Até"), de: t("De"), personalizado: t("Personalizado") }} />
      </div>
      <p className="m-discreto" style={{ justifyContent: "flex-start", margin: "-4px 4px 12px" }}>{rotuloPeriodo}</p>

      {!d ? <div className="m-vazio">{t("Não foi possível carregar os resultados.")}</div> : (() => {
        const v = variacao(d.atual.agendamentos, d.anterior.agendamentos);
        const max = Math.max(1, ...d.leadsPorDia.map((x) => x.n));
        const funil = [
          { n: d.atual.conversas, r: t("conversas") },
          { n: d.atual.leads, r: t("leads novos") },
          { n: d.atual.doAgente, r: t("agendados pelo agente") },
          { n: d.atual.vieram, r: t("já vieram") },
        ];
        const topo = Math.max(1, ...funil.map((f) => f.n));
        const taxa = d.atual.conversas ? Math.round((d.atual.doAgente / d.atual.conversas) * 100) : null;
        return (
          <>
            <section className="m-destaque">
              <div className="rot" style={{ marginTop: 0 }}>{t("Agendamentos")}</div>
              <div className="valor">{d.atual.agendamentos}</div>
              <div className="sub">{t("{a} pelo agente · {m} à mão", { a: d.atual.doAgente, m: d.atual.aMao })}</div>
              <div className="sub" style={{ marginTop: 6 }}>
                {v === null ? t("Sem período anterior para comparar") : <><b style={{ color: v < 0 ? "#ff8a80" : undefined }}>{v > 0 ? `+${v}%` : `${v}%`}</b> {t("em relação ao período anterior")}</>}
                {d.atual.cancelados ? ` · ${d.atual.cancelados === 1 ? t("1 cancelado") : t("{n} cancelados", { n: d.atual.cancelados })}` : ""}
              </div>
            </section>
            <div className="m-bento-2">
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-acento-claro)", color: "var(--m-acento)" }}><IcPessoa /></div><strong>{d.atual.leads}</strong><small>{t("leads novos")}</small><em>{t("{n} de anúncio", { n: d.atual.leadsAnuncio })}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-suave)" }}><IcConversa /></div><strong>{d.atual.conversas}</strong><small>{t("conversas")}</small><em>{t("{n} antes", { n: d.anterior.conversas })}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-azul-claro)", color: "var(--m-azul)" }}><IcCalendario /></div><strong>{taxa === null ? "—" : `${taxa}%`}</strong><small>{t("conversas que o agente agendou")}</small><em>{t("{n} agendamentos", { n: d.atual.doAgente })}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-laranja-claro)", color: "var(--m-laranja)" }}><IcEuro /></div><strong>{d.atual.leadsAnuncio && d.gasto ? dinheiro(d.gasto / d.atual.leadsAnuncio) : "—"}</strong><small>{t("custo por lead")}</small><em>{t("{valor} investidos", { valor: dinheiro(d.gasto) })}</em></div>
            </div>

            {d.dias > 1 ? (
              <>
                <div className="m-sec"><h2>{t("Leads por dia")}</h2></div>
                <div className="m-cartao-num">
                  <div aria-hidden="true" className="m-barras" style={{ gap: d.dias > 14 ? 3 : 7, height: 90, marginTop: 0 }}>{d.leadsPorDia.map((x, i) => <div className={i === d!.leadsPorDia.length - 1 ? "on" : ""} key={x.dia} style={{ height: `${Math.max(6, (x.n / max) * 100)}%` }} />)}</div>
                  {d.dias <= 7 ? <div aria-hidden="true" className="m-dias-b">{d.leadsPorDia.map((x) => <span key={x.dia} style={{ textTransform: "capitalize" }}>{new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${x.dia}T12:00:00Z`)).replace(".", "")}</span>)}</div> : <div className="m-rodape">{t("Mais leads num dia: {n}", { n: max })}</div>}
                </div>
              </>
            ) : null}

            <div className="m-sec"><h2>{t("Do contato ao agendamento")}</h2></div>
            <div className="m-funil">
              {funil.map((f) => <div className="f" key={f.r}><div className="bar" style={{ width: `${Math.max(16, (f.n / topo) * 72)}%` }}>{f.n}</div><span>{f.r}</span></div>)}
            </div>
            {d.atual.valor ? <p className="m-discreto">{t("Valor dos agendamentos com preço: {valor}", { valor: dinheiro(d.atual.valor) })}</p> : null}

            {d.anuncios.length ? (
              <>
                <div className="m-sec"><h2>{t("Anúncios")}</h2></div>
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

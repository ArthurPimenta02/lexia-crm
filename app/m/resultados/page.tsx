import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { moeda } from "@/lib/movel/formato";
import { dadosResultados, type DadosResultados, type Periodo } from "@/lib/movel/resultados";

import { IcCalendario, IcEuro, IcPessoa, IcConversa } from "../_c/icones";

export const dynamic = "force-dynamic";

function variacao(atual: number, antes: number) {
  if (!antes) return null;
  return Math.round(((atual - antes) / antes) * 100);
}

export default async function ResultadosMovel({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const p = (await searchParams).p;
  const periodo: Periodo = p === "1" ? 1 : p === "30" ? 30 : 7;
  let d: DadosResultados | null = null;
  try {
    d = await dadosResultados(c.clienteSlug, c.fuso, periodo);
  } catch {
    d = null;
  }
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? "EUR");
  const rotuloAnterior = periodo === 1 ? t("em relação ao dia anterior") : periodo === 7 ? t("em relação aos 7 dias anteriores") : t("em relação aos 30 dias anteriores");

  return (
    <main className="m-pagina">
      <div className="m-titulo"><h1>{t("Resultados")}</h1></div>
      <div className="m-segm" style={{ marginBottom: 12 }}>
        <Link className={periodo === 1 ? "on" : ""} href="/m/resultados?p=1" replace>{t("Ontem")}</Link>
        <Link className={periodo === 7 ? "on" : ""} href="/m/resultados?p=7" replace>{t("7 dias")}</Link>
        <Link className={periodo === 30 ? "on" : ""} href="/m/resultados?p=30" replace>{t("30 dias")}</Link>
      </div>

      {!d ? <div className="m-vazio">{t("Não foi possível carregar os resultados.")}</div> : (() => {
        const v = variacao(d.atual.valor, d.anterior.valor);
        const max = Math.max(1, ...d.leadsPorDia.map((x) => x.n));
        const funil = [
          { n: d.atual.conversas, r: t("conversas") },
          { n: d.atual.leads, r: t("leads novos") },
          { n: d.atual.agendaram, r: t("agendaram") },
          { n: d.atual.vieram, r: t("já vieram") },
        ];
        const topo = Math.max(1, ...funil.map((f) => f.n));
        return (
          <>
            <section className="m-destaque">
              <div className="rot" style={{ marginTop: 0 }}>{t("Valor agendado")}</div>
              <div className="valor">{dinheiro(d.atual.valor)}</div>
              <div className="sub">{v === null ? t("Sem período anterior para comparar") : <><b>{v > 0 ? `+${v}%` : `${v}%`}</b> {rotuloAnterior}</>}</div>
            </section>
            <div className="m-bento-2">
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-acento-claro)", color: "var(--m-acento)" }}><IcPessoa /></div><strong>{d.atual.leads}</strong><small>{t("leads novos")}</small><em>{t("{n} de anúncio", { n: d.atual.leadsAnuncio })}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-azul-claro)", color: "var(--m-azul)" }}><IcCalendario /></div><strong>{d.atual.agendaram}</strong><small>{t("agendaram")}</small><em>{d.atual.leads ? t("{n}% dos leads", { n: Math.round((d.atual.agendaram / d.atual.leads) * 100) }) : "—"}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-laranja-claro)", color: "var(--m-laranja)" }}><IcEuro /></div><strong>{d.atual.leadsAnuncio ? dinheiro(d.gasto / d.atual.leadsAnuncio) : "—"}</strong><small>{t("custo por lead")}</small><em>{t("{valor} investidos", { valor: dinheiro(d.gasto) })}</em></div>
              <div className="m-mini"><div className="ico" style={{ background: "var(--m-suave)" }}><IcConversa /></div><strong>{d.atual.conversas}</strong><small>{t("conversas")}</small><em>{t("{n} antes", { n: d.anterior.conversas })}</em></div>
            </div>

            {periodo > 1 ? (
              <>
                <div className="m-sec"><h2>{t("Leads por dia")}</h2></div>
                <div className="m-cartao-num">
                  <div aria-hidden="true" className="m-barras" style={{ gap: periodo === 30 ? 3 : 7, height: 90, marginTop: 0 }}>{d.leadsPorDia.map((x, i) => <div className={i === d!.leadsPorDia.length - 1 ? "on" : ""} key={x.dia} style={{ height: `${Math.max(6, (x.n / max) * 100)}%` }} />)}</div>
                </div>
              </>
            ) : null}

            <div className="m-sec"><h2>{t("Do contato ao agendamento")}</h2></div>
            <div className="m-funil">
              {funil.map((f) => <div className="f" key={f.r}><div className="bar" style={{ width: `${Math.max(16, (f.n / topo) * 72)}%` }}>{f.n}</div><span>{f.r}</span></div>)}
            </div>

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

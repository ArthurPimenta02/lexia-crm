import Link from "next/link";

import { ecraPermitido } from "@/lib/auth/ecras";
import { resultadosRapido } from "@/lib/movel/cache";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda } from "@/lib/movel/formato";
import { intervaloDe, type DadosResultados } from "@/lib/movel/resultados";
import { moedaPadraoDoCliente } from "@/lib/servicos/config";

import { IcSeta } from "../_c/icones";
import { Moldado } from "../_c/pecas";
import { Periodos } from "../_c/periodos";

export const dynamic = "force-dynamic";

function variacao(atual: number, antes: number) {
  if (!antes) return null;
  return Math.round(((atual - antes) / antes) * 100);
}

/** Barras de leads: por dia até 14 dias, por semana até 92, por mês além disso. */
function barras(leadsPorDia: { dia: string; n: number }[]) {
  const dias = leadsPorDia.length;
  const tamanho = dias <= 14 ? 1 : dias <= 92 ? 7 : 0;
  if (tamanho) {
    const out: { de: string; n: number }[] = [];
    // Agrupa a partir do fim, para a última barra ser sempre a mais recente.
    for (let fim = dias; fim > 0; fim -= tamanho) {
      const fatia = leadsPorDia.slice(Math.max(0, fim - tamanho), fim);
      out.unshift({ de: fatia[0].dia, n: fatia.reduce((a, x) => a + x.n, 0) });
    }
    return { escala: tamanho === 1 ? ("dia" as const) : ("semana" as const), lista: out };
  }
  const porMes = new Map<string, number>();
  for (const x of leadsPorDia) porMes.set(x.dia.slice(0, 7), (porMes.get(x.dia.slice(0, 7)) ?? 0) + x.n);
  // Período total: os meses desde o primeiro com leads.
  const meses = [...porMes.entries()];
  const primeiro = meses.findIndex(([, n]) => n > 0);
  return { escala: "mes" as const, lista: meses.slice(Math.max(0, primeiro)).map(([m, n]) => ({ de: `${m}-01`, n })) };
}

export default async function ResultadosMovel({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const params = await searchParams;
  const hoje = chaveDoDia(new Date(), c.fuso);
  const intervalo = intervaloDe(params.p ?? "semana", params.de, params.ate, hoje);
  let d: DadosResultados | null = null;
  try {
    d = await resultadosRapido(c.clienteSlug, c.fuso, intervalo);
  } catch {
    d = null;
  }
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? moedaPadraoDoCliente(c.clienteSlug));
  const fmt = (k: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(c.locale, { ...o, timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`)).replace(".", "");
  const podeCampanhas = ecraPermitido(c.clienteSlug, "/app/campanhas");

  return (
    <main className="m-pagina m6">
      <header className="m6-cab"><h1>{t("Resultados")}</h1></header>
      <Periodos caminho="/m/resultados" hoje={hoje} intervalo={intervalo} t={t} />

      {!d ? <div className="m-vazio">{t("Não foi possível carregar os resultados.")}</div> : (() => {
        // Período total não tem "anterior" com que comparar.
        const v = intervalo.chave === "tudo" ? null : variacao(d.atual.agendamentos, d.anterior.agendamentos);
        const funil = [
          { n: d.atual.conversas, r: t("Conversas") },
          { n: d.atual.leads, r: t("Leads novos") },
          { n: d.atual.doAgente, r: t("Agendados pelo agente") },
          { n: d.atual.vieram, r: t("Já vieram") },
        ];
        const topo = Math.max(1, ...funil.map((f) => f.n));
        const b = d.dias > 1 ? barras(d.leadsPorDia) : null;
        const maxB = b ? Math.max(1, ...b.lista.map((x) => x.n)) : 1;
        const media = b && b.lista.length ? b.lista.reduce((a, x) => a + x.n, 0) / b.lista.length : 0;
        const rotuloBarra = (de: string, i: number) => {
          if (!b) return "";
          if (b.escala === "dia") return de === hoje ? t("hoje") : b.lista.length <= 7 ? fmt(de, { weekday: "short" }).toLowerCase() : String(Number(de.slice(8)));
          if (b.escala === "semana") return fmt(de, { day: "numeric", month: "short" });
          return i === 0 || de.slice(5, 7) === "01" ? fmt(de, { month: "short", year: "2-digit" }) : fmt(de, { month: "short" });
        };
        // Com muitas barras, só alguns rótulos (o primeiro, o do meio e o último).
        const mostraRotulo = (i: number, n: number) => n <= 8 || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2);
        const anuncios = d.gasto > 0 || d.atual.leadsAnuncio > 0;
        const cartao = (
          <>
            <span className="topo"><span>{t("Anúncios")} · {t(intervalo.chave === "hoje" ? "Hoje" : intervalo.chave === "ontem" ? "Ontem" : intervalo.chave === "tudo" ? "Período total" : intervalo.chave === "personalizado" ? "Personalizado" : "Uma semana").toLowerCase()}</span>{podeCampanhas ? <IcSeta tamanho={16} /> : null}</span>
            <span className="frase">
              <Moldado
                partes={{
                  agendamentos: <b className="v">{d.atual.agendaramAnuncio === 1 ? t("1 agendamento") : t("{n} agendamentos", { n: d.atual.agendaramAnuncio })}</b>,
                  leads: <b className="v">{d.atual.leadsAnuncio === 1 ? t("1 lead") : t("{n} leads", { n: d.atual.leadsAnuncio })}</b>,
                  valor: <b>{dinheiro(d.gasto)}</b>,
                }}
                texto={t("{valor} investidos trouxeram {leads} e {agendamentos}.")}
              />
            </span>
            {d.gasto && d.atual.leadsAnuncio ? <span className="pe">{t("{valor} por lead", { valor: dinheiro(d.gasto / d.atual.leadsAnuncio) })}{podeCampanhas ? ` · ${t("ver campanhas")}` : ""}</span> : null}
          </>
        );
        return (
          <>
            <section aria-label={t("Agendamentos marcados")} className="m6-bloco">
              <span className="m6-rotulo">{t("Agendamentos marcados")}</span>
              <div className="m6-numero">
                <span className="n">{d.atual.agendamentos}</span>
                {d.atual.doAgente ? <span className="m6-pilula">{t("{n} pelo agente", { n: d.atual.doAgente })}</span> : null}
              </div>
              {v !== null ? <p className="m6-linha2"><span className={v >= 0 ? "ac" : "alerta"}>{v > 0 ? `+${v}%` : `${v}%`}</span> {t("sobre o período anterior")}</p> : null}
            </section>

            <section aria-label={t("Da conversa ao atendimento")} className="m6-secao">
              <p className="m6-rotulo">{t("Da conversa ao atendimento")}</p>
              {funil.map((f) => (
                <div className="m6-etapa" key={f.r}>
                  <span className="t">{f.r}</span><span className="n">{f.n}</span>
                  <span aria-hidden="true" className="barra"><span style={{ width: `${f.n ? Math.max(1.5, (f.n / topo) * 100) : 0}%` }} /></span>
                </div>
              ))}
            </section>

            {b && b.lista.length > 1 ? (
              <section aria-label={t("Leads por dia")} className="m6-secao m6-barras">
                <div className="cab">
                  <span className="m6-rotulo">{b.escala === "dia" ? t("Leads por dia") : b.escala === "semana" ? t("Leads por semana") : t("Leads por mês")}</span>
                  <span className="media">{t("média {n}", { n: new Intl.NumberFormat(c.locale, { maximumFractionDigits: 1 }).format(media) })}</span>
                </div>
                <div aria-hidden="true" className="col">
                  {b.lista.map((x, i) => <span className={i === b.lista.length - 1 ? "ult" : undefined} key={x.de} style={{ height: `${Math.max(3, (x.n / maxB) * 100)}%` }} />)}
                </div>
                <div aria-hidden="true" className="eixo">
                  {b.lista.map((x, i) => <span className={i === b.lista.length - 1 ? "ult" : undefined} key={x.de}>{mostraRotulo(i, b.lista.length) ? rotuloBarra(x.de, i) : ""}</span>)}
                </div>
              </section>
            ) : null}

            {anuncios ? (podeCampanhas ? <Link className="m6-escuro" href={`/m/campanhas?p=${intervalo.chave}${intervalo.chave === "personalizado" ? `&de=${intervalo.de}&ate=${intervalo.ate}` : ""}`}>{cartao}</Link> : <div className="m6-escuro">{cartao}</div>) : null}
          </>
        );
      })()}
    </main>
  );
}

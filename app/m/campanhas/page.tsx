import { redirect } from "next/navigation";

import { ecraPermitido } from "@/lib/auth/ecras";
import { getPainelCampanhas, type PainelCampanhas } from "@/lib/campaigns/read";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda } from "@/lib/movel/formato";
import { diasDoIntervalo, intervaloDe } from "@/lib/movel/resultados";
import { limitesDoDia, somarDias } from "@/lib/movel/hoje";

import { ValorGrande } from "../_c/pecas";
import { Periodos } from "../_c/periodos";
import { BotaoVoltar } from "../_c/voltar";
import { VazioMascote } from "@/app/m/_c/vazio";
import { moedaPadraoDoCliente } from "@/lib/servicos/config";

export const dynamic = "force-dynamic";

/**
 * Campanhas no iPhone: quanto se investiu, quantos leads vieram e, por
 * campanha, gasto, leads, custo por lead e quantos agendaram. Lê pelo mesmo
 * caminho do painel (`getPainelCampanhas`, com as regras de acesso da base).
 */
export default async function CampanhasMovel({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  if (!ecraPermitido(c.clienteSlug, "/app/campanhas")) redirect("/m/mais");
  const params = await searchParams;
  const hoje = chaveDoDia(new Date(), c.fuso);
  // Por omissão "Uma semana" (os últimos 7 dias), como em todas as telas.
  const intervalo = intervaloDe(params.p ?? "semana", params.de, params.ate, hoje);
  let d: PainelCampanhas | null = null;
  try {
    d = await getPainelCampanhas({
      clienteSlug: c.clienteSlug,
      fim: intervalo.ate,
      fimIso: limitesDoDia(intervalo.ate, c.fuso).fim,
      inicio: intervalo.de,
      inicioIso: limitesDoDia(intervalo.de, c.fuso).inicio,
      timezone: c.fuso,
    });
  } catch {
    d = null;
  }
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? moedaPadraoDoCliente(c.clienteSlug));
  const dias = diasDoIntervalo(intervalo);
  const listaDias = Array.from({ length: dias }, (_, i) => somarDias(intervalo.de, i));
  const gastoPorDia = new Map((d?.diario ?? []).map((x) => [x.dia, x.gasto]));
  const pausada = (bruto: string | null) => Boolean(bruto && bruto.toUpperCase() !== "ACTIVE");

  // A linha do gasto: um traço simples, dia a dia.
  const valores = listaDias.map((k) => gastoPorDia.get(k) ?? 0);
  const maxG = Math.max(1, ...valores);
  const pontos = valores.map((v, i) => `${valores.length > 1 ? ((i / (valores.length - 1)) * 342).toFixed(1) : 171},${(64 - (v / maxG) * 56).toFixed(1)}`).join(" ");
  const agendaram = (d?.porCampanha ?? []).reduce((a, p) => a + p.marcacoesAtribuidas, 0);

  return (
    <main className="m-pagina m6 m6-campanhas">
      <header className="m6-cab volta">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <h1>{t("Campanhas")}</h1>
      </header>
      <Periodos caminho="/m/campanhas" hoje={hoje} intervalo={intervalo} t={t} />

      {!d ? <div className="m-vazio">{t("Não foi possível carregar as campanhas.")}</div> : !d.temDados ? (
        <VazioMascote>{t("Ainda não há dados de anúncios desta empresa.")}</VazioMascote>
      ) : (
        <>
          <section aria-label={t("Investido")} className="m6-bloco">
            <span className="m6-rotulo">{t("Investido")}</span>
            <span className="m6-investido"><ValorGrande locale={c.locale} moeda={d.moeda} valor={d.gasto} /></span>
            {dias > 1 ? (
              <svg aria-hidden="true" className="m6-gasto" preserveAspectRatio="none" viewBox="0 0 342 70">
                <polyline fill="none" points={pontos} stroke="var(--m-acento)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <line stroke="var(--m-fio)" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="0" x2="342" y1="69" y2="69" />
              </svg>
            ) : null}
          </section>

          <div className="m6-tres">
            <div><b>{d.contactosNovos}</b><span>{t("leads")}</span></div>
            <div><b>{d.custoPorContacto === null ? "—" : dinheiro(d.custoPorContacto)}</b><span>{t("por lead")}</span></div>
            <div><b className="ac">{agendaram}</b><span>{t("agendaram")}</span></div>
          </div>

          <section aria-label={t("Por campanha")}>
            <p className="m6-rotulo">{t("Por campanha")}</p>
            {d.porCampanha.length ? d.porCampanha.map((p) => {
              const parada = pausada(p.estado);
              return (
                <div className={`m6-camp${parada ? " parada" : ""}`} key={p.id}>
                  <span className="topo"><span aria-label={parada ? t("Pausada") : t("Ativa")} className="ponto" role="img" /><span className="nome">{p.nome}</span><span className="val">{dinheiro(p.gasto)}</span></span>
                  <span className="det">{[
                    p.contactosAtribuidos === 1 ? t("1 lead") : t("{n} leads", { n: p.contactosAtribuidos }),
                    p.contactosAtribuidos ? t("{valor} por lead", { valor: dinheiro(p.gasto / p.contactosAtribuidos) }) : null,
                    p.marcacoesAtribuidas ? (p.marcacoesAtribuidas === 1 ? t("1 agendou") : t("{n} agendaram", { n: p.marcacoesAtribuidas })) : null,
                    parada ? t("pausada") : null,
                  ].filter(Boolean).join(" · ")}</span>
                </div>
              );
            }) : <div className="m-vazio">{t("Nenhuma campanha com gasto neste período.")}</div>}
          </section>
        </>
      )}
    </main>
  );
}

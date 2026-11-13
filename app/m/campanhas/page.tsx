import Link from "next/link";
import { redirect } from "next/navigation";

import { ecraPermitido } from "@/lib/auth/ecras";
import { getPainelCampanhas, type PainelCampanhas } from "@/lib/campaigns/read";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda } from "@/lib/movel/formato";
import { diasDoIntervalo, intervaloDe } from "@/lib/movel/resultados";
import { limitesDoDia, somarDias } from "@/lib/movel/hoje";

import { Curva } from "../_c/curva";
import { BotaoVoltar } from "../_c/voltar";
import { Personalizado } from "../resultados/personalizado";
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
  // Por omissão os últimos 7 dias: o gasto da Meta só fecha no dia seguinte.
  const intervalo = params.p ? intervaloDe(params.p, params.de, params.ate, hoje) : { ate: hoje, chave: "sete" as const, de: somarDias(hoje, -6) };
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
  const curto = (k: string) => new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`));
  const dias = diasDoIntervalo(intervalo);
  const listaDias = Array.from({ length: dias }, (_, i) => somarDias(intervalo.de, i));
  const gastoPorDia = new Map((d?.diario ?? []).map((x) => [x.dia, x.gasto]));
  // 13/11/2026: o mesmo filtro de todas as telas ("Uma semana" = sem `p`, os últimos 7 dias).
  const chips = [
    ["hoje", t("Hoje"), "/m/campanhas?p=hoje"],
    ["ontem", t("Ontem"), "/m/campanhas?p=ontem"],
    ["sete", t("Uma semana"), "/m/campanhas"],
    ["tudo", t("Período total"), "/m/campanhas?p=tudo"],
  ] as const;
  const estado = (bruto: string | null) => { const e = bruto?.toUpperCase() ?? null; return e === "ACTIVE" ? { c: "on", r: t("Ativa") } : e === "PAUSED" ? { c: "", r: t("Pausada") } : { c: "", r: e ? t("Parada") : "" }; };

  return (
    <main className="m-pagina">
      <div className="m-topo">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Campanhas")}</b></div>
        <span className="m-periodo">{intervalo.de === intervalo.ate ? curto(intervalo.de) : `${curto(intervalo.de)} – ${curto(intervalo.ate)}`}</span>
      </div>
      <div className="m-chips">
        {chips.map(([k, r, href]) => <Link className={`m-chip${intervalo.chave === k ? " on" : ""}`} href={href} key={k} replace scroll={false}>{r}</Link>)}
        <Personalizado activo={intervalo.chave === "personalizado"} ate={intervalo.ate} caminho="/m/campanhas" de={intervalo.de} hoje={hoje} textos={{ aplicar: t("Ver resultados"), ate: t("Até"), de: t("De"), personalizado: t("Personalizado") }} />
      </div>

      {!d ? <div className="m-vazio">{t("Não foi possível carregar as campanhas.")}</div> : !d.temDados ? (
        <VazioMascote>{t("Ainda não há dados de anúncios desta empresa.")}</VazioMascote>
      ) : (
        <>
          <div className="m-rot">{t("Investido")}</div>
          <div className="m-grande">{dinheiro(d.gasto)}</div>
          {dias > 1 ? <Curva bolha={(n) => dinheiro(n)} valores={listaDias.map((k) => gastoPorDia.get(k) ?? 0)} /> : <div style={{ height: 16 }} />}

          <div className="m-duas">
            <div className="m-vc"><small>{t("Leads novos")}</small><strong>{d.contactosNovos}</strong><em>{t("{n} de anúncio", { n: d.contactosComAnuncio })}</em></div>
            <div className="m-vc"><small>{t("Custo por lead")}</small><strong>{d.custoPorContacto === null ? "—" : dinheiro(d.custoPorContacto)}</strong><em>{t("{n} cliques", { n: d.cliquesLink || d.cliques })}</em></div>
          </div>

          <div className="m-sec"><h2>{t("Por campanha")}</h2></div>
          {d.porCampanha.length ? (
            <div className="m-lista-camp">
              {d.porCampanha.map((p) => {
                const e = estado(p.estado);
                return (
                  <div className="m-camp" key={p.id}>
                    <div className="topo-c"><b>{p.nome}</b>{e.r ? <span className={`m-estado-c ${e.c}`}><i />{e.r}</span> : null}</div>
                    <div className="nums">
                      <div><strong>{dinheiro(p.gasto)}</strong><small>{t("investido")}</small></div>
                      <div><strong>{p.contactosAtribuidos}</strong><small>{t("leads")}</small></div>
                      <div><strong>{p.contactosAtribuidos ? dinheiro(p.gasto / p.contactosAtribuidos) : "—"}</strong><small>{t("por lead")}</small></div>
                      <div><strong>{p.marcacoesAtribuidas}</strong><small>{t("agendaram")}</small></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div className="m-vazio">{t("Nenhuma campanha com gasto neste período.")}</div>}
          <p className="m-discreto">{t("Os leads por campanha contam só quem chegou com o anúncio identificado, por isso são um mínimo.")}</p>
        </>
      )}
    </main>
  );
}

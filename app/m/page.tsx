import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, diferencaDias, duracaoCurta, iniciais, moeda, partesNoFuso } from "@/lib/movel/formato";
import { dadosHoje, type DadosHoje } from "@/lib/movel/hoje";

import { IcBarras, IcBusca, IcCalendario, IcCanal, IcConversa, IcEuro, IcMais, IcSeta, IcSino } from "./_c/icones";

export const dynamic = "force-dynamic";

function minutosAte(iso: string, agora: Date) {
  return Math.round((Date.parse(iso) - agora.getTime()) / 60_000);
}

export default async function HojeMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const agora = new Date();
  let d: DadosHoje | null = null;
  try {
    d = await dadosHoje(c.clienteSlug, c.fuso, agora);
  } catch {
    d = null;
  }

  const hora = Number(partesNoFuso(agora, c.fuso).hora.slice(0, 2));
  const saudacao = hora < 12 ? t("Bom dia") : hora < 19 ? t("Boa tarde") : t("Boa noite");
  const dataLonga = new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "long", timeZone: c.fuso, weekday: "long" }).format(agora);
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? "EUR");
  const hojeChave = chaveDoDia(agora, c.fuso);

  if (!d) {
    return <main className="m-pagina"><div className="m-vazio">{t("Não foi possível carregar a tela Hoje.")}</div></main>;
  }

  const futuros = d.agenda.filter((m) => Date.parse(m.fim) > agora.getTime());
  const proximo = futuros[0] ?? null;
  const depois = futuros.slice(1, 3);
  const restantes = Math.max(0, futuros.length - 3);
  const previsto = d.agenda.reduce((a, m) => a + (m.valor ?? 0), 0);
  const maxLeads = Math.max(1, ...d.ontem.leadsPorDia);
  const maxGasto = Math.max(0.01, ...(d.campanhas?.gastoPorDia ?? [0]));
  const nomesDias = d.semana.map((k) => new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${k}T12:00:00Z`)).replace(".", ""));
  const dias7 = d.ontem.leadsPorDia.map((_, i) => new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(Date.parse(`${hojeChave}T12:00:00Z`) - (7 - i) * 86_400_000)).replace(".", ""));
  const diferenca = Math.round(d.ontem.leads - d.ontem.mediaLeads);

  return (
    <main className="m-pagina">
      <div className="m-topo">
        <Link aria-label={t("Ajustes")} className="m-avatar" href="/m/ajustes">{iniciais(c.nomeUsuario || c.clienteNome)}</Link>
        <div className="m-ola"><small style={{ textTransform: "capitalize" }}>{dataLonga}</small><b>{c.nomeUsuario ? `${saudacao}, ${c.nomeUsuario}` : saudacao}</b></div>
        <Link aria-label={t("Procurar")} className="m-redondo" href="/m/busca"><IcBusca /></Link>
        <Link aria-label={t("Conversas")} className="m-redondo" href="/m/conversas">{d.pendencias.some((p) => p.tipo === "espera") ? <span className="m-ponto" /> : null}<IcSino /></Link>
      </div>

      <section className="m-destaque">
        <span className="m-destaque-agente"><i />{c.clienteNome}</span>
        <div className="rot">{t("Previsto para hoje")}</div>
        <div className="valor">{dinheiro(previsto)}</div>
        <div className="sub">{d.agenda.length === 1 ? t("1 agendamento") : t("{n} agendamentos", { n: d.agenda.length })}{d.amanha ? ` · ${t("amanhã: {n}", { n: d.amanha })}` : ""}</div>
        <div className="m-accoes">
          <Link className="m-accao" href="/m/agenda?nova=1"><span className="b"><IcMais /></span>{t("Marcar")}</Link>
          <Link className="m-accao" href="/m/conversas"><span className="b"><IcConversa /></span>{t("Conversas")}</Link>
          <Link className="m-accao" href="/m/agenda"><span className="b"><IcCalendario /></span>{t("Agenda")}</Link>
          <Link className="m-accao" href="/m/resultados"><span className="b"><IcBarras /></span>{t("Resultados")}</Link>
        </div>
      </section>

      <nav aria-label={t("Agenda")} className="m-dias">
        {d.semana.map((k, i) => (
          <Link className={`m-dia${k === hojeChave ? " on" : ""}`} href={`/m/agenda?dia=${k}`} key={k}>
            {d!.diasComMarcacao.includes(k) ? <i /> : null}
            <span style={{ textTransform: "capitalize" }}>{nomesDias[i]}</span>
            <b>{Number(k.slice(8))}</b>
          </Link>
        ))}
      </nav>

      {d.pendencias.length ? (
        <>
          <div className="m-sec"><h2>{t("Precisa de você")}<span className="m-n">{d.pendencias.length}</span></h2></div>
          <div className="m-lista">
            {d.pendencias.slice(0, 6).map((p) =>
              p.tipo === "espera" ? (
                <Link className="m-linha" href={`/m/conversas/${encodeURIComponent(p.conversa)}`} key={`e-${p.conversa}`}>
                  <div className={`m-quad ${p.canal === "instagram" ? "ig" : p.canal === "messenger" ? "ms" : "wa"}`}><IcCanal canal={p.canal} tamanho={22} /></div>
                  <div className="m-meio"><b>{p.nome}</b><span><span className="m-espera">{duracaoCurta(p.desde, agora)}</span>{p.previa ? ` · ${p.previa}` : ""}</span></div>
                  <span className="m-pilula">{t("Responder")}</span>
                </Link>
              ) : (
                <Link className="m-linha" href={p.conversa ? `/m/conversas/${encodeURIComponent(p.conversa)}` : "/m/agenda"} key={`s-${p.nome}-${p.inicio}`}>
                  <div className="m-quad eur"><IcEuro /></div>
                  <div className="m-meio"><b>{p.nome}</b><span>{p.valor ? t("Falta o sinal · {valor}", { valor: dinheiro(p.valor) }) : t("Falta o sinal")} · {partesNoFuso(p.inicio, c.fuso).hora}</span></div>
                  <span className="m-pilula">{t("Cobrar")}</span>
                </Link>
              ),
            )}
          </div>
        </>
      ) : null}

      <div className="m-sec"><h2>{t("Agenda de hoje")}</h2><Link href="/m/agenda">{t("Ver tudo")} <IcSeta /></Link></div>
      {proximo ? (
        <div className="m-bento">
          <Link className="m-prox" href="/m/agenda">
            <span className="etq">{t("Próximo")}</span>
            <div className="hora">{partesNoFuso(proximo.inicio, c.fuso).hora}</div>
            <div className="em">{minutosAte(proximo.inicio, agora) <= 0 ? t("acontecendo agora") : minutosAte(proximo.inicio, agora) < 60 ? t("daqui a {n} min", { n: minutosAte(proximo.inicio, agora) }) : t("daqui a {n} h", { n: Math.round(minutosAte(proximo.inicio, agora) / 60) })}</div>
            <div className="quem"><b>{proximo.nome || t("Agendamento")}</b><span>{[proximo.servico, proximo.executor].filter(Boolean).join(" · ")}</span>{proximo.valor ? <span>{dinheiro(proximo.valor)}{proximo.pendenteSinal ? ` · ${t("falta sinal")}` : ""}</span> : null}</div>
          </Link>
          {depois.map((m) => (
            <Link className="m-peq" href="/m/agenda" key={m.id}>
              <div className="h">{partesNoFuso(m.inicio, c.fuso).hora}</div>
              <b>{m.nome || t("Agendamento")}</b>
              <span>{[m.servico, m.valor ? dinheiro(m.valor) : null].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
          {restantes ? <Link className="m-mais" href="/m/agenda">{t("Ver os outros {n}", { n: restantes })} <IcSeta /></Link> : null}
        </div>
      ) : (
        <div className="m-vazio">{d.agenda.length ? t("Os agendamentos de hoje já passaram.") : t("Nenhum agendamento hoje.")}</div>
      )}

      <div className="m-sec"><h2>{t("Ontem")}</h2><Link href="/m/resultados">{t("Resultados")} <IcSeta /></Link></div>
      <Link className="m-cartao-num" href="/m/resultados" style={{ display: "block" }}>
        <div className="m-nums">
          <div className="m-num"><strong>{d.ontem.leads}</strong><small>{t("leads")}</small></div>
          <div className="m-num"><strong>{d.ontem.agendaram}</strong><small>{t("agendaram")}</small></div>
          <div className="m-num"><strong>{dinheiro(d.ontem.valor)}</strong><small>{t("agendado")}</small></div>
        </div>
        <div aria-hidden="true" className="m-barras">{d.ontem.leadsPorDia.map((v, i) => <div className={i === 6 ? "on" : ""} key={i} style={{ height: `${Math.max(8, (v / maxLeads) * 100)}%` }} />)}</div>
        <div aria-hidden="true" className="m-dias-b">{dias7.map((n, i) => <span key={i} style={{ textTransform: "capitalize" }}>{n}</span>)}</div>
        <div className="m-rodape">
          {diferenca > 0 ? <><b>+{diferenca}</b> {t("leads acima da média dos últimos 7 dias")}</> : diferenca < 0 ? <>{t("{n} leads abaixo da média dos últimos 7 dias", { n: Math.abs(diferenca) })}</> : t("Na média dos últimos 7 dias")}
        </div>
      </Link>

      {d.campanhas ? (
        <>
          <div className="m-sec"><h2>{t("Campanhas")}</h2><Link href="/m/resultados">{t("Últimos 7 dias")} <IcSeta /></Link></div>
          <Link className="m-cartao-num" href="/m/resultados" style={{ display: "block" }}>
            {d.campanhas.ativos ? <span className="m-estado-camp"><i />{d.campanhas.ativos === 1 ? t("1 anúncio ativo") : t("{n} anúncios ativos", { n: d.campanhas.ativos })}</span> : null}
            <div className="m-nums" style={{ marginTop: 14 }}>
              <div className="m-num"><strong>{dinheiro(d.campanhas.gasto)}</strong><small>{t("investido")}</small></div>
              <div className="m-num"><strong>{d.campanhas.leads}</strong><small>{t("leads")}</small></div>
              <div className="m-num"><strong>{d.campanhas.leads ? dinheiro(d.campanhas.gasto / d.campanhas.leads) : "—"}</strong><small>{t("por lead")}</small></div>
            </div>
            <div aria-hidden="true" className="m-barras">{d.campanhas.gastoPorDia.map((v, i) => <div className={i === 6 ? "on" : ""} key={i} style={{ height: `${Math.max(8, (v / maxGasto) * 100)}%` }} />)}</div>
            <div aria-hidden="true" className="m-dias-b">{dias7.map((n, i) => <span key={i} style={{ textTransform: "capitalize" }}>{n}</span>)}</div>
            {d.campanhas.anuncios.length ? (
              <div className="m-anuncios">
                {d.campanhas.anuncios.map((a) => (
                  <div className="m-anuncio" key={a.nome}>
                    <div className="topo-a"><b>{a.nome}</b><span>{a.leads === 1 ? t("1 lead") : t("{n} leads", { n: a.leads })}</span></div>
                    <div className="m-progresso"><i style={{ width: `${Math.round((a.leads / Math.max(1, d!.campanhas!.leads)) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="m-rodape">{d.campanhas.agendaram ? <><b>{d.campanhas.agendaram === 1 ? t("1 agendou") : t("{n} agendaram", { n: d.campanhas.agendaram })}</b> {t("vindos de anúncio")} · {dinheiro(d.campanhas.valorAgendado)}</> : t("Nenhum agendamento vindo de anúncio nestes 7 dias")}</div>
          </Link>
        </>
      ) : null}

      {diferencaDias(agora, agora, c.fuso) === 0 ? null : null}
    </main>
  );
}

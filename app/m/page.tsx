import Link from "next/link";

import { hojeRapido } from "@/lib/movel/cache";
import { contextoMovel } from "@/lib/movel/contexto";
import { corDe, duracaoCurta, iniciais, moeda, partesNoFuso } from "@/lib/movel/formato";
import type { DadosHoje } from "@/lib/movel/hoje";

import { IcBusca, IcCalendario, IcConversa, IcMais, IcPessoa, IcSino } from "./_c/icones";
import { VazioMascote } from "@/app/m/_c/vazio";

export const dynamic = "force-dynamic";

const primeiroNome = (nome: string) => nome.split(/\s+/)[0] ?? nome;

export default async function HojeMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const agora = new Date();
  let d: DadosHoje | null = null;
  try {
    d = await hojeRapido(c.clienteSlug, c.fuso);
  } catch {
    d = null;
  }

  const hora = Number(partesNoFuso(agora, c.fuso).hora.slice(0, 2));
  const saudacao = hora < 12 ? t("Bom dia") : hora < 19 ? t("Boa tarde") : t("Boa noite");
  const semNome = (canal: string) => (canal === "instagram" ? t("Cliente do Instagram") : canal === "messenger" ? t("Cliente do Messenger") : t("Cliente"));
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? "EUR");
  const hhmm = (iso: string) => partesNoFuso(iso, c.fuso).hora;

  const topo = (
    <div className="m-topo">
      <Link aria-label={t("Ajustes")} className="m-avatar" href="/m/ajustes">{iniciais(c.nomeUsuario || c.clienteNome)}</Link>
      <div className="m-ola"><small>{c.nomeUsuario ? `${saudacao},` : saudacao}</small> {c.nomeUsuario}</div>
      <Link aria-label={t("Procurar")} className="m-redondo" href="/m/busca"><IcBusca tamanho={17} /></Link>
      <Link aria-label={t("Conversas")} className="m-redondo" href="/m/conversas">{d?.pendencias.some((p) => p.tipo === "espera") ? <span className="m-ponto" /> : null}<IcSino tamanho={17} /></Link>
    </div>
  );

  if (!d) {
    return <main className="m-pagina">{topo}<div className="m-vazio">{t("Não foi possível carregar a tela Hoje.")}</div></main>;
  }

  const feitos = d.agenda.filter((m) => Date.parse(m.fim) <= agora.getTime()).length;
  const futuros = d.agenda.filter((m) => Date.parse(m.fim) > agora.getTime());
  const proximo = futuros[0] ?? null;
  const minutos = proximo ? Math.round((Date.parse(proximo.inicio) - agora.getTime()) / 60_000) : 0;
  const falta = !proximo ? "" : minutos <= 0 ? t("agora") : minutos < 60 ? t("em {n} min", { n: minutos }) : t("em {n} h", { n: Math.round(minutos / 60) });
  // Uma risca por agendamento (no máximo 16, para caberem): as verdes já passaram.
  const riscas = d.agenda.length <= 16 ? d.agenda.map((m) => Date.parse(m.fim) <= agora.getTime()) : Array.from({ length: 16 }, (_, i) => i < Math.round((feitos / d!.agenda.length) * 16));

  return (
    <main className="m-pagina m-com-folha">
      {topo}
      {/* Só a Lexia (admin) vê dados de várias empresas: diz de qual é esta tela. */}
      {c.admin ? <Link className="m-vendo" href="/m/ajustes">{t("Vendo: {empresa}", { empresa: c.clienteNome })}</Link> : null}

      <div className="m-dia-num"><b>{d.agenda.length}</b><span>{t("na agenda hoje")}</span></div>
      <div aria-hidden="true" className="m-dia-barra">{riscas.length ? riscas.map((f, i) => <i className={f ? "f" : ""} key={i} />) : <i />}</div>
      <div className="m-dia-leg">
        {d.agenda.length ? <span>{feitos === 1 ? t("1 feito") : t("{n} feitos", { n: feitos })}</span> : null}
        {d.agenda.length ? <span className="sep" /> : null}
        {proximo ? <span>{t("próximo às")} <b>{hhmm(proximo.inicio)}</b></span> : <span>{d.amanha ? t("amanhã: {n}", { n: d.amanha }) : t("nada marcado para amanhã")}</span>}
      </div>

      <div className="m-pills">
        <Link className="m-pill jade" href="/m/agenda?nova=1"><IcMais tamanho={15} />{t("Marcar")}</Link>
        <Link className="m-pill" href="/m/conversas"><IcConversa tamanho={15} />{t("Conversas")}</Link>
        <Link className="m-pill" href="/m/agenda"><IcCalendario tamanho={15} />{t("Agenda")}</Link>
      </div>

      {d.pendencias.length ? (
        <>
          <div className="m-sec"><h2>{t("À sua espera")}</h2><Link href="/m/conversas">{t("Ver todas")}</Link></div>
          <div className="m-pessoas">
            {d.pendencias.slice(0, 12).map((p) => {
              const nome = p.tipo === "espera" ? p.nome || semNome(p.canal) : p.nome || t("Cliente");
              const href = p.conversa ? `/m/conversas/${encodeURIComponent(p.conversa)}` : "/m/agenda";
              return (
                <Link className="m-pessoa" href={href} key={`${p.tipo}-${p.conversa ?? p.nome}`}>
                  <div className="c" style={{ background: corDe(p.conversa ?? nome) }}>{iniciais(nome)}</div>
                  <b>{primeiroNome(nome)}</b>
                  <small>{p.tipo === "espera" ? duracaoCurta(p.desde, agora).replace(/ h \d+ min$/, " h") : t("sinal")}</small>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="m-sec"><h2>{t("Próximos")}</h2><Link href="/m/agenda">{t("Agenda")}</Link></div>
      {proximo ? (
        <div className="m-carrossel">
          {futuros.slice(0, 8).map((m, i) => (
            <Link className={`m-cartao-c ${i === 0 ? "c1" : "c2"}`} href={m.conversa ? `/m/conversas/${encodeURIComponent(m.conversa)}` : "/m/agenda"} key={m.id}>
              <div className="l1"><span>{i === 0 ? t("Próximo") : t("Depois")}</span>{i === 0 ? <span>{falta}</span> : null}</div>
              <div className="hr">{hhmm(m.inicio)}</div>
              <div className="q">{m.nome || t("Agendamento")}</div>
              {i === 0 ? <div className="s">{[m.servico, m.executor ? m.executor.charAt(0).toUpperCase() + m.executor.slice(1) : null].filter(Boolean).join(" · ")}</div> : null}
            </Link>
          ))}
        </div>
      ) : (
        <VazioMascote pose={d.agenda.length ? "feliz" : "ola"}>{d.agenda.length ? t("Os agendamentos de hoje já passaram.") : t("Nenhum agendamento hoje.")}</VazioMascote>
      )}

      <section className="m-folha-baixo">
        <div className="pega" />
        <div className="m-sec"><h2>{t("O que aconteceu")}</h2><Link href="/m/resultados?p=hoje">{t("Ver tudo")}</Link></div>
        {d.aconteceu.length ? d.aconteceu.map((a) => (
          <Link className="m-mov" href={a.conversa ? `/m/conversas/${encodeURIComponent(a.conversa)}` : "/m/agenda"} key={`${a.tipo}-${a.quando}-${a.nome}`}>
            <div className="ic">{a.tipo === "marcou" ? <IcCalendario tamanho={15} /> : <IcPessoa tamanho={15} />}</div>
            <div className="m">
              <b>{a.tipo === "marcou" ? t("{nome} marcou", { nome: a.nome || t("Cliente") }) : t("Lead novo: {nome}", { nome: a.nome || t("sem nome") })}</b>
              <span>{[a.tipo === "marcou" ? a.servico : null, a.tipo === "marcou" ? (a.doAgente ? t("pelo agente") : t("à mão")) : a.deAnuncio ? t("de anúncio") : null, hhmm(a.quando)].filter(Boolean).join(" · ")}</span>
            </div>
            {a.tipo === "marcou" && a.valor ? <div className="v">+{dinheiro(a.valor)}</div> : null}
          </Link>
        )) : <p className="m-folha-vazio">{t("Nada de novo nas últimas 24 horas.")}</p>}
      </section>
    </main>
  );
}

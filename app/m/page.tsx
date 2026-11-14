import Link from "next/link";

import { ecraPermitido } from "@/lib/auth/ecras";
import { hojeRapido } from "@/lib/movel/cache";
import { clientesAtivos, contextoMovel } from "@/lib/movel/contexto";
import { esperasPorEmpresa } from "@/lib/movel/esperas";
import { duracaoCurta, iniciais, moeda, partesNoFuso } from "@/lib/movel/formato";
import type { DadosHoje } from "@/lib/movel/hoje";
import { moedaPadraoDoCliente } from "@/lib/servicos/config";

import { IcAnuncios, IcBusca, IcCalendario, IcCheck, IcConversa, IcMais, IcSeta, IcSino } from "./_c/icones";
import { Iniciais, Moldado } from "./_c/pecas";

export const dynamic = "force-dynamic";

const primeiroNome = (nome: string) => nome.split(/\s+/)[0] ?? nome;

/**
 * Hoje (desenho v6, 14/11): agendamentos de hoje em número grande, atalhos
 * redondos, conversas e leads de hoje, o cartão escuro dos anúncios (7 dias),
 * o que fazer agora (a lista única de esperas + leads quentes), a agenda do
 * dia e o que já ficou resolvido. Sem textos de explicação.
 */
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
  // A Lexia vê o total de todas as empresas no ícone: aqui diz onde estão as outras.
  let outras = 0;
  if (c.admin) {
    try {
      const porEmpresa = await esperasPorEmpresa((await clientesAtivos()).map((x) => x.slug));
      outras = Object.entries(porEmpresa).filter(([slug]) => slug !== c.clienteSlug).reduce((a, [, n]) => a + n, 0);
    } catch {
      outras = 0;
    }
  }

  const pode = (ecra: string) => ecraPermitido(c.clienteSlug, ecra);
  const dinheiro = (v: number) => moeda(v, c.locale, d?.moeda ?? moedaPadraoDoCliente(c.clienteSlug));
  const hhmm = (iso: string) => partesNoFuso(iso, c.fuso).hora;
  const semNome = (canal: string) => (canal === "instagram" ? t("Cliente do Instagram") : canal === "messenger" ? t("Cliente do Messenger") : t("Cliente"));
  const conversaHref = (conversa: string) => `/m/conversas/${encodeURIComponent(conversa)}`;

  const topo = (
    <header className="m6-topo">
      <Link aria-label={t("Ajustes")} className="m-ini" href="/m/ajustes" style={{ fontSize: 13, height: 36, width: 36 }}>{iniciais(c.nomeUsuario || c.clienteNome).slice(0, 1)}</Link>
      <p className="ola">{t("Olá,")} <b>{c.nomeUsuario || c.clienteNome}</b></p>
      <Link aria-label={t("Procurar")} className="m-ic" href="/m/busca"><IcBusca tamanho={20} /></Link>
      <Link aria-label={t("Avisos")} className="m-ic" href="/m/avisos"><IcSino tamanho={20} />{d?.avisoRecente ? <span className="m6-ponto" /> : null}</Link>
    </header>
  );

  const admin = c.admin ? (
    <div className="m6-admin">
      <Link className="m-vendo" href="/m/ajustes#empresas">{t("Vendo: {empresa}", { empresa: c.clienteNome })}</Link>
      {outras ? <Link className="m6-outras" href="/m/ajustes#empresas">{t("Outras empresas: {n} esperando", { n: outras })}<IcSeta tamanho={13} /></Link> : null}
    </div>
  ) : null;

  if (!d) {
    return <main className="m-pagina m6 m6-hoje">{topo}{admin}<div className="m-vazio">{t("Não foi possível carregar a tela Hoje.")}</div></main>;
  }

  const total = d.agenda.length;
  const feitos = d.agenda.filter((m) => Date.parse(m.fim) <= agora.getTime()).length;
  const doAgente = d.agenda.filter((m) => m.doAgente).length;
  const proximo = d.agenda.find((m) => Date.parse(m.inicio) > agora.getTime()) ?? null;
  // Um segmento por agendamento (no máximo 12; depois, proporcional).
  const segmentos = total ? (total <= 12 ? d.agenda.map((m) => Date.parse(m.fim) <= agora.getTime()) : Array.from({ length: 12 }, (_, i) => i < Math.round((feitos / total) * 12))) : [];

  const atalhos = [
    pode("/app/agenda") ? { href: "/m/agenda?nova=1", icone: <IcMais tamanho={22} />, r: t("Marcar") } : null,
    pode("/app/conversas") ? { href: "/m/conversas", icone: <IcConversa tamanho={22} />, r: t("Conversas") } : null,
    pode("/app/agenda") ? { href: "/m/agenda", icone: <IcCalendario tamanho={22} />, r: t("Agenda") } : null,
    pode("/app/campanhas") ? { href: "/m/campanhas", icone: <IcAnuncios tamanho={22} />, r: t("Anúncios") } : null,
  ].filter(Boolean) as { href: string; icone: React.ReactNode; r: string }[];

  const camp = d.campanhas && (d.campanhas.gasto > 0 || d.campanhas.leads > 0) ? d.campanhas : null;
  const paraFazer = d.esperas.length + d.quentes.length;

  const cartaoAnuncios = camp ? (
    <>
      <span className="topo"><span>{t("Anúncios · 7 dias")}</span>{pode("/app/campanhas") ? <IcSeta tamanho={16} /> : null}</span>
      <span className="frase">
        <Moldado
          partes={{
            agendamentos: <b className="v">{camp.agendaram === 1 ? t("1 agendamento") : t("{n} agendamentos", { n: camp.agendaram })}</b>,
            leads: <b className="v">{camp.leads === 1 ? t("1 lead") : t("{n} leads", { n: camp.leads })}</b>,
            valor: <b>{dinheiro(camp.gasto)}</b>,
          }}
          texto={t("{valor} investidos trouxeram {leads} e {agendamentos}.")}
        />
      </span>
      {camp.leads && camp.gasto ? <span className="pe">{t("{valor} por lead", { valor: dinheiro(camp.gasto / camp.leads) })}</span> : null}
    </>
  ) : null;

  return (
    <main className="m-pagina m6 m6-hoje">
      {topo}
      {admin}

      <section aria-label={t("Agendamentos hoje")} className="m6-bloco">
        <span className="m6-rotulo">{t("Agendamentos hoje")}</span>
        <div className="m6-numero">
          <span className="n">{total}</span>
          {doAgente ? <span className="m6-pilula">{t("+{n} pelo agente", { n: doAgente })}</span> : null}
        </div>
        {segmentos.length ? <div aria-hidden="true" className="m6-segmentos" style={{ gridTemplateColumns: `repeat(${segmentos.length}, minmax(0, 1fr))` }}>{segmentos.map((f, i) => <i className={f ? "f" : ""} key={i} />)}</div> : null}
        {proximo ? (
          <p className="m6-linha2">{t("Próximo às")} <b>{hhmm(proximo.inicio)}</b> · {[proximo.nome || t("Agendamento"), proximo.servico?.toLowerCase()].filter(Boolean).join(", ")}</p>
        ) : d.amanha ? <p className="m6-linha2">{d.amanha === 1 ? t("Amanhã: 1 agendamento") : t("Amanhã: {n} agendamentos", { n: d.amanha })}</p> : null}
      </section>

      {atalhos.length ? (
        <nav aria-label={t("Atalhos")} className="m6-atalhos">
          {atalhos.map((a) => <Link className="m6-atalho" href={a.href} key={a.href}><span className="c">{a.icone}</span>{a.r}</Link>)}
        </nav>
      ) : null}

      <div className="m6-par">
        <Link href="/m/conversas">
          <span className="m6-rotulo">{t("Conversas hoje")}</span>
          <span className="n">{d.conversasHoje.total}</span>
          <span className="s">{t("{n} respondidas pelo agente", { n: d.conversasHoje.peloAgente })}</span>
        </Link>
        <Link href={pode("/app/clientes") ? "/m/clientes" : "/m/conversas"}>
          <span className="m6-rotulo">{t("Leads hoje")}</span>
          <span className="n">{d.leadsHoje.total}</span>
          <span className="s">{t("{n} de anúncio", { n: d.leadsHoje.deAnuncio })}</span>
        </Link>
      </div>

      {cartaoAnuncios ? (pode("/app/campanhas") ? <Link aria-label={t("Anúncios · 7 dias")} className="m6-escuro" href="/m/campanhas">{cartaoAnuncios}</Link> : <div className="m6-escuro">{cartaoAnuncios}</div>) : null}

      {paraFazer ? (
        <section aria-label={t("Para fazer agora")}>
          <div className="m6-sec"><h2>{t("Para fazer agora")}</h2><span className="alerta">{paraFazer}</span></div>
          <div className="m6-lista">
            {d.esperas.map((e) => {
              const nome = e.nome || semNome(e.canal);
              return (
                <Link className="m6-linha" href={conversaHref(e.conversa)} key={e.conversa}>
                  <Iniciais tamanho={40} texto={iniciais(nome)} />
                  <span className="meio"><span className="nome">{nome}</span><span className="det">{e.previa ? `“${e.previa}”` : t("Esperando resposta")}</span></span>
                  <span className="espera">{duracaoCurta(e.desde, agora)}</span>
                </Link>
              );
            })}
            {d.quentes.map((q) => {
              const nome = q.nome || semNome(q.canal);
              return (
                <Link className="m6-linha" href={conversaHref(q.conversa)} key={q.conversa}>
                  <Iniciais tamanho={40} texto={iniciais(nome)} />
                  <span className="meio"><span className="nome">{t("{nome} está quente", { nome: primeiroNome(nome) })}</span>{q.motivo ? <span className="det">{q.motivo}</span> : null}</span>
                  <span className="seta"><IcSeta tamanho={16} /></span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {total ? (
        <section aria-label={t("Agenda de hoje")}>
          <div className="m6-sec"><h2>{t("Agenda de hoje")}</h2>{pode("/app/agenda") ? <Link href="/m/agenda">{t("Ver agenda")}</Link> : null}</div>
          <div className="m6-lista">
            {d.agenda.map((m) => {
              const passou = Date.parse(m.fim) <= agora.getTime();
              const conteudo = (
                <>
                  <span className="hora">{hhmm(m.inicio)}</span>
                  <span className="meio-l">{m.nome || t("Agendamento")}{m.servico ? <span className="cinza"> · {m.servico}</span> : null}</span>
                  {passou ? <span className="feito">{t("feito")}</span> : m.doAgente ? <span className="m6-tag">{t("agente")}</span> : null}
                </>
              );
              return m.conversa
                ? <Link className={`m6-linha${passou ? " passou" : ""}`} href={conversaHref(m.conversa)} key={m.id}>{conteudo}</Link>
                : <div className={`m6-linha${passou ? " passou" : ""}`} key={m.id}>{conteudo}</div>;
            })}
          </div>
        </section>
      ) : null}

      {d.resolvidos.length ? (
        <section aria-label={t("Já resolvido hoje")} className="m6-resolvido">
          <span className="m6-rotulo">{t("Já resolvido hoje")}</span>
          {d.resolvidos.map((r, i) => {
            const nome = primeiroNome(r.nome || t("Cliente"));
            const texto = r.tipo === "respondida" ? t("{nome} respondido", { nome }) : r.servico ? t("{nome} marcou {servico} pelo agente", { nome, servico: r.servico.toLowerCase() }) : t("{nome} marcou pelo agente", { nome });
            const corpo = <><IcCheck tamanho={16} />{texto}</>;
            return r.conversa ? <Link href={conversaHref(r.conversa)} key={`${r.tipo}-${r.conversa}-${i}`}>{corpo}</Link> : <p key={`${r.tipo}-${i}`}>{corpo}</p>;
          })}
        </section>
      ) : null}
    </main>
  );
}

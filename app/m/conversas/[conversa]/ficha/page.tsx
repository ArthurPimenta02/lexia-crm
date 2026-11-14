import Link from "next/link";
import { notFound } from "next/navigation";

import { ecraPermitido } from "@/lib/auth/ecras";
import { contextoMovel } from "@/lib/movel/contexto";
import { lerFicha } from "@/lib/movel/ficha";
import { iniciais, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { isValidConversationId } from "@/lib/redis/agent-locks";
import { getMoedaDoCliente } from "@/lib/servicos/config";

import { IcCalendarioMais, IcConversa, IcTelefone } from "../../../_c/icones";
import { BotaoVoltar } from "../../../_c/voltar";

export const dynamic = "force-dynamic";

/** Ficha do cliente (desenho v6, 14/11): quem é, de onde veio, quanto já gastou e as marcações. */
export default async function FichaMovel({ params }: { params: Promise<{ conversa: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const conversa = decodeURIComponent((await params).conversa);
  if (!isValidConversationId(conversa)) notFound();
  const d = await lerFicha(c.clienteSlug, conversa).catch(() => null);
  if (!d) notFound();

  const codigo = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);
  const dinheiro = (v: number) => moeda(v, c.locale, codigo);
  const canal = d.canal === "whatsapp" ? "WhatsApp" : d.canal === "instagram" ? "Instagram" : "Messenger";
  const nome = d.nome || (d.canal === "instagram" ? t("Cliente do Instagram") : d.canal === "messenger" ? t("Cliente do Messenger") : t("Cliente"));
  const dataCurta = (iso: string) => new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: c.fuso }).format(new Date(iso)).replace(".", "");
  const ddmm = (iso: string) => { const p = partesNoFuso(iso, c.fuso); return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`; };
  const temp = d.temperatura;
  const rotuloTemp = temp ? (temp.temperatura === "quente" ? t("Quente") : temp.temperatura === "morno" ? t("Morno") : t("Frio")) : null;
  const chat = `/m/conversas/${encodeURIComponent(conversa)}`;
  const podeMarcar = ecraPermitido(c.clienteSlug, "/app/agenda");
  const proximo = d.agendamentos.futuros[0]?.id;

  return (
    <main className="m-pagina m6 sem-abas m6-ficha">
      <BotaoVoltar reserva={chat} rotulo={t("Voltar")} />

      <section aria-label={nome} className="quem">
        <span aria-hidden="true" className="m-ini" style={{ fontSize: 22, height: 72, width: 72 }}>{iniciais(nome)}</span>
        <h1>{nome}</h1>
        <p>{[d.telefoneLegivel, canal].filter(Boolean).join(" · ")}</p>
        {rotuloTemp ? <span className={`m6-pilula${temp!.temperatura === "quente" ? "" : " neutra"}`}>{[rotuloTemp, temp!.motivo].filter(Boolean).join(" · ")}</span> : null}
      </section>

      <nav aria-label={t("Ações")} className="m6-atalhos tres">
        <Link className="m6-atalho" href={chat}><span className="c"><IcConversa tamanho={21} /></span>{t("Conversa")}</Link>
        {d.telefone ? <a className="m6-atalho" href={`tel:+${d.telefone}`}><span className="c"><IcTelefone tamanho={21} /></span>{t("Ligar")}</a> : null}
        {podeMarcar ? <Link className="m6-atalho" href={`/m/agenda?nova=1${d.contactoId ? `&contacto=${encodeURIComponent(d.contactoId)}` : ""}`}><span className="c"><IcCalendarioMais tamanho={21} /></span>{t("Marcar")}</Link> : null}
      </nav>

      <dl className="m6-pares">
        <div><dt>{t("Chegou por")}</dt><dd>{d.deAnuncio ? (d.anuncio ? t("Anúncio · {nome}", { nome: d.anuncio }) : t("Anúncio")) : canal}</dd></div>
        {d.primeiroContato ? <div><dt>{t("Primeiro contato")}</dt><dd>{dataCurta(d.primeiroContato)}</dd></div> : null}
        {d.gasto.visitas ? (
          <div><dt>{t("Já gastou")}</dt><dd>{d.gasto.total ? <b>{dinheiro(d.gasto.total)} </b> : null}<span className="cinza">{d.gasto.total ? "· " : ""}{d.gasto.visitas === 1 ? t("1 visita") : t("{n} visitas", { n: d.gasto.visitas })}</span></dd></div>
        ) : null}
      </dl>

      {d.agendamentos.futuros.length || d.agendamentos.passados.length ? (
        <section aria-label={t("Agendamentos")}>
          <p className="m6-rotulo">{t("Agendamentos")}</p>
          {[...d.agendamentos.futuros, ...d.agendamentos.passados].map((m) => {
            const futuro = d.agendamentos.futuros.includes(m);
            return (
              <div className={`m6-ag${futuro ? "" : " passou"}`} key={m.id}>
                <span className="d">{ddmm(m.inicio)}</span>
                <span className="s">{m.servico || m.titulo || t("Agendamento")}{futuro ? <span className="cinza"> · {partesNoFuso(m.inicio, c.fuso).hora}</span> : null}</span>
                {m.id === proximo ? <span className="m6-tag">{t("próximo")}</span> : !futuro && m.valor ? <span className="v">{dinheiro(m.valor)}</span> : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}

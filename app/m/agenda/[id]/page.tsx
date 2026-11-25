import Link from "next/link";
import { notFound } from "next/navigation";

import { lerAgendamento } from "@/lib/movel/agendamento";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { getMoedaDoCliente } from "@/lib/servicos/config";

import { IcVoltar } from "../../_c/icones";
import { AcoesAgendamento } from "./acoes-ui";

export const dynamic = "force-dynamic";

/** Um agendamento (desenho aprovado a 25/11, tela 6): compareceu/faltou e as ações. */
export default async function AgendamentoMovel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volta?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const { id } = await params;
  const { volta } = await searchParams;
  const a = await lerAgendamento(c.clienteSlug, id).catch(() => null);
  if (!a) notFound();

  const agora = new Date();
  const dia = chaveDoDia(a.inicio, c.fuso);
  const voltar = typeof volta === "string" && /^\/m(\/[\w/%.?=&-]*)?$/.test(volta) ? volta : `/m/agenda?dia=${dia}`;
  const hoje = chaveDoDia(agora, c.fuso);
  const ontem = chaveDoDia(new Date(agora.getTime() - 86_400_000), c.fuso);
  const amanha = chaveDoDia(new Date(agora.getTime() + 86_400_000), c.fuso);
  const dataLonga = (() => {
    const r = new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "long", timeZone: c.fuso, weekday: "long" }).format(new Date(a.inicio));
    return r.charAt(0).toUpperCase() + r.slice(1);
  })();
  const relativo = dia === hoje ? t("Hoje") : dia === ontem ? t("Ontem") : dia === amanha ? t("Amanhã") : null;
  const passou = Date.parse(a.inicio) <= agora.getTime();
  const cancelado = a.estado === "cancelado";
  const codigoMoeda = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);
  const horas = (Date.parse(a.fim) - Date.parse(a.inicio)) / 3_600_000;
  const linhas: [string, string][] = [
    [t("Serviço"), a.servico ?? a.titulo ?? "—"],
    ...(a.executor ? [[t("Profissional"), a.executor] as [string, string]] : []),
    [t("Duração"), `${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 1 }).format(horas)} h`],
    ...(a.valor !== null ? [[t("Valor"), moeda(a.valor, c.locale, codigoMoeda)] as [string, string]] : []),
    [t("Marcado por"), a.origem === "agente" ? t("Agente") : a.origem === "painel" ? t("Equipe, pela Lexia") : t("Equipe, no Google")],
  ];

  return (
    <main className="m-pagina sem-abas ag ag-det">
      <Link aria-label={t("Voltar")} className="ag-x" href={voltar}><IcVoltar tamanho={18} /></Link>

      <p className="ag-det-data">{[relativo, dataLonga].filter(Boolean).join(" · ")}</p>
      <h1 className={`ag-det-hora${cancelado ? " cancelado" : ""}`}>{partesNoFuso(a.inicio, c.fuso).hora} – {partesNoFuso(a.fim, c.fuso).hora}</h1>
      {cancelado ? <p className="ag-det-tag">{t("Cancelado")}</p> : null}

      {a.conversa ? (
        <Link className="ag-det-cliente" href={`/m/conversas/${encodeURIComponent(a.conversa)}/ficha`}>
          <span className="av">{(a.nome || "?").slice(0, 2).toUpperCase()}</span>
          <span className="tx"><b>{a.nome || t("Cliente")}</b><small>{t("Ver ficha")} ›</small></span>
        </Link>
      ) : a.nome ? <div className="ag-det-cliente"><span className="av">{a.nome.slice(0, 2).toUpperCase()}</span><span className="tx"><b>{a.nome}</b></span></div> : null}

      <AcoesAgendamento
        conversa={a.conversa}
        id={a.id}
        pedePresenca={passou && !cancelado && Boolean(a.nome || a.telefone)}
        podeMudar={a.gerido && !cancelado && !passou}
        presenca={a.presenca}
        telefone={a.telefone}
        textos={{
          cancelar: t("Cancelar"),
          cancelarPergunta: t("Cancelar este agendamento?"),
          cancelarTexto: t("Ele sai da agenda do Google. O cliente não é avisado."),
          compareceu: t("Compareceu"),
          desfazer: t("Desfazer"),
          faltou: t("Faltou"),
          ligar: t("Ligar"),
          manter: t("Manter"),
          pergunta: t("O cliente compareceu?"),
          remarcar: t("Remarcar"),
          simCancelar: t("Sim, cancelar"),
          whatsapp: t("WhatsApp"),
        }}
      >
        <dl className="ag-det-linhas">
          {linhas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </AcoesAgendamento>
    </main>
  );
}

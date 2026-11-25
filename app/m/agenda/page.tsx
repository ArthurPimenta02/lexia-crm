import Link from "next/link";
import { redirect } from "next/navigation";

import { agendaDoDia, diaValido, somarDias, type Vista } from "@/lib/movel/agenda";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { marcarEstaLigado } from "@/lib/agenda/marcar";
import { getMoedaDoCliente } from "@/lib/servicos/config";
import { getServicosAgendaveis } from "@/lib/servicos/read";
import { ehContaDemo } from "@/lib/movel/demo";

import { IcSeta, IcVoltar } from "../_c/icones";
import { DiaAgenda } from "./dia";

export const dynamic = "force-dynamic";

export default async function AgendaMovel({ searchParams }: { searchParams: Promise<{ contacto?: string; dia?: string; nova?: string; prof?: string; vista?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const params = await searchParams;
  const agora = new Date();
  const hoje = chaveDoDia(agora, c.fuso);
  const dia = diaValido(params.dia, hoje);
  const prof = typeof params.prof === "string" ? params.prof : "";
  const vista: Vista = params.vista === "semana" || params.vista === "mes" ? params.vista : "dia";
  const url = (mudar: { dia?: string; vista?: Vista; prof?: string | null }) => {
    const q = new URLSearchParams();
    q.set("dia", mudar.dia ?? dia);
    const v = mudar.vista ?? vista;
    if (v !== "dia") q.set("vista", v);
    const pr = mudar.prof === undefined ? prof : mudar.prof;
    if (pr) q.set("prof", pr);
    return `/m/agenda?${q}`;
  };
  const mesAoLado = (n: number) => {
    const [a, m] = dia.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    return d.toISOString().slice(0, 10);
  };

  let dados: Awaited<ReturnType<typeof agendaDoDia>> | null = null;
  try {
    dados = await agendaDoDia(c.clienteSlug, c.fuso, dia, vista);
  } catch {
    dados = null;
  }
  // Conta demo: marca só na base da Lexia, com serviços fictícios (lib/movel/demo.ts).
  const demo = ehContaDemo(c.clienteSlug);
  // Marcar vive em /m/agendar (25/11). Aqui só se sabe SE dá para marcar, para
  // mostrar o botão e tornar os dias tocáveis.
  const podeMarcar = demo || (marcarEstaLigado() && (await getServicosAgendaveis(c.clienteSlug).catch(() => [])).length > 0);
  if (params.nova === "1" && podeMarcar) {
    redirect(`/m/agendar?dia=${dia}${typeof params.contacto === "string" ? `&contacto=${encodeURIComponent(params.contacto)}` : ""}`);
  }
  const marcarEm = (k: string) => (podeMarcar && k >= hoje ? `/m/agendar?dia=${k}&volta=agenda` : null);
  const codigoMoeda = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);

  const titulo = new Intl.DateTimeFormat(c.locale, { month: "long", timeZone: "UTC", year: dia.slice(0, 4) === hoje.slice(0, 4) ? undefined : "numeric" }).format(new Date(`${dia}T12:00:00Z`));
  const executores = [...new Set((dados?.eventos ?? []).filter((e) => e.estado !== "cancelado").map((e) => e.executor).filter(Boolean) as string[])];
  const eventos = (dados?.eventos ?? []).filter((e) => (!prof || e.executor === prof) && (vista !== "mes" || e.dia === dia));
  const ativos = eventos.filter((e) => e.estado !== "cancelado");
  const peloAgente = ativos.filter((e) => e.origem === "agente").length;
  const valorTotal = ativos.reduce((a, e) => a + (e.valor ?? 0), 0);
  const nomeDia = (k: string) => new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${k}T12:00:00Z`)).replace(".", "").toLowerCase();
  const anterior = url({ dia: vista === "mes" ? mesAoLado(-1) : somarDias(dia, -7) });
  const seguinte = url({ dia: vista === "mes" ? mesAoLado(1) : somarDias(dia, 7) });

  return (
    <main className="m-pagina m6 m6-agenda">
      <header className="m6-cab">
        <h1 style={{ textTransform: "capitalize" }}>{titulo}</h1>
        <nav aria-label={t("Ver por")} className="m6-seg">
          <Link aria-current={vista === "dia" ? "true" : undefined} href={url({ vista: "dia" })} replace>{t("Dia")}</Link>
          <Link aria-current={vista === "semana" ? "true" : undefined} href={url({ vista: "semana" })} replace>{t("Semana")}</Link>
          <Link aria-current={vista === "mes" ? "true" : undefined} href={url({ vista: "mes" })} replace>{t("Mês")}</Link>
        </nav>
      </header>

      <div className="m6-semana-nav">
        <Link aria-label={t("Anterior")} className="seta" href={anterior} replace><IcVoltar tamanho={16} /></Link>
        {vista === "mes" && dados ? (
          <div className="m6-mes">
            {dados.semana.map((k) => <span className="cab" key={`c-${k}`}>{nomeDia(k).slice(0, 3)}</span>)}
            {dados.grelha.map((k) => {
              const n = dados!.contagem[k] ?? 0;
              const fora = k < dados!.mes.inicio || k > dados!.mes.fim;
              return (
                // Tocar num dia de hoje em diante abre a marcação nesse dia (como no Google Agenda).
                <Link aria-current={k === dia ? "date" : undefined} className={`dia${fora ? " fora" : ""}${k === hoje ? " hoje" : ""}`} href={marcarEm(k) ?? url({ dia: k })} key={k} replace={!marcarEm(k)}>
                  <b>{Number(k.slice(8))}</b>
                  <i style={n ? undefined : { visibility: "hidden" }} />
                </Link>
              );
            })}
          </div>
        ) : (
          <nav aria-label={t("Dias da semana")} className="m6-dias">
            {(dados?.semana ?? []).map((k) => (
              <Link aria-current={k === dia ? "date" : undefined} className={`dia${k === hoje ? " hoje" : ""}`} href={url({ dia: k })} key={k} replace>
                {nomeDia(k)}
                <b>{Number(k.slice(8))}</b>
                <i style={dados!.diasComEventos.includes(k) ? undefined : { visibility: "hidden" }} />
              </Link>
            ))}
          </nav>
        )}
        <Link aria-label={t("Seguinte")} className="seta" href={seguinte} replace><IcSeta tamanho={16} /></Link>
      </div>
      {vista === "mes" && podeMarcar ? <p className="ag-dica">{t("Toque em qualquer dia para marcar nele")}</p> : null}

      {dados ? (
        <div className="m6-resumo">
          <span className="n">{ativos.length}</span>
          <span className="t">
            {ativos.length === 1 ? t("agendamento") : t("agendamentos")}
            {peloAgente ? <> · <span className="ac">{t("{n} pelo agente", { n: peloAgente })}</span></> : null}
            {valorTotal ? ` · ${moeda(valorTotal, c.locale, codigoMoeda)}` : null}
          </span>
        </div>
      ) : null}

      {executores.length > 1 ? (
        <nav aria-label={t("Profissional")} className="m6-chips">
          <Link aria-current={prof ? undefined : "true"} className={`m6-chip peq${prof ? "" : " on"}`} href={url({ prof: null })} replace>{t("Todos")}</Link>
          {executores.map((ex) => <Link aria-current={prof === ex ? "true" : undefined} className={`m6-chip peq${prof === ex ? " on" : ""}`} href={url({ prof: ex })} key={ex} replace style={{ textTransform: "capitalize" }}>{ex}</Link>)}
        </nav>
      ) : null}

      {!dados ? <div className="m-vazio" style={{ marginTop: 14 }}>{t("Não foi possível carregar a agenda.")}</div> : (
        <DiaAgenda
          horaAgora={partesNoFuso(agora, c.fuso).hora}
          dia={dia}
          eventos={eventos.map((e) => ({
            ...e,
            passou: Date.parse(e.fim) <= agora.getTime(),
            executor: e.executor ? e.executor.charAt(0).toUpperCase() + e.executor.slice(1) : null,
            // Vários dias: o primeiro mostra a hora de início, o último "até"
            // a hora de fim, e os do meio "Dia todo". A hora a ordenar fica 00:00
            // nos dias em que já vinha de trás, para ir para o topo do dia.
            hora: e.continuaDeAntes ? "00:00" : partesNoFuso(e.inicio, c.fuso).hora,
            rotuloHora: e.continuaDeAntes ? (e.continuaDepois ? t("Dia inteiro") : t("até {hora}", { hora: partesNoFuso(e.fim, c.fuso).hora })) : null,
            rotuloDia: (() => { const r = new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC", weekday: "long" }).format(new Date(`${e.dia}T12:00:00Z`)); return r.charAt(0).toUpperCase() + r.slice(1); })(),
            periodo: e.continuaDeAntes || e.continuaDepois ? new Intl.DateTimeFormat(c.locale, { day: "2-digit", hour: "2-digit", hour12: false, minute: "2-digit", month: "2-digit", timeZone: c.fuso }).formatRange(new Date(e.inicio), new Date(e.fim)) : null,
            horaFim: e.continuaDepois ? "24:00" : partesNoFuso(e.fim, c.fuso).hora,
            valorTexto: e.valor ? moeda(e.valor, c.locale, codigoMoeda) : null,
          }))}
          agrupar={vista === "semana"}
          eHoje={dia === hoje}
          hrefMarcar={podeMarcar ? (dia >= hoje ? `/m/agendar?dia=${dia}&volta=agenda` : "/m/agendar?volta=agenda") : null}
          textos={{
            abrirGoogle: t("Abrir no Google Agenda"),
            agente: t("Marcado pelo agente"),
            agenteTag: t("agente"),
            agora: t("Agora"),
            cancelado: t("Cancelado"),
            conversa: t("Abrir conversa"),
            dia: t("Dia"),
            faltaSinal: t("falta sinal"),
            fechar: t("Fechar"),
            ligar: t("Ligar"),
            manual: t("Marcado à mão"),
            marcar: t("Marcar"),
            marcarNeste: t("Toque para marcar neste dia"),
            nenhum: t("Nenhum agendamento neste dia."),
          }}
        />
      )}
    </main>
  );
}

import Link from "next/link";

import { getContactosParaEscolha } from "@/lib/clientes/read";
import { agendaDoDia, diaValido, somarDias, type Vista } from "@/lib/movel/agenda";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { marcarEstaLigado } from "@/lib/agenda/marcar";
import { getMoedaDoCliente } from "@/lib/servicos/config";
import { getServicosAgendaveis } from "@/lib/servicos/read";
import { ehContaDemo, SERVICOS_DEMO } from "@/lib/movel/demo";

import { IcVoltar } from "../_c/icones";
import { DiaAgenda } from "./dia";

export const dynamic = "force-dynamic";

const CORES = ["", "c1", "c2"];

export default async function AgendaMovel({ searchParams }: { searchParams: Promise<{ dia?: string; nova?: string; prof?: string; vista?: string }> }) {
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
  const podeMarcar = demo || marcarEstaLigado();
  const [contactos, servicos] = podeMarcar ? await Promise.all([getContactosParaEscolha(c.clienteSlug).catch(() => []), demo ? Promise.resolve(SERVICOS_DEMO) : getServicosAgendaveis(c.clienteSlug).catch(() => [])]) : [[], []];
  const codigoMoeda = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);

  const titulo = new Intl.DateTimeFormat(c.locale, { month: "long", timeZone: "UTC", year: dia.slice(0, 4) === hoje.slice(0, 4) ? undefined : "numeric" }).format(new Date(`${dia}T12:00:00Z`));
  const executores = [...new Set((dados?.eventos ?? []).filter((e) => e.estado !== "cancelado").map((e) => e.executor).filter(Boolean) as string[])];
  const corDoExecutor = (ex: string | null) => CORES[Math.max(0, executores.indexOf(ex ?? "")) % CORES.length];
  const eventos = (dados?.eventos ?? []).filter((e) => (!prof || e.executor === prof) && (vista !== "mes" || e.dia === dia));

  return (
    <main className="m-pagina">
      <div className="m-titulo">
        <h1 style={{ textTransform: "capitalize" }}>{titulo}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link aria-label={t("Anterior")} className="m-redondo" href={url({ dia: vista === "mes" ? mesAoLado(-1) : somarDias(dia, -7) })} replace><IcVoltar /></Link>
          <Link aria-label={t("Seguinte")} className="m-redondo" href={url({ dia: vista === "mes" ? mesAoLado(1) : somarDias(dia, 7) })} replace style={{ transform: "scaleX(-1)" }}><IcVoltar /></Link>
        </div>
      </div>

      <div className="m-segm" style={{ marginBottom: 12 }}>
        <Link className={vista === "dia" ? "on" : ""} href={url({ vista: "dia" })} replace>{t("Dia")}</Link>
        <Link className={vista === "semana" ? "on" : ""} href={url({ vista: "semana" })} replace>{t("Semana")}</Link>
        <Link className={vista === "mes" ? "on" : ""} href={url({ vista: "mes" })} replace>{t("Mês")}</Link>
      </div>

      {vista === "mes" && dados ? (
        <div className="m-mes">
          {dados.semana.map((k) => <span className="cab" key={`c-${k}`}>{new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "narrow" }).format(new Date(`${k}T12:00:00Z`))}</span>)}
          {dados.grelha.map((k) => {
            const n = dados!.contagem[k] ?? 0;
            const fora = k < dados!.mes.inicio || k > dados!.mes.fim;
            return (
              <Link className={`dia${fora ? " fora" : ""}${k === dia ? " on" : ""}${k === hoje ? " hoje" : ""}`} href={url({ dia: k })} key={k} replace>
                <b>{Number(k.slice(8))}</b>
                {n ? <span className="n">{n}</span> : <span className="n vazio" />}
              </Link>
            );
          })}
        </div>
      ) : null}

      {vista !== "mes" ? <nav className="m-dias" style={{ marginTop: 0 }}>
        {(dados?.semana ?? []).map((k) => (
          <Link className={`m-dia${k === dia ? " on" : ""}`} href={url({ dia: k })} key={k} replace>
            {dados!.diasComEventos.includes(k) ? <i /> : null}
            <span style={{ textTransform: "capitalize" }}>{new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${k}T12:00:00Z`)).replace(".", "")}</span>
            <b>{Number(k.slice(8))}</b>
          </Link>
        ))}
      </nav> : null}

      {executores.length > 1 ? (
        <div className="m-segm" style={{ margin: "12px 0 6px" }}>
          <Link className={prof ? "" : "on"} href={url({ prof: null })} replace>{t("Todos")}</Link>
          {executores.slice(0, 3).map((ex) => <Link className={prof === ex ? "on" : ""} href={url({ prof: ex })} key={ex} replace style={{ textTransform: "capitalize" }}>{ex}</Link>)}
        </div>
      ) : null}

      {!dados ? <div className="m-vazio" style={{ marginTop: 14 }}>{t("Não foi possível carregar a agenda.")}</div> : (
        <DiaAgenda
          horaAgora={partesNoFuso(agora, c.fuso).hora}
          contactos={contactos.map((x) => ({ id: x.id, nome: x.nome, telefone: x.telefone }))}
          dia={dia}
          eventos={eventos.map((e) => ({
            ...e,
            cor: corDoExecutor(e.executor),
            executor: e.executor ? e.executor.charAt(0).toUpperCase() + e.executor.slice(1) : null,
            hora: partesNoFuso(e.inicio, c.fuso).hora,
            rotuloDia: (() => { const r = new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: "UTC", weekday: "long" }).format(new Date(`${e.dia}T12:00:00Z`)); return r.charAt(0).toUpperCase() + r.slice(1); })(),
            horaFim: partesNoFuso(e.fim, c.fuso).hora,
            valorTexto: e.valor ? moeda(e.valor, c.locale, codigoMoeda) : null,
          }))}
          agrupar={vista === "semana"}
          eHoje={dia === hoje}
          abrirMarcar={params.nova === "1"}
          podeMarcar={podeMarcar && servicos.length > 0 && contactos.length > 0}
          servicos={servicos.map((s) => ({ executores: s.executores, id: s.id, nome: s.nome, preco: s.precoBase, precoTexto: s.precoBase ? moeda(s.precoBase, c.locale, codigoMoeda) : null }))}
          textos={{
            abrirGoogle: t("Abrir no Google Agenda"),
            agente: t("Marcado pelo agente"),
            cancelado: t("Cancelado"),
            cliente: t("Cliente"),
            confirmar: t("Confirmar"),
            conversa: t("Abrir conversa"),
            dia: t("Dia"),
            erroGeral: t("Não foi possível marcar."),
            escolhaCliente: t("Escolha o cliente"),
            faltaSinal: t("falta sinal"),
            fechar: t("Fechar"),
            hora: t("Hora"),
            ligar: t("Ligar"),
            manual: t("Marcado à mão"),
            marcado: t("Marcado!"),
            marcar: t("Marcar"),
            marcarMesmoAssim: t("Marcar mesmo assim"),
            nenhum: t("Nenhum agendamento neste dia."),
            novaMarcacao: t("Nova marcação"),
            ocupado: t("Já há algo nesse horário:"),
            procurarCliente: t("Procurar cliente"),
            profissional: t("Profissional"),
            servico: t("Serviço"),
          }}
        />
      )}
    </main>
  );
}

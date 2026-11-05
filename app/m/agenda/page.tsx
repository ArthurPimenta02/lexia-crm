import Link from "next/link";

import { getContactosParaEscolha } from "@/lib/clientes/read";
import { agendaDoDia, diaValido, somarDias } from "@/lib/movel/agenda";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { marcarEstaLigado } from "@/lib/agenda/marcar";
import { getMoedaDoCliente } from "@/lib/servicos/config";
import { getServicosAgendaveis } from "@/lib/servicos/read";

import { IcVoltar } from "../_c/icones";
import { DiaAgenda } from "./dia";

export const dynamic = "force-dynamic";

const CORES = ["", "c1", "c2"];

export default async function AgendaMovel({ searchParams }: { searchParams: Promise<{ dia?: string; nova?: string; prof?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const params = await searchParams;
  const agora = new Date();
  const hoje = chaveDoDia(agora, c.fuso);
  const dia = diaValido(params.dia, hoje);
  const prof = typeof params.prof === "string" ? params.prof : "";

  let dados: Awaited<ReturnType<typeof agendaDoDia>> | null = null;
  try {
    dados = await agendaDoDia(c.clienteSlug, c.fuso, dia);
  } catch {
    dados = null;
  }
  const podeMarcar = marcarEstaLigado();
  const [contactos, servicos] = podeMarcar ? await Promise.all([getContactosParaEscolha(c.clienteSlug).catch(() => []), getServicosAgendaveis(c.clienteSlug).catch(() => [])]) : [[], []];
  const codigoMoeda = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);

  const titulo = new Intl.DateTimeFormat(c.locale, { month: "long", timeZone: "UTC", year: dia.slice(0, 4) === hoje.slice(0, 4) ? undefined : "numeric" }).format(new Date(`${dia}T12:00:00Z`));
  const executores = [...new Set((dados?.eventos ?? []).filter((e) => e.estado !== "cancelado").map((e) => e.executor).filter(Boolean) as string[])];
  const corDoExecutor = (ex: string | null) => CORES[Math.max(0, executores.indexOf(ex ?? "")) % CORES.length];
  const eventos = (dados?.eventos ?? []).filter((e) => !prof || e.executor === prof);

  return (
    <main className="m-pagina">
      <div className="m-titulo">
        <h1 style={{ textTransform: "capitalize" }}>{titulo}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link aria-label={t("Semana anterior")} className="m-redondo" href={`/m/agenda?dia=${somarDias(dia, -7)}`}><IcVoltar /></Link>
          <Link aria-label={t("Próxima semana")} className="m-redondo" href={`/m/agenda?dia=${somarDias(dia, 7)}`} style={{ transform: "scaleX(-1)" }}><IcVoltar /></Link>
        </div>
      </div>

      <nav className="m-dias" style={{ marginTop: 0 }}>
        {(dados?.semana ?? []).map((k) => (
          <Link className={`m-dia${k === dia ? " on" : ""}`} href={`/m/agenda?dia=${k}${prof ? `&prof=${encodeURIComponent(prof)}` : ""}`} key={k} replace>
            {dados!.diasComEventos.includes(k) ? <i /> : null}
            <span style={{ textTransform: "capitalize" }}>{new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${k}T12:00:00Z`)).replace(".", "")}</span>
            <b>{Number(k.slice(8))}</b>
          </Link>
        ))}
      </nav>

      {executores.length > 1 ? (
        <div className="m-segm" style={{ margin: "12px 0 6px" }}>
          <Link className={prof ? "" : "on"} href={`/m/agenda?dia=${dia}`} replace>{t("Todos")}</Link>
          {executores.slice(0, 3).map((ex) => <Link className={prof === ex ? "on" : ""} href={`/m/agenda?dia=${dia}&prof=${encodeURIComponent(ex)}`} key={ex} replace style={{ textTransform: "capitalize" }}>{ex}</Link>)}
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
            hora: partesNoFuso(e.inicio, c.fuso).hora,
            horaFim: partesNoFuso(e.fim, c.fuso).hora,
            valorTexto: e.valor ? moeda(e.valor, c.locale, codigoMoeda) : null,
          }))}
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

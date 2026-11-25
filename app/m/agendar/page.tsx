import { getContactosParaEscolha } from "@/lib/clientes/read";
import { agendaDoDia, diaValido, somarDias } from "@/lib/movel/agenda";
import { contextoMovel } from "@/lib/movel/contexto";
import { ehContaDemo, SERVICOS_DEMO } from "@/lib/movel/demo";
import { chaveDoDia, moeda, moedaDoCliente, partesNoFuso } from "@/lib/movel/formato";
import { marcarEstaLigado } from "@/lib/agenda/marcar";
import { indicativoPadrao } from "@/lib/agenda/agendar-app";
import { getMoedaDoCliente } from "@/lib/servicos/config";
import { getServicosAgendaveis } from "@/lib/servicos/read";

import { FormAgendar } from "./form";

export const dynamic = "force-dynamic";

/**
 * Novo agendamento (desenho aprovado a 25/11, telas 2, 3 e 5): uma tela só,
 * para preencher enquanto se fala com o cliente. `?dia=` vem de tocar num dia
 * da Agenda (mostra o que já está marcado nesse dia); `?contacto=` vem da
 * ficha de um cliente.
 */
export default async function AgendarMovel({ searchParams }: { searchParams: Promise<{ contacto?: string; dia?: string; volta?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const params = await searchParams;
  const agora = new Date();
  const hoje = chaveDoDia(agora, c.fuso);
  const diaPedido = typeof params.dia === "string" ? diaValido(params.dia, hoje) : null;
  const dia = diaPedido && diaPedido >= hoje ? diaPedido : hoje;

  const demo = ehContaDemo(c.clienteSlug);
  const ligado = demo || marcarEstaLigado();
  const [servicos, contactos, doDia] = ligado
    ? await Promise.all([
        demo ? Promise.resolve(SERVICOS_DEMO) : getServicosAgendaveis(c.clienteSlug).catch(() => []),
        getContactosParaEscolha(c.clienteSlug).catch(() => []),
        diaPedido ? agendaDoDia(c.clienteSlug, c.fuso, dia, "dia").catch(() => null) : Promise.resolve(null),
      ])
    : [[], [], null];
  const codigoMoeda = moedaDoCliente(getMoedaDoCliente(c.clienteSlug), c.fuso);

  // "Sex 27": curto, para caber na fila de botões.
  const rotuloDia = (k: string) => {
    const data = new Date(`${k}T12:00:00Z`);
    const sem = new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(data).replace(/\./g, "");
    return `${sem.charAt(0).toUpperCase()}${sem.slice(1)} ${Number(k.slice(8))}`;
  };
  const tituloDia = (() => {
    const r = new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "long", timeZone: "UTC", weekday: "short" }).format(new Date(`${dia}T12:00:00Z`)).replace(/\./g, "");
    return r.charAt(0).toUpperCase() + r.slice(1);
  })();

  return (
    <FormAgendar
      contactoInicial={typeof params.contacto === "string" ? params.contacto : null}
      contactos={contactos.map((x) => ({ id: x.id, nome: x.nome, telefone: x.telefone }))}
      dia={dia}
      diaFixo={diaPedido ? tituloDia : null}
      dias={[
        { chave: hoje, rotulo: t("Hoje") },
        { chave: somarDias(hoje, 1), rotulo: t("Amanhã") },
        { chave: somarDias(hoje, 2), rotulo: rotuloDia(somarDias(hoje, 2)) },
      ]}
      hoje={hoje}
      indicativo={indicativoPadrao(c.clienteSlug)}
      jaMarcados={(doDia?.eventos ?? [])
        .filter((e) => e.estado !== "cancelado" && e.dia === dia)
        .map((e) => ({ hora: e.continuaDeAntes ? "—" : partesNoFuso(e.inicio, c.fuso).hora, nome: e.nome || "—", servico: e.servico ?? "" }))}
      ligado={ligado && servicos.length > 0}
      locale={c.locale}
      moeda={codigoMoeda}
      servicos={servicos.map((s) => ({
        executores: s.executores.map((e) => ({ chave: e.chave, duracaoMinutos: e.duracaoMinutos, nome: e.nome })),
        id: s.id,
        nome: s.nome,
        preco: s.precoBase,
        precoTexto: s.precoBase ? moeda(s.precoBase, c.locale, codigoMoeda) : null,
      }))}
      textos={{
        cancelar: t("Cancelar"),
        cliente: t("Cliente"),
        clienteNovo: t("Cliente novo."),
        clienteNovoTexto: t("A ficha é criada sozinha quando você marcar."),
        confirmar: t("Marcar mesmo assim"),
        de: t("De onde veio?"),
        deOpcional: t("(opcional)"),
        deOutro: t("Escreva de onde veio"),
        dia: t("Dia"),
        duracao: t("Duração"),
        escolher: t("Escolher"),
        fechar: t("Fechar"),
        horario: t("Horário livre"),
        jaCliente: t("Já é cliente:"),
        jaMarcados: t("Já marcados neste dia"),
        maisHorarios: t("Mais horários"),
        marcar: t("Marcar"),
        marcarAs: t("Marcar {dia} às {hora}"),
        naoLigado: t("Ainda não dá para marcar pelo app nesta empresa."),
        nenhumLivre: t("Nenhum horário livre neste dia."),
        nomeDoCliente: t("Nome do cliente"),
        novo: t("Novo agendamento"),
        observacao: t("Observação"),
        ocupado: t("Já há algo nesse horário:"),
        outroDia: t("Outro dia"),
        outroHorario: t("Outro horário"),
        profissional: t("Profissional"),
        servico: t("Serviço"),
        telefone: t("Telefone"),
        valor: t("Valor"),
        origens: JSON.stringify([
          ["meta", t("Anúncio")],
          ["organico", t("Orgânico")],
          ["indicacao", t("Indicação")],
          ["google", t("Google")],
          ["outro", t("Outro")],
        ]),
      }}
      volta={params.volta === "agenda" ? `/m/agenda?dia=${dia}&vista=mes` : typeof params.volta === "string" && /^\/m\/[\w/%.-]+$/.test(params.volta) ? params.volta : "/m"}
    />
  );
}

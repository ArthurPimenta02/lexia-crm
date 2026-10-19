import "server-only";

import { normalizarTelefone, pareceTelefone } from "@/lib/clientes/telefone";
import { getClientTimezone, instanteNoFuso } from "@/lib/clientes/timezone";
import {
  getServicosAgendaveis,
  type ServicoAgendavel,
} from "@/lib/servicos/read";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marcar pela aba Agenda.
 *
 * Quatro coisas medidas a 2026-10-19 que explicam a forma deste ficheiro.
 *
 * 1. O evento é criado no Google PRIMEIRO, pelo n8n, e só depois se escreve o
 *    espelho. A ordem não é estética: a `lexia_agendamentos` é uma cópia da
 *    agenda do Google refrescada a cada 15 minutos. Uma linha escrita só aqui
 *    desaparecia na sincronização seguinte, e entretanto o painel mostrava uma
 *    marcação que não existe na agenda de ninguém.
 *
 * 2. O espelho fica com `origem: 'painel'`, e isso sobrevive à sincronização.
 *    A `Normalizar Agendamentos` marca `manual` tudo o que não encontra na
 *    tabela de marcações do cliente, e um evento criado aqui vai lá estar —
 *    por isso o normal é passar a `agente`. O rebaixamento para `manual` é
 *    impedido pelo gatilho `lexia_agendamentos_antes_de_escrever_trg`, que foi
 *    executado contra a tabela real: inserido `painel`, o upsert com `manual`
 *    devolve `painel` e o com `agente` devolve `agente`.
 *
 * 3. Quem cria o evento é um workflow do n8n à parte, e não o `criar_marcacao`
 *    do agente. O `Validar Pedido` desse workflow tem regras que existem para
 *    travar a IA e que não se devem aplicar ao dono: não marca hoje, não marca
 *    ao domingo, exige grade de 30 minutos, exige nome com dois nomes, e força
 *    `tipo = avaliacao` nos 4 serviços com `exige_avaliacao`. Medido no
 *    catálogo real: isso deixava 8 dos 14 serviços impossíveis de marcar pelo
 *    painel, incluindo os 4 mais caros (225 €, 500 €, 200 €, 180 €), porque
 *    duram mais do que um dia de trabalho e caem no "termina depois do fecho".
 *    Pôr um atalho dentro do workflow do agente era mexer no caminho que está
 *    em produção para um cliente a pagar.
 *
 * 4. O nome, o telefone e a viatura vêm da ficha lida aqui e nunca do
 *    formulário — a mesma regra do `registarServicoDeCliente`, pela mesma
 *    razão. É o telefone que liga a marcação ao histórico e ao total gasto;
 *    um número vindo do navegador escrevia a venda na ficha de outra pessoa.
 */

/** O que o formulário manda, tal como o navegador o escreveu. */
export type CamposNovaMarcacao = {
  contactoId: string;
  dataBruto: string;
  duracaoBruto: string;
  executorBruto: string;
  horaBruto: string;
  observacoesBruto: string;
  servicoIdBruto: string;
  tituloBruto: string;
  valorBruto: string;
  viaturaBruto: string;
};

/** Uma marcação já validada, pronta a ir para o Google. */
export type MarcacaoPreparada = {
  duracaoMinutos: number;
  executorChave: string;
  executorNome: string;
  fimIso: string;
  inicioIso: string;
  nomeCliente: string;
  observacoes: string | null;
  servicoNome: string;
  telefone: string;
  titulo: string;
  valor: number | null;
  viatura: string | null;
};

/**
 * Um aviso é uma coisa que o dono devia saber e não uma coisa que o trave.
 *
 * A diferença entre isto e um erro é a decisão que o Arthur tomou: a agenda é
 * do Martim, e um painel que lhe responda "não" ao domingo é um painel que ele
 * deixa de abrir. O que o agente recusa, aqui avisa-se.
 */
export type AvisoDaMarcacao = {
  texto: string;
};

export type PreparacaoDaMarcacao = {
  avisos: AvisoDaMarcacao[];
  erro: string | null;
  marcacao: MarcacaoPreparada | null;
};

function recusar(mensagem: string): PreparacaoDaMarcacao {
  return { avisos: [], erro: mensagem, marcacao: null };
}

const limiteDuracaoMinutos = 60 * 24 * 14;

/**
 * As horas em que cada um trabalha, só para avisar.
 *
 * Copiadas do `janelaTrabalho` do `Validar Pedido` (lido pela API do n8n a
 * 2026-10-19): Martim de segunda a sexta 9–18 e sábado 9–13, Roberto de
 * segunda a sexta 9–17, nenhum dos dois ao domingo. Estão aqui em duplicado de
 * propósito — são o que gera a frase do aviso, e não o que decide se a
 * marcação passa. Quem decide é o dono.
 */
const horarioPorExecutor: Record<string, (diaDaSemana: number) => number[] | null> = {
  martim: (dia) => (dia >= 1 && dia <= 5 ? [9, 18] : dia === 6 ? [9, 13] : null),
  roberto: (dia) => (dia >= 1 && dia <= 5 ? [9, 17] : null),
};

/**
 * Em que dia da semana e a que horas é que este instante cai, no fuso do
 * cliente. 1 é segunda-feira, 7 é domingo — como no Luxon do n8n, para o aviso
 * e a regra do workflow falarem da mesma coisa.
 */
function diaEHoraNoFuso(iso: string, timeZone: string) {
  const partes = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
  }).formatToParts(new Date(iso));

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  const semana = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    diaDaSemana: semana.indexOf(valor("weekday")) + 1,
    horaDecimal: Number(valor("hour")) % 24 + Number(valor("minute")) / 60,
  };
}

/**
 * Valida tudo antes de alguém escrever em sítio nenhum.
 *
 * Corre inteiro antes do Google de propósito. São três sistemas sem transacção
 * entre eles — Google, a base do cliente e o espelho — e tudo o que possa ser
 * recusado tem de ser recusado enquanto ainda não existe nada. Um id de
 * serviço mal escrito a chegar depois do evento criado deixava um buraco na
 * agenda do Martim que ninguém sabia porque é que lá estava.
 */
export async function prepararNovaMarcacao({
  campos,
  clienteSlug,
}: {
  campos: CamposNovaMarcacao;
  clienteSlug: string;
}): Promise<PreparacaoDaMarcacao> {
  const servicoId = campos.servicoIdBruto.trim();
  const contactoId = campos.contactoId.trim();
  const dia = campos.dataBruto.trim();
  const hora = campos.horaBruto.trim();

  if (!contactoId) {
    return recusar("Escolhe o cliente.");
  }

  if (!servicoId) {
    return recusar("Escolhe o serviço.");
  }

  if (!dia || !hora) {
    return recusar("Escolhe o dia e a hora.");
  }

  // A leitura por `cliente_slug` e `id` é, ao mesmo tempo, a autorização sobre
  // o `contactoId` que veio do navegador: uma ficha de outra empresa não
  // aparece aqui.
  const admin = createAdminClient();
  const { data: contacto, error: erroContacto } = await admin
    .from("lexia_contactos")
    .select("id, nome, telefone, viatura")
    .eq("cliente_slug", clienteSlug)
    .eq("id", contactoId)
    .maybeSingle();

  if (erroContacto) {
    console.error("[agenda] falha a ler a ficha antes de marcar", erroContacto);

    return recusar("Não foi possível ler a ficha do cliente.");
  }

  if (!contacto) {
    return recusar("Cliente não encontrado.");
  }

  const nomeCliente = (contacto.nome ?? "").trim();
  const telefone = normalizarTelefone(contacto.telefone);

  if (!nomeCliente) {
    return recusar("Esta ficha não tem nome. Põe o nome primeiro.");
  }

  // Sem número não há ponte. A marcação ficava na agenda sem nunca aparecer na
  // ficha do cliente nem no total gasto, que é a razão de ser disto tudo.
  if (!pareceTelefone(telefone)) {
    return recusar(
      "Esta ficha não tem um número de telefone a sério, e é o número que liga a marcação ao histórico. Põe o número primeiro.",
    );
  }

  const servicos = await getServicosAgendaveis(clienteSlug);

  if (servicos.length === 0) {
    return recusar(
      "Não há serviços agendáveis configurados para este cliente, por isso não há nada para marcar.",
    );
  }

  // A lista vem da tabela de agendamento do cliente, por isso é ela a
  // autorização sobre o `servicoId`: um id que não seja desta empresa não
  // aparece aqui. É também de onde sai o nome, porque a marcação guarda o
  // nome e não o id.
  const servico: ServicoAgendavel | undefined = servicos.find(
    (linha) => linha.id === servicoId,
  );

  if (!servico) {
    return recusar("Serviço desconhecido.");
  }

  const executor = servico.executores.find(
    (linha) => linha.chave === campos.executorBruto.trim(),
  );

  if (!executor) {
    return recusar(
      `Escolhe quem faz o serviço. "${servico.nome}" é feito por ${servico.executores
        .map((linha) => linha.nome)
        .join(" ou ")}.`,
    );
  }

  const timeZone = getClientTimezone(clienteSlug);
  const inicioIso = instanteNoFuso(dia, hora, timeZone);

  if (!inicioIso) {
    return recusar("Essa data e hora não existem.");
  }

  const duracaoBruto = campos.duracaoBruto.trim();
  const duracaoMinutos =
    duracaoBruto === ""
      ? executor.duracaoMinutos
      : Math.round(Number(duracaoBruto));

  if (
    !Number.isFinite(duracaoMinutos) ||
    duracaoMinutos <= 0 ||
    duracaoMinutos > limiteDuracaoMinutos
  ) {
    return recusar("A duração tem de ser um número de minutos acima de zero.");
  }

  const fimIso = new Date(
    new Date(inicioIso).getTime() + duracaoMinutos * 60_000,
  ).toISOString();

  let valor: number | null = null;
  const valorBruto = campos.valorBruto.trim();

  if (valorBruto !== "") {
    const numero = Number(valorBruto.replace(",", "."));

    if (!Number.isFinite(numero) || numero < 0 || numero > 1_000_000) {
      return recusar("O valor tem de ser um número igual ou maior que zero.");
    }

    valor = Math.round(numero * 100) / 100;
  }

  const titulo = campos.tituloBruto.trim().slice(0, 500);

  if (titulo === "") {
    return recusar("Escreve o nome do evento.");
  }

  const observacoes = campos.observacoesBruto.trim().slice(0, 4000);
  // A viatura pode vir escrita no formulário porque hoje nenhuma ficha a tem:
  // medido a 2026-10-19, 0 dos 352 contactos do Detail têm a coluna
  // preenchida. Vem da ficha quando lá estiver, e do que o dono escrever
  // enquanto não estiver.
  const viatura =
    campos.viaturaBruto.trim().slice(0, 160) || contacto.viatura?.trim() || null;

  const avisos: AvisoDaMarcacao[] = [];
  const { diaDaSemana, horaDecimal } = diaEHoraNoFuso(inicioIso, timeZone);
  const janela = horarioPorExecutor[executor.chave]?.(diaDaSemana) ?? null;
  const fimDecimal = horaDecimal + duracaoMinutos / 60;

  if (new Date(inicioIso).getTime() < Date.now()) {
    avisos.push({ texto: "Esta hora já passou." });
  }

  if (!janela) {
    avisos.push({
      texto: `${executor.nome} não trabalha neste dia da semana.`,
    });
  } else if (horaDecimal < janela[0] || fimDecimal > janela[1]) {
    avisos.push({
      texto: `Fica fora do horário de ${executor.nome} (${janela[0]}h–${janela[1]}h).`,
    });
  }

  if (duracaoMinutos > 8 * 60) {
    avisos.push({
      texto: `São ${(duracaoMinutos / 60).toFixed(1)} horas seguidas — este serviço costuma ser feito em mais do que um dia.`,
    });
  }

  return {
    avisos,
    erro: null,
    marcacao: {
      duracaoMinutos,
      executorChave: executor.chave,
      executorNome: executor.nome,
      fimIso,
      inicioIso,
      nomeCliente,
      observacoes: observacoes || null,
      servicoNome: servico.nome,
      telefone,
      titulo,
      valor,
      viatura,
    },
  };
}

/** Um evento que já está naquela hora, na agenda daquele executor. */
export type ConflitoNaAgenda = {
  fim: string | null;
  inicio: string | null;
  titulo: string | null;
};

type RespostaDoWorkflow = {
  calendario_id?: string;
  conflitos?: ConflitoNaAgenda[];
  event_id?: string;
  link_google?: string;
  marcacao_id?: string;
  mensagem?: string;
  status?: string;
};

export type ResultadoDaMarcacao = {
  /** Preenchido quando o executor já tem trabalho àquela hora. */
  conflitos: ConflitoNaAgenda[];
  erro: string | null;
  linkGoogle: string | null;
  ok: boolean;
};

function lerConfiguracaoDoWorkflow() {
  const url = process.env.N8N_AGENDA_WEBHOOK_URL?.trim();
  const segredo = process.env.N8N_AGENDA_WEBHOOK_SECRET?.trim();

  if (!url || !segredo || segredo.length < 32) {
    return null;
  }

  return { segredo, url };
}

/** Se o painel já consegue marcar, ou se ainda falta ligar o workflow. */
export function marcarEstaLigado() {
  return lerConfiguracaoDoWorkflow() !== null;
}

/**
 * Cria o evento no Google e a linha na base do cliente, e só depois o espelho.
 *
 * O trabalho é todo do n8n — aqui só se fala com ele. Não é preguiça: quem tem
 * as credenciais do Google é o n8n, e quem sabe qual dos dois calendários
 * pertence a que executor também. Refazer isso em TypeScript era uma segunda
 * cópia das mesmas regras, a divergir da primeira ao primeiro calendário novo.
 *
 * O espelho é escrito aqui e não lá porque é aqui que se sabe que isto veio do
 * painel. Se a escrita do espelho falhar, a marcação **não** se desfaz: o
 * evento existe no Google e a venda está na base do cliente, que são as duas
 * fontes a sério. A próxima sincronização apanha a linha de qualquer maneira,
 * com `origem: 'manual'` em vez de `painel` — um rótulo pior, não um dado
 * perdido.
 */
export async function marcarNaAgenda({
  clienteSlug,
  ignorarConflito,
  marcacao,
}: {
  clienteSlug: string;
  ignorarConflito: boolean;
  marcacao: MarcacaoPreparada;
}): Promise<ResultadoDaMarcacao> {
  const config = lerConfiguracaoDoWorkflow();

  if (!config) {
    return {
      conflitos: [],
      erro: "A marcação pelo painel ainda não está ligada ao n8n.",
      linkGoogle: null,
      ok: false,
    };
  }

  let resposta: Response;

  try {
    resposta = await fetch(config.url, {
      body: JSON.stringify({
        cliente_slug: clienteSlug,
        duracao_min: marcacao.duracaoMinutos,
        estado: "confirmada",
        event: "lexia.agenda.marcacao.criada",
        executor: marcacao.executorChave,
        fim_iso: marcacao.fimIso,
        ignorar_conflito: ignorarConflito,
        inicio_iso: marcacao.inicioIso,
        nome: marcacao.nomeCliente,
        observacoes: marcacao.observacoes,
        servico: marcacao.servicoNome,
        telefone: marcacao.telefone,
        tipo: "servico",
        titulo: marcacao.titulo,
        valor: marcacao.valor,
        viatura: marcacao.viatura,
        version: "1",
      }),
      headers: {
        authorization: `Bearer ${config.segredo}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (erro) {
    console.error("[agenda] o workflow de marcação não respondeu", erro);

    return {
      conflitos: [],
      erro: "A agenda não respondeu a tempo. Confirma no Google se a marcação entrou antes de tentares outra vez.",
      linkGoogle: null,
      ok: false,
    };
  }

  if (!resposta.ok) {
    console.error("[agenda] o workflow de marcação recusou", resposta.status);

    return {
      conflitos: [],
      erro: "A agenda recusou a marcação. Tenta outra vez dentro de um instante.",
      linkGoogle: null,
      ok: false,
    };
  }

  let corpo: RespostaDoWorkflow;

  try {
    const lido: unknown = await resposta.json();

    // O "Respond to Webhook" do n8n devolve uma lista quando o nó traz mais do
    // que um item. Aceitar as duas formas evita que a marcação pareça falhada
    // por causa de um par de parênteses rectos.
    corpo = (Array.isArray(lido) ? lido[0] : lido) as RespostaDoWorkflow;
  } catch {
    return {
      conflitos: [],
      erro: "A agenda respondeu uma coisa que não se consegue ler. Confirma no Google antes de tentares outra vez.",
      linkGoogle: null,
      ok: false,
    };
  }

  if (corpo?.status === "CONFLITO") {
    return {
      conflitos: Array.isArray(corpo.conflitos) ? corpo.conflitos : [],
      erro: null,
      linkGoogle: null,
      ok: false,
    };
  }

  if (corpo?.status !== "CRIADO" || !corpo.event_id || !corpo.calendario_id) {
    return {
      conflitos: [],
      erro:
        corpo?.mensagem?.trim() ||
        "A agenda não confirmou a marcação. Confirma no Google antes de tentares outra vez.",
      linkGoogle: null,
      ok: false,
    };
  }

  const linkGoogle = corpo.link_google?.trim() || null;
  const admin = createAdminClient();
  const { error } = await admin.from("lexia_agendamentos").upsert(
    {
      calendario_id: corpo.calendario_id,
      cliente_slug: clienteSlug,
      dados: { observacoes_cliente: marcacao.observacoes, viatura: marcacao.viatura },
      descricao: marcacao.observacoes,
      dia_inteiro: false,
      estado: "confirmado",
      event_id: corpo.event_id,
      executor: marcacao.executorChave,
      fim: marcacao.fimIso,
      fuso: getClientTimezone(clienteSlug),
      inicio: marcacao.inicioIso,
      link_google: linkGoogle,
      nome_cliente: marcacao.nomeCliente,
      origem: "painel",
      referencia_cliente: corpo.marcacao_id ?? null,
      servico: marcacao.servicoNome,
      telefone: marcacao.telefone,
      titulo: marcacao.titulo,
      valor_previsto: marcacao.valor,
    },
    { onConflict: "cliente_slug,calendario_id,event_id" },
  );

  if (error) {
    // Não é um erro para o dono: o que ele pediu aconteceu. Fica no log para
    // se ver se acontece outra vez.
    console.error("[agenda] a marcação entrou mas o espelho falhou", error);
  }

  return { conflitos: [], erro: null, linkGoogle, ok: true };
}

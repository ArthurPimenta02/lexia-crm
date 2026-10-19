/**
 * As colunas de cada exportação.
 *
 * Vivem à parte dos painéis por duas razões. A primeira é poder testá-las sem
 * desenhar React. A segunda é que a escolha das colunas é uma decisão de
 * produto e não de ecrã: o que se exporta não é o que se mostra. O ecrã dos
 * clientes mostra quatro colunas porque mais do que isso não cabe; o ficheiro
 * leva tudo o que foi escrito sobre a pessoa, que é a razão de se exportar.
 */

import type { EventoAgenda } from "@/lib/agenda/read";
import type { ClienteLinha } from "@/lib/clientes/read";
import { dataParaFolha, type Coluna } from "@/lib/exportar/csv";
import { ETAPA_ROTULO } from "@/lib/pipeline/etapas";
import type { CartaoPipeline } from "@/lib/pipeline/read";

/**
 * Quem marcou: o agente, o painel, ou alguém à mão no Google.
 *
 * As três palavras que a base guarda não servem para ler num ficheiro —
 * "manual" podia ser qualquer uma das três coisas para quem abre o Excel.
 */
function quemMarcou(origem: string | null) {
  if (origem === "agente") {
    return "Agente";
  }

  if (origem === "painel") {
    return "Painel";
  }

  return "À mão";
}

export function colunasDeClientes(
  moeda: string,
  mostrarViatura: boolean,
  timeZone: string,
): Coluna<ClienteLinha>[] {
  return [
    { cabecalho: "Nome", valor: (c) => c.nome },
    { cabecalho: "Telefone", valor: (c) => c.telefone },
    { cabecalho: "Canal", valor: (c) => c.canal },
    // Os canais juntos, para quem tem o mesmo cliente em WhatsApp e Instagram.
    { cabecalho: "Outros canais", valor: (c) => c.canais.join(", ") },
    { cabecalho: "E-mail", valor: (c) => c.email },
    { cabecalho: "Morada", valor: (c) => c.morada },
    { cabecalho: "Idade", valor: (c) => c.idade },
    ...(mostrarViatura
      ? [{ cabecalho: "Carro", valor: (c: ClienteLinha) => c.viatura }]
      : []),
    // A origem tem duas colunas de propósito: uma é o que a Meta confirmou e a
    // outra é o que o dono se lembra. Juntá-las numa só apagava a diferença
    // entre um facto e uma memória, e a medida é que só 3% têm o facto.
    { cabecalho: "Origem (confirmada)", valor: (c) => c.origemCapturada },
    { cabecalho: "Origem (anotada)", valor: (c) => c.origemManual },
    { cabecalho: "Nota da origem", valor: (c) => c.origemManualNota },
    { cabecalho: "Mensagens", valor: (c) => c.mensagens },
    {
      cabecalho: "Primeiro contacto",
      valor: (c) => dataParaFolha(c.primeiroContactoEm, timeZone),
    },
    {
      cabecalho: "Última mensagem",
      valor: (c) => dataParaFolha(c.mensagemUltima, timeZone),
    },
    { cabecalho: "Marcações", valor: (c) => c.historico.length },
    { cabecalho: `Total gasto (${moeda})`, valor: (c) => c.totalGasto },
    { cabecalho: "Notas", valor: (c) => c.notas },
  ];
}

export function colunasDaAgenda(
  /**
   * Pode não haver moeda: a agenda não a exige, porque um cliente sem catálogo
   * de preços ligado não tem nenhuma. Nesse caso o cabeçalho fica só "Valor"
   * em vez de prometer uma unidade que não se sabe qual é.
   */
  moeda: string | null,
  timeZone: string,
): Coluna<EventoAgenda>[] {
  return [
    { cabecalho: "Início", valor: (e) => dataParaFolha(e.inicio, timeZone) },
    { cabecalho: "Fim", valor: (e) => dataParaFolha(e.fim, timeZone) },
    { cabecalho: "Dia inteiro", valor: (e) => e.diaInteiro },
    { cabecalho: "Título", valor: (e) => e.titulo },
    { cabecalho: "Cliente", valor: (e) => e.nomeCliente },
    { cabecalho: "Telefone", valor: (e) => e.telefone },
    { cabecalho: "Serviço", valor: (e) => e.servico },
    { cabecalho: "Quem faz", valor: (e) => e.executor },
    { cabecalho: "Marcado por", valor: (e) => quemMarcou(e.origem) },
    {
      cabecalho: moeda ? `Valor (${moeda})` : "Valor",
      valor: (e) => e.valorPrevisto,
    },
    { cabecalho: "Local", valor: (e) => e.localizacao },
    { cabecalho: "Link do Google", valor: (e) => e.linkGoogle },
  ];
}

export function colunasDoPipeline(timeZone: string): Coluna<CartaoPipeline>[] {
  return [
    // O nome da marcação primeiro, como no cartão: é o nome que a pessoa deu
    // quando marcou, e o do perfil do WhatsApp muitas vezes não é um nome.
    { cabecalho: "Nome", valor: (c) => c.marcacaoNome ?? c.nome },
    { cabecalho: "Nome no WhatsApp", valor: (c) => c.nome },
    { cabecalho: "Telefone", valor: (c) => c.telefone },
    { cabecalho: "Canal", valor: (c) => c.canal },
    { cabecalho: "Coluna", valor: (c) => ETAPA_ROTULO[c.etapa] },
    { cabecalho: "Porque está aqui", valor: (c) => c.porque },
    // A seguir à coluna, porque é a leitura da coluna: um cartão em "Agendado"
    // com "Sim" aqui é alguém que agendou e está à espera de resposta.
    { cabecalho: "À espera de resposta", valor: (c) => c.porResponder },
    { cabecalho: "Etiqueta da IA", valor: (c) => c.resultado },
    {
      cabecalho: "Dias sem falar",
      // Quem nunca trocou mensagens tem `dias` igual ao maior número inteiro
      // seguro do JavaScript — é o que faz um contacto sem conversa cair em
      // "Perdido". No ecrã nunca se vê, porque o cartão diz "Nunca trocou
      // mensagens"; numa folha de cálculo apareciam 9 mil bilhões e estragava
      // qualquer média da coluna.
      valor: (c) => (c.ultimaMensagemEm ? c.dias : null),
    },
    {
      cabecalho: "Última mensagem",
      valor: (c) => dataParaFolha(c.ultimaMensagemEm, timeZone),
    },
    { cabecalho: "Mensagens", valor: (c) => c.mensagens },
    { cabecalho: "Marcação", valor: (c) => dataParaFolha(c.marcacaoEm, timeZone) },
    { cabecalho: "Serviço da marcação", valor: (c) => c.marcacaoServico },
    { cabecalho: "Marcado por", valor: (c) => quemMarcou(c.marcacaoOrigem) },
  ];
}

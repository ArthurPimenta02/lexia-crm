/**
 * Que conversa é que a página das conversas abre, e quais entram na barra
 * lateral.
 *
 * Isto estava escrito duas vezes — uma no painel do cliente, outra no do admin
 * — e nos dois sítios tinha o mesmo defeito: a lista era filtrada pelo período
 * e a conversa pedida no link era procurada DENTRO da lista já filtrada. Um
 * link vindo de um handoff da semana passada caía fora do filtro por omissão
 * (os últimos 30 dias), a procura falhava, e o `?? primeiro da lista` abria a
 * conversa de OUTRA pessoa sem dizer nada. O dono lia uma conversa a pensar
 * que era a do handoff.
 *
 * As duas regras que isto garante:
 *
 * 1. A conversa pedida ganha sempre ao filtro. Fica fixada no topo da lista,
 *    marcada como fora do período, em vez de desaparecer.
 * 2. Se a conversa pedida não existe, não se abre nenhuma. Mostrar a conversa
 *    errada é pior do que não mostrar conversa nenhuma.
 */

type ConversationContact = {
  identificador_conversa: string;
};

export type ConversationSelection<Contact> = {
  /** Os contactos a listar, já ordenados, com o pedido à cabeça se preciso. */
  contacts: Contact[];
  /** Pediram uma conversa que este cliente não tem. */
  requestedIsMissing: boolean;
  /** A conversa pedida só está na lista porque o filtro foi contornado. */
  requestedIsOutsidePeriod: boolean;
  /** A conversa a abrir. `null` se não há nada para abrir. */
  selected: Contact | null;
};

export function resolveConversationSelection<
  Contact extends ConversationContact,
>({
  contacts,
  isInPeriod,
  requestedConversation,
  sortValue,
}: {
  contacts: Contact[];
  /**
   * Verdadeiro para os contactos que o filtro actual — período ou procura —
   * deixa na lista.
   */
  isInPeriod: (contact: Contact) => boolean;
  requestedConversation: string;
  /** Quanto maior, mais recente: a lista é ordenada por isto, decrescente. */
  sortValue: (contact: Contact) => number;
}): ConversationSelection<Contact> {
  const requested = requestedConversation
    ? contacts.find(
        (contact) =>
          contact.identificador_conversa === requestedConversation,
      ) ?? null
    : null;
  const requestedIsOutsidePeriod = requested ? !isInPeriod(requested) : false;
  // O contacto pedido entra mesmo quando o filtro o deixaria de fora: é por
  // aqui que um handoff antigo continua a abrir com o período em "hoje".
  const listed = contacts.filter(
    (contact) => contact === requested || isInPeriod(contact),
  );

  listed.sort((firstContact, secondContact) => {
    // O pedido vai à cabeça: é o que o dono veio ver.
    if (firstContact === requested) {
      return -1;
    }

    if (secondContact === requested) {
      return 1;
    }

    return sortValue(secondContact) - sortValue(firstContact);
  });

  return {
    contacts: listed,
    requestedIsMissing: Boolean(requestedConversation) && !requested,
    requestedIsOutsidePeriod,
    // Com uma conversa pedida abre-se essa ou nenhuma. Sem conversa pedida
    // abre-se a mais recente, como antes.
    selected: requestedConversation ? requested : listed[0] ?? null,
  };
}

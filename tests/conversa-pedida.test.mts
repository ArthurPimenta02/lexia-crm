/**
 * A conversa que o link pede é a conversa que abre.
 *
 * O defeito que isto tranca: as páginas das conversas filtravam a lista de
 * contactos pelo período e só depois procuravam lá dentro a conversa que o
 * link trazia no `?conversa=`. Um link vindo de um handoff da semana passada
 * caía fora do filtro por omissão, a procura falhava, e o `?? primeiro da
 * lista` abria a conversa de outra pessoa — sem aviso nenhum. O dono lia a
 * conversa errada a pensar que era a do handoff.
 *
 * Por isso o teste que importa mais aqui não é "a conversa certa abre"; é
 * "a conversa errada NÃO abre". Um fallback silencioso é pior do que um ecrã
 * vazio: no ecrã vazio percebe-se que algo falhou.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveConversationSelection } from "@/lib/conversations/select-conversation";

type Contacto = {
  identificador_conversa: string;
  nome: string;
  recencia: number;
};

const hoje: Contacto = {
  identificador_conversa: "whatsapp:351912345678",
  nome: "Falou hoje",
  recencia: 300,
};
const ontem: Contacto = {
  identificador_conversa: "whatsapp:351933333333",
  nome: "Falou ontem",
  recencia: 200,
};
const antiga: Contacto = {
  identificador_conversa: "instagram:17841400000000000",
  nome: "Handoff da semana passada",
  recencia: 100,
};

const todos = [antiga, hoje, ontem];

/** O filtro por omissão: só quem tem mensagens no período escolhido. */
function soHoje(contacto: Contacto) {
  return contacto.identificador_conversa === hoje.identificador_conversa;
}

function resolver(requestedConversation: string) {
  return resolveConversationSelection({
    contacts: todos,
    isInPeriod: soHoje,
    requestedConversation,
    sortValue: (contacto) => contacto.recencia,
  });
}

test("a conversa pedida abre mesmo estando fora do período filtrado", () => {
  const resultado = resolver(antiga.identificador_conversa);

  assert.equal(resultado.selected?.nome, antiga.nome);
  assert.equal(resultado.requestedIsOutsidePeriod, true);
  assert.equal(resultado.requestedIsMissing, false);
});

test("a conversa pedida fora do período continua a aparecer na lista", () => {
  const resultado = resolver(antiga.identificador_conversa);
  const nomes = resultado.contacts.map((contacto) => contacto.nome);

  assert.deepEqual(nomes, [antiga.nome, hoje.nome]);
});

test("pedir uma conversa que não existe não abre a de outra pessoa", () => {
  const resultado = resolver("whatsapp:351999999999");

  assert.equal(resultado.selected, null);
  assert.equal(resultado.requestedIsMissing, true);
});

test("sem conversa pedida abre-se a mais recente do período", () => {
  const resultado = resolver("");

  assert.equal(resultado.selected?.nome, hoje.nome);
  assert.equal(resultado.requestedIsMissing, false);
  assert.equal(resultado.requestedIsOutsidePeriod, false);
});

test("uma conversa pedida que já está no período não é marcada como fora", () => {
  const resultado = resolver(hoje.identificador_conversa);

  assert.equal(resultado.selected?.nome, hoje.nome);
  assert.equal(resultado.requestedIsOutsidePeriod, false);
  assert.equal(resultado.contacts.length, 1);
});

test("a lista mantém-se ordenada da mais recente para a mais antiga", () => {
  const resultado = resolveConversationSelection({
    contacts: todos,
    isInPeriod: () => true,
    requestedConversation: "",
    sortValue: (contacto) => contacto.recencia,
  });

  assert.deepEqual(
    resultado.contacts.map((contacto) => contacto.nome),
    [hoje.nome, ontem.nome, antiga.nome],
  );
});

test("a conversa pedida vai à cabeça da lista, mesmo sendo a mais antiga", () => {
  const resultado = resolveConversationSelection({
    contacts: todos,
    isInPeriod: () => true,
    requestedConversation: antiga.identificador_conversa,
    sortValue: (contacto) => contacto.recencia,
  });

  assert.deepEqual(
    resultado.contacts.map((contacto) => contacto.nome),
    [antiga.nome, hoje.nome, ontem.nome],
  );
});

test("a lista recebida não é mexida", () => {
  const original = [...todos];

  resolver(antiga.identificador_conversa);

  assert.deepEqual(todos, original);
});

/**
 * As páginas das conversas não podem voltar a procurar a conversa pedida
 * dentro da lista já filtrada. É esse `sortedContacts.find(...)` que criou o
 * defeito, e é um padrão que se reintroduz sem dar por isso.
 */
test("as páginas resolvem a conversa pelo helper e não pela lista filtrada", () => {
  const paginas = ["app/app/conversas/page.tsx", "app/admin/conversas/page.tsx"];

  for (const pagina of paginas) {
    const fonte = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");

    assert.match(
      fonte,
      /resolveConversationSelection\(/,
      `${pagina} tem de resolver a conversa pedida pelo helper`,
    );
    assert.doesNotMatch(
      fonte,
      /sortedContacts\s*\[0\]/,
      `${pagina} não pode cair na primeira conversa da lista`,
    );
  }
});

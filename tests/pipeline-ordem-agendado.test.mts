/**
 * A ordem dentro da coluna "Agendado".
 *
 * Desde 2026-10-19 que "Agendado" ganha a "Por responder", e o que impede isso
 * de esconder gente é a etiqueta vermelha no cartão. Mas uma etiqueta no
 * vigésimo cartão de uma coluna que rola não avisa ninguém — por isso quem
 * está à espera de resposta tem de subir ao topo.
 *
 * O caso aqui é o que revela a regra: quem espera resposta tem a marcação
 * MAIS LONGE. Pela ordem normal da coluna, que é a da marcação mais próxima,
 * ficaria em último.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const EMPRESA = "empresa_a";
const AGORA = new Date("2026-10-19T12:00:00.000Z");

const TELEFONE_ESPERA = "351911111111";
const TELEFONE_CALADO = "351922222222";

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_agendamentos: [
      {
        cliente_slug: EMPRESA,
        estado: "confirmado",
        inicio: "2026-10-25T09:00:00.000Z",
        servico: "Marcação mais próxima",
        telefone_digitos: TELEFONE_CALADO,
      },
      {
        cliente_slug: EMPRESA,
        estado: "confirmado",
        inicio: "2026-11-10T09:00:00.000Z",
        servico: "Marcação mais longe",
        telefone_digitos: TELEFONE_ESPERA,
      },
    ],
    lexia_contactos: [
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: EMPRESA,
        criado_em: "2026-10-01T09:00:00.000Z",
        fundido_em: null,
        id: "contacto-calado",
        identificador_conversa: "conversa-calado",
        nome: "Já respondido",
        telefone: TELEFONE_CALADO,
        telefone_digitos: TELEFONE_CALADO,
      },
      {
        atualizado_em: null,
        canal: "whatsapp",
        cliente_slug: EMPRESA,
        criado_em: "2026-10-01T09:00:00.000Z",
        fundido_em: null,
        id: "contacto-espera",
        identificador_conversa: "conversa-espera",
        nome: "À espera de resposta",
        telefone: TELEFONE_ESPERA,
        telefone_digitos: TELEFONE_ESPERA,
      },
    ],
    lexia_conversation_insights: [],
    lexia_mensagens: [
      {
        cliente_slug: EMPRESA,
        criado_em: "2026-10-19T08:00:00.000Z",
        direccao: "enviada",
        identificador_conversa: "conversa-calado",
      },
      {
        cliente_slug: EMPRESA,
        criado_em: "2026-10-19T09:00:00.000Z",
        direccao: "recebida",
        identificador_conversa: "conversa-espera",
      },
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const read = await import("@/lib/pipeline/read");

test("os dois ficam em Agendado, e quem espera resposta vem primeiro", async () => {
  base = new FakeSupabase(estadoInicial());

  const { cartoes } = await read.getPipeline(EMPRESA, AGORA);

  assert.deepEqual(
    cartoes.map((cartao) => cartao.etapa),
    ["agendado", "agendado"],
  );

  // A marcação dele é duas semanas mais tarde do que a do outro: se a ordem
  // fosse só a da marcação mais próxima, ele era o segundo.
  assert.deepEqual(
    cartoes.map((cartao) => cartao.id),
    ["contacto-espera", "contacto-calado"],
  );
  assert.deepEqual(
    cartoes.map((cartao) => cartao.porResponder),
    [true, false],
  );
});

test("sem ninguém à espera, a coluna volta à marcação mais próxima", async () => {
  const estado = estadoInicial();

  // A mesma gente, mas já se respondeu aos dois.
  for (const linha of estado.lexia_mensagens) {
    linha.direccao = "enviada";
  }

  base = new FakeSupabase(estado);

  const { cartoes } = await read.getPipeline(EMPRESA, AGORA);

  assert.deepEqual(
    cartoes.map((cartao) => cartao.id),
    ["contacto-calado", "contacto-espera"],
  );
});

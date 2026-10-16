/**
 * De onde vem o `cliente_slug` quando se pausa o agente.
 *
 * `pauseAgentForConversation` recebe um `requestedSlug` do navegador. Para o
 * admin da Lexia esse slug é legítimo — é o selector de cliente. Para um
 * utilizador de cliente é ruído: tem de ser ignorado e substituído pelo slug do
 * perfil. Se alguma vez deixar de o ser, o Martim passa a poder pausar o agente
 * da Miranda escrevendo outro slug no pedido.
 *
 * É um `if` de três ramos dentro de uma função privada, do tipo que sobrevive
 * a um refactor sem ninguém reparar. Daí os testes.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const A = "empresa_a";
const B = "empresa_b";
const CONVERSA = "whatsapp:351900000001";

type Perfil = {
  cliente_slug: string | null;
  role: string;
  status: string | null;
} | null;

let perfil: Perfil = null;
let utilizador: { id: string } | null = null;
let contactos = new FakeSupabase();

type Chamada = { conversa: string; slug: string; tipo: string };

let chamadas: Chamada[] = [];

mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => ({ profile: perfil, user: utilizador }),
    isClientRole: (role: string) =>
      role === "cliente_admin" || role === "cliente_operador",
  },
});
mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => contactos },
});
mock.module("@/lib/redis/agent-locks", {
  namedExports: {
    clearEternalPause: async (slug: string, conversa: string) => {
      chamadas.push({ conversa, slug, tipo: "clearEternalPause" });

      return { ok: true };
    },
    clearManualPause: async (slug: string, conversa: string) => {
      chamadas.push({ conversa, slug, tipo: "clearManualPause" });

      return { ok: true };
    },
    hasAgentLocksIntegration: (slug: string) => slug === A || slug === B,
    isValidConversationId: (valor: string) =>
      /^(whatsapp|instagram|messenger):[A-Za-z0-9._@+-]{3,64}$/.test(valor),
    setManualPause: async (slug: string, conversa: string) => {
      chamadas.push({ conversa, slug, tipo: "setManualPause" });

      return { ok: true };
    },
  },
});

const accoes = await import("@/app/actions/agent-pause");

function cenario(novoPerfil: Perfil, linhas: Linha[] = []) {
  perfil = novoPerfil;
  utilizador = novoPerfil ? { id: "utilizador-1" } : null;
  chamadas = [];
  contactos = new FakeSupabase({
    lexia_contactos: linhas.length
      ? linhas
      : [
          { cliente_slug: A, id: "c1", identificador_conversa: CONVERSA },
          { cliente_slug: B, id: "c2", identificador_conversa: CONVERSA },
        ],
  });
}

test("cliente_admin não consegue pausar outra empresa passando outro slug", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" });

  const resultado = await accoes.pauseAgentForConversation(B, CONVERSA, "30");

  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, [
    { conversa: CONVERSA, slug: A, tipo: "setManualPause" },
  ]);
});

test("cliente_operador também fica preso ao slug do perfil", async () => {
  cenario({ cliente_slug: A, role: "cliente_operador", status: "ativo" });

  await accoes.pauseAgentForConversation(B, CONVERSA, "30");

  assert.equal(chamadas[0]?.slug, A);
});

test("retomar também ignora o slug pedido por um utilizador de cliente", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" });

  await accoes.resumeAgentForConversation(B, CONVERSA, ["pausa_manual"]);

  assert.deepEqual(chamadas, [
    { conversa: CONVERSA, slug: A, tipo: "clearManualPause" },
  ]);
});

test("o admin da Lexia é o único que pode escolher o cliente", async () => {
  cenario({ cliente_slug: null, role: "lexia_admin", status: "ativo" });

  await accoes.pauseAgentForConversation(B, CONVERSA, "30");

  assert.equal(chamadas[0]?.slug, B);
});

test("perfil inactivo não chega ao Redis", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "inativo" });

  const resultado = await accoes.pauseAgentForConversation(A, CONVERSA, "30");

  assert.equal(resultado.ok, false);
  assert.equal(resultado.error, "Acesso não autorizado.");
  assert.deepEqual(chamadas, []);
});

test("sessão sem perfil não chega ao Redis", async () => {
  cenario(null);

  const resultado = await accoes.pauseAgentForConversation(A, CONVERSA, "30");

  assert.equal(resultado.ok, false);
  assert.deepEqual(chamadas, []);
});

test("conversa que só existe noutra empresa é recusada", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" }, [
    { cliente_slug: B, id: "c2", identificador_conversa: CONVERSA },
  ]);

  const resultado = await accoes.pauseAgentForConversation(A, CONVERSA, "30");

  assert.equal(resultado.ok, false);
  assert.equal(resultado.error, "Conversa não encontrada.");
  assert.deepEqual(chamadas, []);
});

test("conversa de teste não é pausável", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" }, [
    {
      cliente_slug: A,
      id: "c3",
      identificador_conversa: "teste:whatsapp:351900000009",
    },
  ]);

  const resultado = await accoes.pauseAgentForConversation(
    A,
    "teste:whatsapp:351900000009",
    "30",
  );

  assert.equal(resultado.ok, false);
  assert.deepEqual(chamadas, []);
});

test("duração inventada é recusada antes de tocar no Redis", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" });

  const resultado = await accoes.pauseAgentForConversation(
    A,
    CONVERSA,
    "para sempre",
  );

  assert.equal(resultado.ok, false);
  assert.equal(resultado.error, "Duração inválida.");
  assert.deepEqual(chamadas, []);
});

test("retomar a trava de status não é possível pelo painel", async () => {
  cenario({ cliente_slug: A, role: "cliente_admin", status: "ativo" });

  const resultado = await accoes.resumeAgentForConversation(A, CONVERSA, [
    "status",
  ] as never);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.error, "Nada para retomar nesta conversa.");
  assert.deepEqual(chamadas, []);
});

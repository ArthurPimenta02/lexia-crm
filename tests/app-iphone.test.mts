/**
 * App do iPhone: registar o aparelho e guardar preferências.
 *
 * O que um teste tem de guardar aqui:
 * 1. o `user_id` vem SEMPRE da sessão. Um pedido que traga outro `user_id` no
 *    corpo não muda nada — senão qualquer pessoa registava o seu iPhone para
 *    receber os avisos de outra empresa;
 * 2. desligar um aparelho só desliga o da própria pessoa;
 * 3. as preferências por omissão são as mesmas do serviço que envia (tudo
 *    ligado menos "agenda_manual" e "todos_os_clientes");
 * 4. "todos_os_clientes" é só para a Lexia;
 * 5. um aviso nunca abre um endereço fora do painel.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

const TOKEN = "a".repeat(64);
const base = new FakeSupabase({ lexia_app_aparelhos: [], lexia_app_preferencias: [] });

let sessao: unknown = {
  profile: { cliente_slug: "empresa_a", role: "cliente_admin", status: "ativo" },
  user: { id: "dono-a" },
};

mock.module("server-only", { namedExports: {} });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});
mock.module("@/lib/auth/profile", {
  namedExports: { getLoggedInUserProfile: async () => sessao },
});

const aparelho = await import("@/app/api/app/aparelho/route");
const preferencias = await import("@/app/api/app/preferencias/route");
const { destinoDoAviso } = await import("@/app/components/ponte-do-app");

const pedido = (metodo: string, corpo: unknown) =>
  new Request("https://painel.test/api", {
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
    method: metodo,
  });

test("regista o aparelho com o user da sessão, nunca o do pedido", async () => {
  const r = await aparelho.POST(pedido("POST", { token: TOKEN, user_id: "dono-b" }));

  assert.equal(r.status, 200);
  const [linha] = base.linhasDe("lexia_app_aparelhos");
  assert.equal(linha.user_id, "dono-a");
  assert.equal(linha.activo, true);
  assert.equal(linha.ambiente, "producao");
});

test("o mesmo iPhone com outra pessoa passa a ser dela (não duplica)", async () => {
  sessao = {
    profile: { cliente_slug: "empresa_b", role: "cliente_admin", status: "ativo" },
    user: { id: "dono-b" },
  };
  await aparelho.POST(pedido("POST", { token: TOKEN.toUpperCase() }));

  const linhas = base.linhasDe("lexia_app_aparelhos");
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].user_id, "dono-b");
});

test("desligar só mexe no aparelho da própria pessoa", async () => {
  sessao = {
    profile: { cliente_slug: "empresa_a", role: "cliente_admin", status: "ativo" },
    user: { id: "dono-a" },
  };
  await aparelho.DELETE(pedido("DELETE", { token: TOKEN }));
  assert.equal(base.linhasDe("lexia_app_aparelhos")[0].activo, true);

  sessao = {
    profile: { cliente_slug: "empresa_b", role: "cliente_admin", status: "ativo" },
    user: { id: "dono-b" },
  };
  await aparelho.DELETE(pedido("DELETE", { token: TOKEN }));
  assert.equal(base.linhasDe("lexia_app_aparelhos")[0].activo, false);
});

test("sem sessão ativa ou com token estranho, recusa", async () => {
  sessao = { profile: null, user: null };
  assert.equal((await aparelho.POST(pedido("POST", { token: TOKEN }))).status, 401);

  sessao = {
    profile: { cliente_slug: "empresa_a", role: "cliente_admin", status: "inativo" },
    user: { id: "dono-a" },
  };
  assert.equal((await aparelho.POST(pedido("POST", { token: TOKEN }))).status, 401);

  sessao = {
    profile: { cliente_slug: "empresa_a", role: "cliente_admin", status: "ativo" },
    user: { id: "dono-a" },
  };
  assert.equal((await aparelho.POST(pedido("POST", { token: "<script>" }))).status, 400);
});

test("preferências: omissões iguais às do serviço; cada um só grava as suas", async () => {
  const lidas = await (await preferencias.GET()).json();

  assert.deepEqual(lidas.preferencias, {
    a_espera: true,
    agenda_manual: false,
    agendamento_cancelado: true,
    agendamento_novo: true,
    agendamento_remarcado: true,
    todos_os_clientes: false,
  });

  await preferencias.PUT(pedido("PUT", { ligado: false, tipo: "a_espera", user_id: "dono-b" }));
  const gravadas = base.linhasDe("lexia_app_preferencias");
  assert.deepEqual(
    gravadas.map((p) => [p.user_id, p.tipo, p.ligado]),
    [["dono-a", "a_espera", false]],
  );
  assert.equal((await (await preferencias.GET()).json()).preferencias.a_espera, false);
});

test("'todos os clientes' é só para a Lexia; tipos inventados recusam", async () => {
  assert.equal((await preferencias.PUT(pedido("PUT", { ligado: true, tipo: "todos_os_clientes" }))).status, 400);
  assert.equal((await preferencias.PUT(pedido("PUT", { ligado: true, tipo: "qualquer" }))).status, 400);

  sessao = {
    profile: { cliente_slug: null, role: "lexia_admin", status: "ativo" },
    user: { id: "arthur" },
  };
  assert.equal((await preferencias.PUT(pedido("PUT", { ligado: true, tipo: "todos_os_clientes" }))).status, 200);
});

test("um aviso só abre telas do painel, e no app vai para as telas do iPhone", () => {
  assert.equal(destinoDoAviso("/app/agenda"), "/m/agenda");
  assert.equal(destinoDoAviso("/app/conversas?conversa=whatsapp%3A1"), "/m/conversas/whatsapp%3A1");
  assert.equal(destinoDoAviso("/m/conversas/whatsapp%3A1"), "/m/conversas/whatsapp%3A1");
  assert.equal(destinoDoAviso("/app"), "/m");
  assert.equal(destinoDoAviso("https://mal.example/app"), null);
  assert.equal(destinoDoAviso("//mal.example"), null);
  assert.equal(destinoDoAviso("/app//mal.example"), null);
  assert.equal(destinoDoAviso("/apparently"), null);
  assert.equal(destinoDoAviso("/mal"), null);
  assert.equal(destinoDoAviso(42), null);
});

test("gesto de voltar: só da borda, para a direita e com distância", async () => {
  const { decideVoltar } = await import("@/app/components/gesto-voltar");
  assert.equal(decideVoltar(10, 90, 10), true);
  assert.equal(decideVoltar(60, 90, 10), false, "não começou na borda");
  assert.equal(decideVoltar(10, 40, 5), false, "curto demais");
  assert.equal(decideVoltar(10, 90, 80), false, "foi mais para baixo do que para o lado");
  assert.equal(decideVoltar(10, -90, 0), false, "para a esquerda");
});

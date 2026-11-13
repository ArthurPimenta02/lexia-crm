// Ligação do Instagram ao app Meta da Lexia: o `state` assinado (lib/meta/conectar.ts).
import { test, mock } from "node:test";
import assert from "node:assert/strict";

mock.module("server-only", { namedExports: {} });
const { criarEstado, lerEstado, urlDoLogin, contasDoToken } = await import("@/lib/meta/conectar");

test("state: volta igual com a chave certa; falha com outra chave, adulterado ou velho", () => {
  const agora = 1_800_000_000_000;
  const e = criarEstado({ cliente: "claudia_leite_spa", user: "u1", agora }, "segredo");
  assert.deepEqual(lerEstado(e, "segredo", agora + 1000), { cliente: "claudia_leite_spa", user: "u1" });
  assert.equal(lerEstado(e, "outro", agora), null);
  const [d, a] = e.split(".");
  const falso = Buffer.from(JSON.stringify({ c: "miranda", u: "u1", t: agora })).toString("base64url");
  assert.equal(lerEstado(`${falso}.${a}`, "segredo", agora), null);
  assert.equal(lerEstado(`${d}.`, "segredo", agora), null);
  assert.equal(lerEstado(e, "segredo", agora + 31 * 60_000), null);
  assert.equal(lerEstado(null, "segredo", agora), null);
});

test("link do login leva a configuração e o redirecionamento registados", () => {
  const u = new URL(urlDoLogin({ appId: "1", appSecret: "s", configId: "9" }, "st"));
  assert.equal(u.searchParams.get("config_id"), "9");
  assert.equal(u.searchParams.get("redirect_uri"), "https://app.uselexia.app/conectar/meta");
  assert.equal(u.searchParams.get("state"), "st");
});

test("contas do token: só os ids de permissões do Instagram", async () => {
  const buscar = (async (url: string) => {
    if (url.includes("debug_token")) return Response.json({ data: { granular_scopes: [
      { scope: "instagram_basic", target_ids: ["178"] }, { scope: "instagram_manage_messages", target_ids: ["178"] }, { scope: "ads_read", target_ids: ["act_1"] },
    ] } });
    return Response.json({ id: "178", username: "uselexia.ai" });
  }) as typeof fetch;
  assert.deepEqual(await contasDoToken({ appId: "1", appSecret: "s", configId: "9" }, "tok", buscar), [{ id: "178", username: "uselexia.ai" }]);
});

test("contas do token: sem target_ids, lê as contas atribuídas ao usuário do sistema", async () => {
  const buscar = (async (url: string) => {
    if (url.includes("debug_token")) return Response.json({ data: { granular_scopes: [{ scope: "instagram_basic" }] } });
    if (url.includes("/me?")) return Response.json({ id: "SU1" });
    if (url.includes("/SU1/assigned_instagram_accounts")) return Response.json({ data: [{ id: "178" }] });
    return Response.json({ id: "178", username: "uselexia.ai" });
  }) as typeof fetch;
  assert.deepEqual(await contasDoToken({ appId: "1", appSecret: "s", configId: "9" }, "tok", buscar), [{ id: "178", username: "uselexia.ai" }]);
});

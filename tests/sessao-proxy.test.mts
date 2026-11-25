// 25/11 (Arthur): o app deslogava quem saía e voltava. Causa: sem proxy, o token
// renovado num Server Component não era gravado; o refresh token já usado voltava
// no pedido seguinte e o Supabase revogava a sessão. Estes testes simulam o
// Supabase (fetch falso) — nenhuma conta real é usada.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";

import { renovarSessao } from "../lib/supabase/proxy";

const URL_SUPABASE = "https://projetoteste.supabase.co";
const COOKIE = "sb-projetoteste-auth-token";
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_SUPABASE;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";

const b64url = (s: string) => Buffer.from(s).toString("base64url");
function jwt(sub: string, exp: number) {
  return [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub, exp, aud: "authenticated", role: "authenticated", iat: exp - 3600 })), "assinatura"].join(".");
}
const usuario = { id: "u-1", aud: "authenticated", role: "authenticated", email: "teste@exemplo.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function sessao(accessToken: string, refresh: string, expiresAt: number) {
  return { access_token: accessToken, refresh_token: refresh, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user: usuario };
}
const cookieDaSessao = (s: object) => "base64-" + b64url(JSON.stringify(s));

// Supabase falso: cada refresh token só serve UMA vez (como o real, depois do intervalo de reuso).
let usados: Set<string>;
let chamadasRefresh: number;
const agora = () => Math.floor(Date.now() / 1000);
beforeEach(() => {
  usados = new Set();
  chamadasRefresh = 0;
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
      chamadasRefresh++;
      const { refresh_token } = JSON.parse(String(init?.body ?? "{}"));
      if (usados.has(refresh_token)) {
        return new Response(JSON.stringify({ code: "refresh_token_already_used", error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      usados.add(refresh_token);
      return new Response(JSON.stringify(sessao(jwt("u-1", agora() + 3600), "refresh-novo", agora() + 3600)), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify(usuario), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/.well-known/jwks.json")) {
      return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("fetch inesperado: " + url);
  }) as typeof fetch;
});

function pedidoComSessaoVencida() {
  const vencida = sessao(jwt("u-1", agora() - 60), "refresh-velho", agora() - 60);
  return new NextRequest("https://app.uselexia.app/m", { headers: { cookie: `${COOKIE}=${cookieDaSessao(vencida)}` } });
}

test("ANTES (o bug): Server Component renova mas não grava; o pedido seguinte leva o refresh já usado e a sessão morre", async () => {
  const cookiesDoNavegador = new Map([[COOKIE, cookieDaSessao(sessao(jwt("u-1", agora() - 60), "refresh-velho", agora() - 60))]]);
  // Igual a lib/supabase/server.ts: setAll lança dentro de um Server Component e o erro é engolido.
  const clienteDeServerComponent = () => createServerClient(URL_SUPABASE, "anon-de-teste", {
    cookies: {
      getAll: () => [...cookiesDoNavegador].map(([name, value]) => ({ name, value })),
      setAll: () => { try { throw new Error("Cookies can only be modified in a Server Action or Route Handler"); } catch { /* engolido */ } },
    },
  });
  const primeiro = await clienteDeServerComponent().auth.getUser();
  assert.equal(primeiro.data.user?.id, "u-1", "1.º pedido entra (renovou em memória)");
  const segundo = await clienteDeServerComponent().auth.getUser();
  assert.equal(segundo.data.user, null, "2.º pedido: refresh já usado → sem sessão (deslogado)");
});

test("DEPOIS: o proxy renova e devolve Set-Cookie com o token novo, com vida longa", async () => {
  const resposta = await renovarSessao(pedidoComSessaoVencida());
  assert.equal(chamadasRefresh, 1);
  const gravado = resposta.cookies.get(COOKIE);
  assert.ok(gravado, "o cookie de sessão foi regravado");
  const conteudo = JSON.parse(Buffer.from(gravado!.value.replace(/^base64-/, ""), "base64url").toString());
  assert.equal(conteudo.refresh_token, "refresh-novo");
  assert.ok((gravado!.maxAge ?? 0) >= 30 * 24 * 3600, `maxAge longo (veio ${gravado!.maxAge})`);
  assert.match(resposta.headers.get("cache-control") ?? "", /no-store|private/);
});

test("DEPOIS: com o proxy, abrir o app duas vezes seguidas não desloga", async () => {
  const r1 = await renovarSessao(pedidoComSessaoVencida());
  const novo = r1.cookies.get(COOKIE)!.value;
  const pedido2 = new NextRequest("https://app.uselexia.app/m", { headers: { cookie: `${COOKIE}=${novo}` } });
  const r2 = await renovarSessao(pedido2);
  assert.equal(chamadasRefresh, 1, "o token novo ainda vale: não houve 2.º refresh nem reuso");
  assert.equal(r2.cookies.get(COOKIE), undefined, "nada a regravar");
});

test("sem cookie de sessão o proxy não chama o Supabase", async () => {
  await renovarSessao(new NextRequest("https://app.uselexia.app/login"));
  assert.equal(chamadasRefresh, 0);
});

test("proxy.ts existe na raiz, exporta proxy e não passa pelas rotas de webhook/cron", () => {
  const s = readFileSync("proxy.ts", "utf8");
  assert.match(s, /export async function proxy/);
  for (const rota of ["api/webhooks", "api/campanhas/cron", "api/analista/cron", "api/analises/rotina", "api/analista/n8n", "_next/static"]) {
    assert.ok(s.includes(rota), `matcher exclui ${rota}`);
  }
});

test("perfil com erro na base não lança (vai ao login, não à tela de erro)", () => {
  const s = readFileSync("lib/auth/profile.ts", "utf8");
  assert.doesNotMatch(s, /throw new Error\("Não foi possível buscar o perfil/);
  assert.ok(readFileSync("app/m/error.tsx", "utf8").includes("window.location.reload"));
});

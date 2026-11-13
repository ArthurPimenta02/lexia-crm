import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ligar o Instagram de um cliente ao app Meta da Lexia (13/11).
 *
 * Um app só (Lexia, BM verificada, Provedor de Tecnologia) para todos os
 * clientes. O cliente entra em /conectar, carrega em "Ligar Instagram", faz o
 * login da Meta (configuração de login unificado → token de usuário do
 * sistema, que não expira) e volta a /conectar/meta com um `code`. Aqui:
 * troca-se o code pelo token, descobre-se que conta do Instagram ele autorizou,
 * assina-se o webhook dessa conta e grava-se tudo em lexia_conexoes
 * (tipo meta_lexia, token cifrado).
 *
 * O `state` vai assinado (HMAC com a chave secreta do app) e leva o cliente e o
 * utilizador: quem volta com um code não consegue gravar a conta noutro
 * cliente nem reaproveitar um link velho (expira em 30 min).
 */

export const GRAPH = "https://graph.facebook.com/v25.0";
export const REDIRECIONAMENTO = "https://app.uselexia.app/conectar/meta";
const VALIDADE_MS = 30 * 60_000;

export type ConfigMeta = { appId: string; appSecret: string; configId: string };

export function configMeta(): ConfigMeta | null {
  const appId = process.env.META_LEXIA_APP_ID?.trim();
  const appSecret = process.env.META_LEXIA_APP_SECRET?.trim();
  const configId = process.env.META_LEXIA_CONFIG_ID?.trim();
  return appId && appSecret && configId ? { appId, appSecret, configId } : null;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const assinar = (dados: string, segredo: string) => createHmac("sha256", segredo).update(dados).digest("base64url");

export function criarEstado(o: { cliente: string; user: string; agora?: number }, segredo: string) {
  const dados = b64(JSON.stringify({ c: o.cliente, u: o.user, t: o.agora ?? Date.now() }));
  return `${dados}.${assinar(dados, segredo)}`;
}

export function lerEstado(estado: string | null | undefined, segredo: string, agora = Date.now()): { cliente: string; user: string } | null {
  if (!estado) return null;
  const [dados, assinatura] = estado.split(".");
  if (!dados || !assinatura) return null;
  const esperado = Buffer.from(assinar(dados, segredo));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const o = JSON.parse(Buffer.from(dados, "base64url").toString("utf8"));
    if (typeof o.c !== "string" || typeof o.u !== "string" || typeof o.t !== "number") return null;
    if (agora - o.t > VALIDADE_MS || o.t - agora > 60_000) return null;
    return { cliente: o.c, user: o.u };
  } catch {
    return null;
  }
}

export function urlDoLogin(cfg: ConfigMeta, estado: string) {
  const p = new URLSearchParams({
    client_id: cfg.appId,
    config_id: cfg.configId,
    redirect_uri: REDIRECIONAMENTO,
    response_type: "code",
    override_default_response_type: "true",
    state: estado,
  });
  return `https://www.facebook.com/v25.0/dialog/oauth?${p}`;
}

type Buscar = typeof fetch;

async function json(r: Response) {
  const o = await r.json().catch(() => ({}));
  if (!r.ok || o?.error) throw new Error(o?.error?.message ?? `HTTP ${r.status}`);
  return o;
}

export async function trocarCodigo(cfg: ConfigMeta, code: string, buscar: Buscar = fetch): Promise<string> {
  const p = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: REDIRECIONAMENTO, code });
  const o = await json(await buscar(`${GRAPH}/oauth/access_token?${p}`, { cache: "no-store" }));
  if (!o.access_token) throw new Error("a Meta não devolveu token");
  return String(o.access_token);
}

// As contas do Instagram que o token autorizou (granular_scopes.target_ids do debug_token).
export async function contasDoToken(cfg: ConfigMeta, token: string, buscar: Buscar = fetch) {
  const p = new URLSearchParams({ input_token: token, access_token: `${cfg.appId}|${cfg.appSecret}` });
  const o = await json(await buscar(`${GRAPH}/debug_token?${p}`, { cache: "no-store" }));
  const ids = new Set<string>();
  for (const g of o?.data?.granular_scopes ?? []) {
    if (String(g?.scope ?? "").startsWith("instagram_")) for (const id of g?.target_ids ?? []) ids.add(String(id));
  }
  const contas: { id: string; username: string }[] = [];
  for (const id of ids) {
    const r = await buscar(`${GRAPH}/${id}?fields=id,username&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const c = await r.json().catch(() => ({}));
    if (c?.id && c?.username) contas.push({ id: String(c.id), username: String(c.username) });
  }
  return contas;
}

// Liga a conta ao webhook do app (sem isto a Meta não manda as mensagens dela).
export async function assinarWebhook(id: string, token: string, buscar: Buscar = fetch) {
  const p = new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks,message_reactions", access_token: token });
  await json(await buscar(`${GRAPH}/${id}/subscribed_apps?${p}`, { method: "POST", cache: "no-store" }));
}

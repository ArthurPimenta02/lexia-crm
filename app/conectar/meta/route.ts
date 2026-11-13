import { NextResponse, type NextRequest } from "next/server";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { cifrar, finalDe } from "@/lib/conexoes/cifra";
import { assinarWebhook, configMeta, contasDoToken, lerEstado, trocarCodigo } from "@/lib/meta/conectar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Volta do login da Meta (URL de redirecionamento registada no app da Lexia).
 * Sempre termina em /conectar com o resultado em `?ok=` ou `?erro=`.
 */
export const dynamic = "force-dynamic";

function voltar(req: NextRequest, q: Record<string, string>) {
  const url = new URL("/conectar", req.nextUrl.origin);
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const cfg = configMeta();
  if (!cfg) return voltar(req, { erro: "config" });

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return voltar(req, { erro: "cancelado" });
  const code = q.get("code");
  if (!code) return voltar(req, {});

  const { user, profile } = await getLoggedInUserProfile();
  if (!user || !profile) return voltar(req, { erro: "sessao" });

  const estado = lerEstado(q.get("state"), cfg.appSecret);
  if (!estado || estado.user !== user.id) return voltar(req, { erro: "estado" });
  const podeNesteCliente =
    profile.role === "lexia_admin" || (profile.role === "cliente_admin" && profile.cliente_slug === estado.cliente);
  if (!podeNesteCliente) return voltar(req, { erro: "permissao" });

  try {
    const token = await trocarCodigo(cfg, code);
    const contas = await contasDoToken(cfg, token);
    if (!contas.length) return voltar(req, { erro: "sem_conta", cliente: estado.cliente });
    const conta = contas[0];
    await assinarWebhook(conta.id, token);

    const admin = createAdminClient();
    const linha = {
      cliente_slug: estado.cliente,
      tipo: "meta_lexia",
      campos: { instagram_id: conta.id, username: conta.username },
      segredos: cifrar({ access_token: token }),
      finais: { access_token: finalDe(token) },
      atualizado_em: new Date().toISOString(),
      atualizado_por: user.id,
    };
    const { data: atual } = await admin
      .from("lexia_conexoes")
      .select("id")
      .eq("tipo", "meta_lexia")
      .eq("cliente_slug", estado.cliente)
      .maybeSingle();
    const { error } = atual
      ? await admin.from("lexia_conexoes").update(linha).eq("id", atual.id)
      : await admin.from("lexia_conexoes").insert(linha);
    if (error) throw new Error(error.message);

    return voltar(req, { ok: conta.username, cliente: estado.cliente });
  } catch (e) {
    console.error("conectar/meta:", e instanceof Error ? e.message : e);
    return voltar(req, { erro: "meta", cliente: estado.cliente });
  }
}

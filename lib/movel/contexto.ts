import "server-only";

import { unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { dicionarioDe } from "@/lib/i18n/dicionarios";
import { idiomaDoAparelho, LOCALE_DO_IDIOMA, type Idioma } from "@/lib/i18n/idiomas";
import { criarT, type FuncaoT } from "@/lib/i18n/traduzir";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Quem está a usar o app do iPhone e de que empresa são os dados.
 *
 * - O dono (cliente_admin / cliente_operador) vê SEMPRE a própria empresa: o
 *   `clienteSlug` vem do perfil, nunca de um parâmetro ou cookie.
 * - A Lexia (lexia_admin) escolhe a empresa nos Ajustes; a escolha fica num
 *   cookie e é conferida contra `lexia_clientes` a cada pedido.
 *
 * Todas as leituras do app correm com a service_role e levam
 * `.eq("cliente_slug", contexto.clienteSlug)`: é isso que separa as empresas.
 */

export const COOKIE_CLIENTE_MOVEL = "lexia_m_cliente";

export type ContextoMovel = {
  admin: boolean;
  clienteNome: string;
  clienteSlug: string;
  fuso: string;
  idioma: Idioma;
  locale: string;
  /** Meta do mês (agendamentos), escolhida nos Ajustes; 0 = sem meta. */
  meta: { conta: "todos" | "agente"; mes: number };
  nomeUsuario: string;
  t: FuncaoT;
  userId: string;
};

export type ClienteDisponivel = { nome: string; slug: string };

// A lista das empresas ativas muda raramente: guarda-se 5 minutos, para cada
// toque no app não ter de a pedir à base.
const lerClientesAtivos = unstable_cache(
  async (): Promise<ClienteDisponivel[]> => {
    const { data, error } = await createAdminClient()
      .from("lexia_clientes")
      .select("slug, nome, status")
      .eq("status", "ativo")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({ nome: c.nome || c.slug, slug: c.slug }));
  },
  ["m-clientes-ativos-v1"],
  { revalidate: 300 },
);

export const clientesAtivos = cache(lerClientesAtivos);

function nomeDoEmail(email: string | undefined | null) {
  const antes = String(email ?? "").split("@")[0] ?? "";
  const palavra = antes.split(/[._-]/)[0] ?? "";
  return palavra ? palavra.charAt(0).toUpperCase() + palavra.slice(1) : "";
}

export const contextoMovel = cache(async (): Promise<ContextoMovel | null> => {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.status !== "ativo") {
    return null;
  }

  const idioma = idiomaDoAparelho((await headers()).get("accept-language"));
  const t = criarT(dicionarioDe(idioma));
  const admin = profile.role === "lexia_admin";
  let clienteSlug = "";

  if (isClientRole(profile.role) && profile.cliente_slug) {
    clienteSlug = profile.cliente_slug;
  } else if (admin) {
    const escolhido = (await cookies()).get(COOKIE_CLIENTE_MOVEL)?.value ?? "";
    const ativos = await clientesAtivos();
    clienteSlug =
      ativos.find((c) => c.slug === escolhido)?.slug ??
      ativos.find((c) => c.slug === "detail_by_cordeiro")?.slug ??
      ativos[0]?.slug ??
      "";
  }

  if (!clienteSlug) {
    return null;
  }

  const cliente = (await clientesAtivos()).find((x) => x.slug === clienteSlug);

  if (!cliente) {
    return null;
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nomeUsuario =
    (typeof meta.nome === "string" && meta.nome.split(" ")[0]) ||
    (typeof meta.name === "string" && meta.name.split(" ")[0]) ||
    nomeDoEmail(user.email);

  return {
    admin,
    clienteNome: cliente.nome || clienteSlug,
    clienteSlug,
    fuso: getClientTimezone(clienteSlug),
    idioma,
    locale: LOCALE_DO_IDIOMA[idioma],
    meta: {
      conta: meta.meta_conta === "agente" ? "agente" : "todos",
      mes: Number.isInteger(meta.meta_mes) && (meta.meta_mes as number) > 0 ? (meta.meta_mes as number) : 0,
    },
    nomeUsuario,
    t,
    userId: user.id,
  };
});

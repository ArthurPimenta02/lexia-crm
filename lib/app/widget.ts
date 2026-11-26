import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getClientTimezone, instanteNoFuso } from "@/lib/clientes/timezone";
import { chaveDoDia } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O widget do iPhone (25/11/2026). Corre fora do app, sem o cookie da sessão,
 * por isso tem uma chave própria por aparelho: `<user_id>.<segredo>`. Só o
 * hash fica guardado, no `app_metadata` da pessoa (que ela não consegue
 * editar), com a empresa que o widget mostra. No máximo 5 chaves por pessoa.
 * A chave só lê os atendimentos de hoje e os próximos — nada mais.
 */

type ChaveGuardada = { em: string; h: string; slug: string };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function criarChaveWidget(userId: string, clienteSlug: string): Promise<string> {
  const segredo = randomBytes(24).toString("base64url");
  const base = createAdminClient();
  const { data } = await base.auth.admin.getUserById(userId);
  const meta = (data.user?.app_metadata ?? {}) as Record<string, unknown>;
  const antes = Array.isArray(meta.widget) ? (meta.widget as ChaveGuardada[]) : [];
  const novas = [...antes, { em: new Date().toISOString(), h: hash(segredo), slug: clienteSlug }].slice(-5);
  const { error } = await base.auth.admin.updateUserById(userId, { app_metadata: { ...meta, widget: novas } });
  if (error) throw error;
  return `${userId}.${segredo}`;
}

export async function lerChaveWidget(chave: string): Promise<{ clienteSlug: string; userId: string } | null> {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,64})$/.exec(chave.trim());
  if (!m) return null;
  const { data } = await createAdminClient().auth.admin.getUserById(m[1]);
  const lista = (data.user?.app_metadata as Record<string, unknown> | undefined)?.widget;
  if (!Array.isArray(lista)) return null;
  const h = Buffer.from(hash(m[2]));
  const certa = (lista as ChaveGuardada[]).find((x) => x.h.length === h.length && timingSafeEqual(Buffer.from(x.h), h));
  return certa ? { clienteSlug: certa.slug, userId: m[1] } : null;
}

/** ISO sem milissegundos (o leitor de datas do iPhone não os aceita). */
const iso = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, "Z");

export async function dadosDoWidget(clienteSlug: string, agora = new Date()) {
  const fuso = getClientTimezone(clienteSlug);
  const hoje = chaveDoDia(agora, fuso);
  const inicioHoje = instanteNoFuso(hoje, "00:00", fuso)!;
  const base = createAdminClient();
  const [{ data: linhas }, { data: empresa }] = await Promise.all([
    base
      .from("lexia_agendamentos")
      .select("inicio, fim, nome_cliente, titulo, servico, executor, dados, dia_inteiro")
      .eq("cliente_slug", clienteSlug)
      .neq("estado", "cancelado")
      .eq("dia_inteiro", false)
      .gte("inicio", inicioHoje)
      .order("inicio", { ascending: true })
      .limit(60),
    base.from("lexia_clientes").select("nome").eq("slug", clienteSlug).maybeSingle(),
  ]);
  const atend = (linhas ?? [])
    .filter((l) => !(l.dados as { bloqueio?: boolean } | null)?.bloqueio)
    .map((l) => ({
      dia: chaveDoDia(String(l.inicio), fuso),
      fim: iso(String(l.fim)),
      inicio: iso(String(l.inicio)),
      nome: String(l.nome_cliente || l.titulo || "").trim() || "Agendamento",
      profissional: l.executor ? String(l.executor).charAt(0).toUpperCase() + String(l.executor).slice(1) : null,
      servico: (l.servico as string | null) ?? null,
    }));
  const tirarDia = (a: (typeof atend)[number]) => ({ fim: a.fim, inicio: a.inicio, nome: a.nome, profissional: a.profissional, servico: a.servico });
  return {
    empresa: String(empresa?.nome ?? ""),
    fuso,
    hoje: atend.filter((a) => a.dia === hoje).map(tirarDia),
    proximos: atend.filter((a) => a.dia > hoje).slice(0, 3).map(tirarDia),
  };
}

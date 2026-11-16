import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { gerarRascunho } from "@/lib/onboarding/etapa1";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// Ler o site, os arquivos e montar o rascunho leva de 1 a 2 minutos.
export const maxDuration = 300;

/** Gera o rascunho da Etapa 1. Só a equipe da Lexia (lexia_admin). */
export async function POST(request: Request) {
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || profile?.role !== "lexia_admin") return Response.json({ erro: "Acesso não autorizado." }, { status: 403 });
  const corpo = (await request.json().catch(() => ({}))) as { cliente?: unknown };
  const slug = String(corpo.cliente ?? "").trim();
  const admin = createAdminClient();
  const { data: cliente } = await admin.from("lexia_clientes").select("slug").eq("slug", slug).maybeSingle();
  if (!cliente) return Response.json({ erro: "Cliente não encontrado." }, { status: 404 });
  const r = await gerarRascunho(admin, slug, user.id);
  return Response.json(r, { status: r.ok ? 200 : 422 });
}

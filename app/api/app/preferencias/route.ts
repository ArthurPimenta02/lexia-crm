import {
  gravarPreferencia,
  lerPreferencias,
  TIPOS_DE_AVISO,
  type TipoDeAviso,
} from "@/lib/app/aparelhos";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Que avisos esta pessoa quer no iPhone. Sempre as da própria sessão. */
async function quem() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.status !== "ativo") {
    return null;
  }

  return { admin: profile.role === "lexia_admin", userId: user.id };
}

export async function GET() {
  const sessao = await quem();

  if (!sessao) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }

  try {
    return Response.json({
      admin: sessao.admin,
      preferencias: await lerPreferencias(sessao.userId),
    });
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const sessao = await quem();

  if (!sessao) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }

  let corpo: Record<string, unknown> = {};

  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    // corpo vazio cai na validação abaixo
  }

  const tipo = corpo.tipo as TipoDeAviso;

  if (!TIPOS_DE_AVISO.includes(tipo) || typeof corpo.ligado !== "boolean") {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  // "Todos os clientes" só faz sentido para a Lexia.
  if (tipo === "todos_os_clientes" && !sessao.admin) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  try {
    await gravarPreferencia(sessao.userId, tipo, corpo.ligado);
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

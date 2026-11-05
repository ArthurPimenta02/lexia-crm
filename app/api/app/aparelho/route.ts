import {
  esquecerAparelho,
  registarAparelho,
  tokenValido,
} from "@/lib/app/aparelhos";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O app do iPhone regista-se aqui depois de a pessoa aceitar os avisos.
 * O `user_id` vem da sessão (o app é o próprio painel, com o mesmo cookie).
 */
async function quem() {
  const { profile, user } = await getLoggedInUserProfile();

  if (!user || !profile || profile.status !== "ativo") {
    return null;
  }

  return user.id;
}

async function lerCorpo(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const userId = await quem();

  if (!userId) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }

  const corpo = await lerCorpo(request);

  if (!tokenValido(corpo.token)) {
    return Response.json({ erro: "Token inválido." }, { status: 400 });
  }

  const ambiente = corpo.ambiente === "sandbox" ? "sandbox" : "producao";

  try {
    await registarAparelho(userId, corpo.token, ambiente);
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await quem();

  if (!userId) {
    return Response.json({ erro: "Sessão inválida." }, { status: 401 });
  }

  const corpo = await lerCorpo(request);

  if (!tokenValido(corpo.token)) {
    return Response.json({ erro: "Token inválido." }, { status: 400 });
  }

  try {
    await esquecerAparelho(userId, corpo.token);
  } catch (erro) {
    return Response.json({ erro: (erro as Error).message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

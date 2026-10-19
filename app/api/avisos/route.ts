import { getAvisos } from "@/lib/avisos/read";
import {
  desmarcarAviso,
  limparAvisos,
  marcarAvisosLidos,
} from "@/lib/avisos/write";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

/**
 * O que alimenta o sino.
 *
 * Porque é que isto é uma rota e não dados do layout
 * -------------------------------------------------
 * O sino está em todas as páginas do produto. Se os avisos fossem lidos no
 * `app/app/layout.tsx`, os ~600 ms da leitura entravam no caminho de render
 * de CADA página — o dono esperava meio segundo a mais para ver a agenda por
 * causa de um número ao lado de um sino. Numa rota, a página aparece primeiro
 * e o número chega depois.
 *
 * Autorização
 * -----------
 * O `cliente_slug` e o `user_id` saem SEMPRE da sessão, nunca do pedido. O
 * `getAvisos` e o `marcarAvisosLidos` correm com a `service_role`, que ignora
 * o RLS: é este par de linhas que separa uma empresa da outra.
 */

/** Uma lista de chaves vinda de fora não é uma lista de textos até se provar. */
function apenasTextos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter(
        (candidata): candidata is string => typeof candidata === "string",
      )
    : [];
}

async function sessao() {
  const { profile, user } = await getLoggedInUserProfile();

  if (
    !user ||
    !profile ||
    !isClientRole(profile.role) ||
    profile.status !== "ativo" ||
    !profile.cliente_slug
  ) {
    return null;
  }

  return { clienteSlug: profile.cliente_slug, userId: user.id };
}

export async function GET() {
  const quem = await sessao();

  if (!quem) {
    return Response.json(
      { avisos: [], erro: "Sem sessão.", naoLidos: 0 },
      { status: 401 },
    );
  }

  const resultado = await getAvisos(quem.clienteSlug, quem.userId);

  return Response.json(resultado);
}

export async function POST(request: Request) {
  const quem = await sessao();

  if (!quem) {
    return Response.json({ ok: false, mensagem: "Sem sessão." }, { status: 401 });
  }

  let corpo: Record<string, unknown> = {};

  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    // Corpo inválido cai no "não há avisos para marcar", que é mais claro
    // do que um 400 sobre JSON.
  }

  // `desmarcar` é a chave única de um aviso; `limpar` tira avisos da lista;
  // `chaves` é o "marcar todos como lidos".
  if (typeof corpo.desmarcar === "string") {
    const resultado = await desmarcarAviso(
      quem.clienteSlug,
      quem.userId,
      corpo.desmarcar,
    );

    return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
  }

  if (Array.isArray(corpo.limpar)) {
    const resultado = await limparAvisos(
      quem.clienteSlug,
      quem.userId,
      apenasTextos(corpo.limpar),
    );

    return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
  }

  const resultado = await marcarAvisosLidos(
    quem.clienteSlug,
    quem.userId,
    apenasTextos(corpo.chaves),
  );

  return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
}

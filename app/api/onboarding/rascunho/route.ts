import { acessoAoOnboarding } from "@/lib/onboarding/acesso";
import { gerarRascunho } from "@/lib/onboarding/etapa1";

export const dynamic = "force-dynamic";
// Ler o site, os arquivos e montar o rascunho leva de 1 a 2 minutos.
export const maxDuration = 300;

/** Gera o rascunho da Etapa 1, para a empresa da sessão (ou a escolhida, se for a equipe da Lexia). */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as { cliente?: unknown };
  // Conta de cliente: a empresa da sessão. Equipe da Lexia: a empresa pedida, confirmada.
  const acesso = await acessoAoOnboarding(corpo.cliente);
  if (!acesso) return Response.json({ erro: "Acesso não autorizado." }, { status: 403 });
  const r = await gerarRascunho(acesso.admin, acesso.clienteSlug, acesso.userId);
  return Response.json(r, { status: r.ok ? 200 : 422 });
}

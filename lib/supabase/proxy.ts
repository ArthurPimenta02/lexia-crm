import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada pedido e GRAVA os cookies novos.
 *
 * Porque é que isto existe (25/11/2026)
 * -------------------------------------
 * O app do iPhone deslogava quem saía e voltava passado um tempo. Causa: o
 * painel não tinha este passo. O token de acesso vence de hora a hora; quando
 * vencia, o `getUser()` de um Server Component renovava-o em memória, mas um
 * Server Component não pode escrever cookies (o `setAll` de
 * `lib/supabase/server.ts` engole o erro). O navegador ficava com o refresh
 * token JÁ USADO e, no pedido seguinte, o Supabase via a reutilização e
 * revogava a sessão inteira → login de novo.
 *
 * Aqui, no proxy, a resposta ainda está aberta: o token renovado vai no
 * Set-Cookie e o pedido que segue para a página já leva o token novo.
 *
 * Não redireciona ninguém: quem decide se há sessão são as páginas, como antes.
 */
export async function renovarSessao(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let resposta = NextResponse.next({ request });

  // Sem cookie de sessão não há nada a renovar: não gastar uma ida ao Supabase.
  const temSessao = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!url || !chave || !temSessao) return resposta;

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaGravar, cabecalhos) {
        // 1) o pedido que segue para a página já vê o token novo;
        cookiesParaGravar.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        // 2) o navegador/iPhone guarda o token novo (400 dias, o padrão do @supabase/ssr).
        cookiesParaGravar.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        // 3) respostas com sessão nova não podem ficar em cache partilhada.
        Object.entries(cabecalhos ?? {}).forEach(([k, v]) => resposta.headers.set(k, v));
      },
    },
  });

  try {
    // getClaims renova a sessão se o token venceu (e confere a assinatura).
    await supabase.auth.getClaims();
  } catch {
    // Falha de rede com o Supabase: seguir sem renovar; a página trata a sessão.
  }

  return resposta;
}

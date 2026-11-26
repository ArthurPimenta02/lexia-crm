import type { NextRequest } from "next/server";

import { renovarSessao } from "@/lib/supabase/proxy";

/** Next 16: o antigo middleware chama-se proxy. Só renova a sessão; não redireciona. */
export async function proxy(request: NextRequest) {
  return renovarSessao(request);
}

export const config = {
  matcher: [
    /*
     * Tudo menos: ficheiros do Next, imagens e ícones, e as rotas de API que
     * entram com chave própria (webhook da Meta, crons, rotina na nuvem, n8n),
     * que não usam a sessão de ninguém.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks|api/campanhas/cron|api/campanhas/sincronizar|api/analista/cron|api/analista/n8n|api/analises/rotina|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|mp4|webm|woff2?)$).*)",
  ],
};

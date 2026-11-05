import { redirect } from "next/navigation";

import { PainelAjudante } from "@/app/components/ajudante/painel-ajudante";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

/**
 * Analista Lexia em tela inteira (o mesmo do botão do canto). O Analista
 * antigo (n8n, app/components/analyst-workspace.tsx) continua no código, mas
 * já não é aberto daqui.
 */
export default async function ClientAnalystPage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) redirect("/login");
  if (!isClientRole(profile.role)) redirect("/admin/analista");
  exigirEcra(profile.cliente_slug, "/app/analista");
  if (!profile.cliente_slug) redirect("/login");

  return (
    <div className="h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-4rem)]">
      <PainelAjudante modo="tela" tela="/app/analista" />
    </div>
  );
}

import { redirect } from "next/navigation";

import { FunilVista } from "@/app/admin/funil/vista";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

/**
 * O funil dos agentes (18/11/2026): as mesmas seis etapas para todos os
 * clientes, por semana da 1.ª mensagem. O desenho e a leitura estão em
 * `vista.tsx`; as regras em `lib/funil/etapas.ts`.
 */

type FunilPageProps = { searchParams: Promise<{ cliente?: string | string[] }> };

export default async function FunilPage({ searchParams }: FunilPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const pedido = Array.isArray(params.cliente) ? (params.cliente[0] ?? "") : (params.cliente ?? "");
  return <FunilVista pedido={pedido} />;
}

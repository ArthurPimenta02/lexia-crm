import { redirect } from "next/navigation";

import { AnalisesVista } from "@/app/admin/analises/vista";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

/**
 * Análises das conversas (19/11/2026): os relatórios da rotina diária das 2h
 * (e os pedidos do admin), com o estado de cada achado. Só `lexia_admin`.
 * O desenho e a leitura estão em `vista.tsx`; as regras em
 * `lib/analises/regras.ts`.
 */

type Params = Record<string, string | string[] | undefined>;
type AnalisesPageProps = { searchParams: Promise<Params> };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function AnalisesPage({ searchParams }: AnalisesPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const p = await searchParams;
  return (
    <AnalisesVista
      filtros={{ analise: um(p.analise), cliente: um(p.cliente), estado: um(p.estado), gravidade: um(p.gravidade) }}
    />
  );
}

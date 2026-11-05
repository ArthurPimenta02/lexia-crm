"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { clientesAtivos, contextoMovel, COOKIE_CLIENTE_MOVEL } from "@/lib/movel/contexto";
import { createClient } from "@/lib/supabase/server";

/** Só para a Lexia: escolher de que empresa o app mostra os dados. */
export async function escolherEmpresa(formData: FormData) {
  const c = await contextoMovel();
  if (!c?.admin) return;
  const slug = String(formData.get("slug") ?? "");
  if (!(await clientesAtivos()).some((x) => x.slug === slug)) return;
  (await cookies()).set(COOKIE_CLIENTE_MOVEL, slug, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax", secure: true });
  redirect("/m");
}

export async function sairDoApp() {
  await (await createClient()).auth.signOut();
  redirect("/login?destino=/m");
}

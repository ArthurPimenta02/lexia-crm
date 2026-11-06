"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { clientesAtivos, contextoMovel, COOKIE_CLIENTE_MOVEL } from "@/lib/movel/contexto";
import { ehContaDemo } from "@/lib/movel/demo";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Excluir a própria conta (exigência da Apple para o app). Apaga o login da
 * pessoa e o que é só dela (aparelhos, preferências, acesso à empresa). Os
 * dados do negócio (conversas, agenda) são da empresa e ficam.
 * A conta demo do revisor e as contas da equipe Lexia não se excluem por aqui.
 */
export async function excluirMinhaConta(formData: FormData) {
  const c = await contextoMovel();
  if (!c) redirect("/login?destino=/m");
  if (formData.get("confirmo") !== "sim") redirect("/m/ajustes/excluir?aviso=confirmar");
  if (ehContaDemo(c.clienteSlug)) redirect("/m/ajustes/excluir?aviso=demo");
  if (c.admin) redirect("/m/ajustes/excluir?aviso=equipe");

  const base = createAdminClient();
  for (const tabela of ["lexia_app_aparelhos", "lexia_app_preferencias", "lexia_usuarios_clientes"]) {
    const { error } = await base.from(tabela).delete().eq("user_id", c.userId);
    if (error) redirect("/m/ajustes/excluir?aviso=erro");
  }
  const { error } = await base.auth.admin.deleteUser(c.userId);
  if (error) redirect("/m/ajustes/excluir?aviso=erro");
  console.warn(`[app] conta excluída pela própria pessoa: ${c.userId} (${c.clienteSlug})`);
  await (await createClient()).auth.signOut().catch(() => undefined);
  redirect("/login?conta=excluida");
}

/** Grava a meta do mês na conta da pessoa (vale no iPhone e em qualquer aparelho). */
export async function guardarMeta(_antes: null | "ok" | "erro", formData: FormData): Promise<"ok" | "erro"> {
  const c = await contextoMovel();
  if (!c) return "erro";
  const n = Math.round(Number(formData.get("mes") ?? 0));
  const mes = Number.isFinite(n) && n > 0 && n <= 9999 ? n : 0;
  const conta = formData.get("conta") === "agente" ? "agente" : "todos";
  const { error } = await (await createClient()).auth.updateUser({ data: { meta_conta: conta, meta_mes: mes } });
  if (error) return "erro";
  revalidatePath("/m", "layout");
  return "ok";
}

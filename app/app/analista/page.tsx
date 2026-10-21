import { redirect } from "next/navigation";

import { AnalystWorkspace } from "@/app/components/analyst-workspace";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export default async function ClientAnalystPage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) redirect("/login");
  if (!isClientRole(profile.role)) redirect("/admin/analista");
  exigirEcra(profile.cliente_slug, "/app/analista");
  if (!profile.cliente_slug) redirect("/login");

  const supabase = await createClient();
  const { data: client, error } = await supabase
    .from("lexia_clientes")
    .select("nome, slug")
    .eq("slug", profile.cliente_slug)
    .maybeSingle();

  if (error || !client) {
    throw new Error("Não foi possível carregar o cliente do Analista Lexia.");
  }

  return (
    <AnalystWorkspace
      client={{ name: client.nome || client.slug, slug: client.slug }}
      mode="client"
    />
  );
}

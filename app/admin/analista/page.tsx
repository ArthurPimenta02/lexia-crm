import { redirect } from "next/navigation";

import { AnalystWorkspace } from "@/app/components/analyst-workspace";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type AdminAnalystPageProps = {
  searchParams: Promise<{ cliente?: string | string[] }>;
};

export default async function AdminAnalystPage({
  searchParams,
}: AdminAnalystPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app/analista");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_clientes")
    .select("nome, slug")
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os clientes.");
  }

  const clients = (data ?? []).map((client) => ({
    name: client.nome || client.slug,
    slug: client.slug,
  }));

  if (clients.length === 0) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-zinc-950">Analista Lexia</h1>
        <p className="mt-3 text-zinc-600">Nenhum cliente ativo encontrado.</p>
      </section>
    );
  }

  const params = await searchParams;
  const requestedSlug = Array.isArray(params.cliente)
    ? params.cliente[0]
    : params.cliente;
  const selectedClient =
    clients.find((client) => client.slug === requestedSlug) ?? clients[0];

  return (
    <AnalystWorkspace
      client={selectedClient}
      clientOptions={clients}
      key={selectedClient.slug}
      mode="admin"
    />
  );
}

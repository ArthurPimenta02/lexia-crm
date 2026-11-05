import { redirect } from "next/navigation";

import { PainelAjudante } from "@/app/components/ajudante/painel-ajudante";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
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

  const t = await getT();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_clientes")
    .select("nome, slug")
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(t("Não foi possível carregar os clientes."));
  }

  const clients = (data ?? []).map((client) => ({
    name: client.nome || client.slug,
    slug: client.slug,
  }));

  if (clients.length === 0) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-foreground">{t("Analista Lexia")}</h1>
        <p className="mt-3 text-muted-foreground">{t("Nenhum cliente ativo encontrado.")}</p>
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
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-3 lg:h-[calc(100dvh-4rem)]">
      <form action="/admin/analista" className="flex shrink-0 items-center gap-2">
        <select className="h-10 rounded-xl border border-border bg-surface px-3 text-sm" defaultValue={selectedClient.slug} name="cliente">
          {clients.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">{t("Selecionar")}</button>
      </form>
      <div className="min-h-0 flex-1">
        <PainelAjudante cliente={selectedClient.slug} key={selectedClient.slug} modo="tela" tela="/admin/analista" />
      </div>
    </div>
  );
}

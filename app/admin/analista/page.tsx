import { redirect } from "next/navigation";

import { PainelAjudante } from "@/app/components/ajudante/painel-ajudante";
import { CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
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
      <section className="flex w-full flex-col gap-6">
        <CabecalhoTela resto={t("Analista Lexia")} />
        <div className="ds-bloco">
          <VazioTela
            pose="piscadinha"
            titulo={t("Nenhum cliente ativo encontrado.")}
          />
        </div>
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
      {/* O cliente escolhe-se na barra (o mesmo filtro das outras telas). */}
      <div className="shrink-0">
        <FiltroTrilho
          opcoes={clients.map((c) => ({
            ativo: c.slug === selectedClient.slug,
            href: `/admin/analista?cliente=${encodeURIComponent(c.slug)}`,
            label: c.name,
          }))}
          rotulo={t("Cliente")}
        />
      </div>
      <div className="min-h-0 flex-1">
        <PainelAjudante
          cliente={selectedClient.slug}
          key={selectedClient.slug}
          modo="tela"
          tela="/admin/analista"
        />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";

import { LancadorAjudante } from "@/app/components/ajudante/lancador";
import { AppSidebar } from "@/app/components/app-sidebar";
import { GestoVoltar } from "@/app/components/gesto-voltar";
import { PonteDoApp } from "@/app/components/ponte-do-app";
import { ScrollToTop } from "@/app/components/scroll-to-top";
import { getT } from "@/lib/i18n/servidor";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { CONTAS_INTERNAS } from "@/lib/admin/hoje";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Menu curto (14/11/2026): a visão geral, os clientes e o que é da Lexia
 * inteira. O resto (conversas, campanhas, serviços, testes, handoffs...) vive
 * dentro da casa de cada cliente, em /admin/clientes/<slug>.
 */
const adminNavigation = [
  { label: "Visão geral", href: "/admin", icon: "dashboard" },
  { label: "Clientes", href: "/admin/clientes", icon: "clientes" },
  { label: "Controle do agente", href: "/admin/turnos", icon: "turnos" },
  { label: "Conexões da Lexia", href: "/admin/conexoes", icon: "conexoes" },
];

/** Os clientes no acesso rápido: verde no ar, dourado em teste; contas internas fora. */
async function clientesDoMenu() {
  const { data } = await createAdminClient()
    .from("lexia_clientes")
    .select("slug, nome, status, modo_teste")
    .eq("status", "ativo")
    .order("nome");
  return (data ?? [])
    .filter((c) => !CONTAS_INTERNAS.has(c.slug))
    .map((c) => ({
      href: `/admin/clientes/${encodeURIComponent(c.slug)}`,
      label: c.nome || c.slug,
      ponto: c.modo_teste ? "var(--ds-ouro)" : "var(--ds-positivo)",
    }));
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ profile }, t] = await Promise.all([getLoggedInUserProfile(), getT()]);

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const atalhos = await clientesDoMenu();

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background pt-[calc(3.5rem+env(safe-area-inset-top,0px))] text-foreground lg:flex-row lg:pt-0">
      <div aria-hidden="true" className="ds-aurora" />
      <AppSidebar
        atalhos={{ items: atalhos, titulo: t("Acesso rápido") }}
        items={adminNavigation.map((item) => ({ ...item, label: t(item.label) }))}
        subtitle={t("Administração")}
      />

      <ScrollToTop alvoId="conteudo" />
      <PonteDoApp />
      <GestoVoltar />

      <main
        className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        id="conteudo"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
      <LancadorAjudante base="/admin" />
    </div>
  );
}

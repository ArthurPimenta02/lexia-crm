import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/components/app-sidebar";
import { GestoVoltar } from "@/app/components/gesto-voltar";
import { PonteDoApp } from "@/app/components/ponte-do-app";
import { ScrollToTop } from "@/app/components/scroll-to-top";
import { getT } from "@/lib/i18n/servidor";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

const adminNavigation = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Analista Lexia", href: "/admin/analista", icon: "analista" },
  { label: "Campanhas", href: "/admin/campanhas", icon: "campanhas" },
  { label: "Serviços", href: "/admin/servicos", icon: "servicos" },
  { label: "Produtos", href: "/admin/produtos", icon: "produtos" },
  { label: "Área de testes", href: "/admin/area-testes", icon: "testes" },
  { label: "Controle do agente", href: "/admin/turnos", icon: "turnos" },
  { label: "Follow-ups e lembretes", href: "/admin/followups", icon: "followups" },
  { label: "Conexões", href: "/admin/conexoes", icon: "conexoes" },
  { label: "Bloqueios", href: "/admin/bloqueios", icon: "bloqueios" },
  { label: "Conversas", href: "/admin/conversas", icon: "conversas" },
  { label: "Handoffs", href: "/admin/handoffs", icon: "handoffs" },
  { label: "Feedbacks", href: "/admin/feedbacks", icon: "feedbacks" },
];

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

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background pt-[calc(3.5rem+env(safe-area-inset-top,0px))] text-foreground lg:flex-row lg:pt-0">
      <div aria-hidden="true" className="ds-aurora" />
      <AppSidebar
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
    </div>
  );
}

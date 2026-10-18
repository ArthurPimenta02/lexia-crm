import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/components/app-sidebar";
import { ScrollToTop } from "@/app/components/scroll-to-top";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

const clientNavigation = [
  { label: "Dashboard", href: "/app", icon: "dashboard" },
  { label: "Pipeline", href: "/app/pipeline", icon: "pipeline" },
  { label: "Agenda", href: "/app/agenda", icon: "agenda" },
  { label: "Analista Lexia", href: "/app/analista", icon: "analista" },
  { label: "Campanhas", href: "/app/campanhas", icon: "campanhas" },
  { label: "Clientes", href: "/app/clientes", icon: "clientes" },
  { label: "Serviços", href: "/app/servicos", icon: "servicos" },
  { label: "Produtos", href: "/app/produtos", icon: "produtos" },
  { label: "Conversas", href: "/app/conversas", icon: "conversas" },
  { label: "Área de testes", href: "/app/area-testes", icon: "testes" },
  { label: "Handoffs", href: "/app/handoffs", icon: "handoffs" },
  { label: "Feedbacks", href: "/app/feedbacks", icon: "feedbacks" },
];

export default async function ClientAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  return (
    // `h-dvh` + `overflow-hidden` fazem a moldura caber exactamente no ecrã:
    // a janela deixa de rolar e quem rola é o `<main>`. É o que mantém a
    // barra lateral — e o "Sair" — parada, por mais comprida que a página
    // seja.
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background pt-14 text-foreground lg:flex-row lg:pt-0">
      <AppSidebar items={clientNavigation} subtitle="Painel do agente" />

      <ScrollToTop alvoId="conteudo" />

      <main
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background"
        id="conteudo"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}

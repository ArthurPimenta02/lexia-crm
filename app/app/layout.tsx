import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/components/app-sidebar";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

const clientNavigation = [
  { label: "Dashboard", href: "/app" },
  { label: "Analista Lexia", href: "/app/analista" },
  { label: "Campanhas", href: "/app/campanhas" },
  { label: "Conversas", href: "/app/conversas" },
  { label: "Área de Testes", href: "/app/area-testes" },
  { label: "Handoffs", href: "/app/handoffs" },
  { label: "Feedbacks", href: "/app/feedbacks" },
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
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f3f3f1] pt-14 text-zinc-950 lg:flex-row lg:pt-0">
      <AppSidebar items={clientNavigation} subtitle="Painel do agente" />

      <main className="min-w-0 flex-1 overflow-x-hidden bg-[linear-gradient(180deg,#f8f8f6_0%,#f3f3f1_48%,#ecebea_100%)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}

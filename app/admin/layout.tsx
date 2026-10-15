import { redirect } from "next/navigation";

import { AppSidebar } from "@/app/components/app-sidebar";
import { getLoggedInUserProfile } from "@/lib/auth/profile";

const adminNavigation = [
  { label: "Dashboard", href: "/admin" },
  { label: "Analista Lexia", href: "/admin/analista" },
  { label: "Campanhas", href: "/admin/campanhas" },
  { label: "Serviços", href: "/admin/servicos" },
  { label: "Área de Testes", href: "/admin/area-testes" },
  { label: "Conversas", href: "/admin/conversas" },
  { label: "Handoffs", href: "/admin/handoffs" },
  { label: "Feedbacks", href: "/admin/feedbacks" },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f3f3f1] pt-14 text-zinc-950 lg:flex-row lg:pt-0">
      <AppSidebar items={adminNavigation} subtitle="Administração" />

      <main className="min-w-0 flex-1 overflow-x-hidden bg-[linear-gradient(180deg,#f8f8f6_0%,#f3f3f1_48%,#ecebea_100%)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}

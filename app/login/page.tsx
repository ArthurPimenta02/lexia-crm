import { redirect } from "next/navigation";

import { LexiaBrand } from "@/app/components/lexia-brand";
import { LoginForm } from "@/app/login/login-form";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

export default async function LoginPage() {
  const { profile } = await getLoggedInUserProfile();

  if (profile?.role === "lexia_admin") {
    redirect("/admin/area-testes");
  }

  if (profile && isClientRole(profile.role)) {
    redirect("/app");
  }

  return (
    <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[1fr_520px]">
      {/*
        O painel escuro não usa os tokens do tema: é sempre preto, seja qual
        for a cor do cliente, porque é a marca da Lexia e não a do cliente.
        Por isso as cores aqui são alfas de branco e não `text-muted-foreground`.
      */}
      <section className="hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#050505] px-10 py-10 lg:flex">
        <LexiaBrand />
        <p className="max-w-xl text-5xl font-semibold tracking-tight text-white">
          Atendimento com IA, medido ao detalhe.
        </p>
        <p className="text-xs font-medium tracking-[0.28em] text-white/40 uppercase">
          Lexia AI
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LexiaBrand tone="light" />
          </div>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
            Entrar
          </h1>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

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
    <main className="grid min-h-screen bg-[#f3f3f1] text-zinc-950 lg:grid-cols-[1fr_520px]">
      <section className="hidden min-h-screen flex-col justify-between overflow-hidden bg-[#050505] px-10 py-10 text-white lg:flex">
        <LexiaBrand />
        <div className="max-w-xl">
          <p className="text-xs font-semibold tracking-[0.34em] text-zinc-500 uppercase">
            Plataforma de atendimento com IA
          </p>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-zinc-50">
            IA que entende. Atendimento que conecta.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-300">
            Teste, acompanhe e melhore conversas de agentes inteligentes com
            clareza operacional.
          </p>
        </div>
        <p className="text-xs font-medium tracking-[0.28em] text-zinc-600 uppercase">
          Lexia AI
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LexiaBrand tone="light" />
          </div>
          <div className="mb-8">
            <p className="text-xs font-semibold tracking-[0.28em] text-zinc-500 uppercase">
              Painel do agente
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
              Acessar painel
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Entre para testar e acompanhar o agente de atendimento.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

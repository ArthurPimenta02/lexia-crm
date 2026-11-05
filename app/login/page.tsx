import { redirect } from "next/navigation";

import { LexiaBrand } from "@/app/components/lexia-brand";
import { Mascote } from "@/app/components/mascote";
import { LoginForm } from "@/app/login/login-form";
import { SeletorIdioma } from "@/app/components/seletor-idioma";
import { SeletorTema } from "@/app/components/seletor-tema";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { destinoSeguro } from "@/lib/movel/destino";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const [{ profile }, t, params] = await Promise.all([getLoggedInUserProfile(), getT(), searchParams]);
  const destino = destinoSeguro(params.destino);

  // Vindo do app do iPhone: quem já tem sessão volta direto para o app.
  if (profile && destino) {
    redirect(destino);
  }

  // Mesmo destino do `getRedirectPath` da acção de login: quem já tem sessão
  // aberta e volta ao /login cai no dashboard, como quem acabou de entrar.
  if (profile?.role === "lexia_admin") {
    redirect("/admin");
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
        <div>
          <Mascote className="mb-8" pose="ola" tamanho={200} />
          <p className="max-w-xl text-5xl font-semibold tracking-tight text-white">
          {t("Atendimento com IA, medido nos mínimos detalhes.")}
        </p>
        </div>
        <p className="text-xs font-medium tracking-[0.28em] text-white/40 uppercase">
          Lexia AI
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-end justify-between lg:hidden">
            <LexiaBrand tone="light" />
            <Mascote pose="ola" tamanho={84} />
          </div>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-foreground">
            {t("Entrar")}
          </h1>
          <LoginForm destino={destino} />
          <div className="mt-8 flex flex-col gap-2">
            <SeletorTema />
            <SeletorIdioma para="cima" />
          </div>
        </div>
      </section>
    </main>
  );
}

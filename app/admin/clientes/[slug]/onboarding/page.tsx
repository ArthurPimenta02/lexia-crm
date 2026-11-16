import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { liberarConversa, salvarEtapa1 } from "@/app/admin/clientes/[slug]/onboarding/actions";
import { ConversaOnboarding } from "@/app/components/onboarding/conversa";
import { Etapa1Form } from "@/app/components/onboarding/etapa1-form";
import { CabecalhoTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { dadosDaEtapa1 } from "@/lib/onboarding/etapa1-tela";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O onboarding de um cliente visto pela equipe da Lexia (acompanhar e, se for
 * preciso, preencher daqui). A tela do dia a dia é a do próprio cliente:
 * /app/onboarding, a única que a conta dele abre enquanto o onboarding durar.
 */
export default async function OnboardingDoClientePage({ params }: { params: Promise<{ slug: string }> }) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const { slug } = await params;
  const t = await getT();
  const admin = createAdminClient();
  const { data: cliente } = await admin.from("lexia_clientes").select("slug, nome").eq("slug", slug).maybeSingle();
  if (!cliente) notFound();
  const nome = (cliente as { nome: string | null }).nome ?? slug;
  const dados = await dadosDaEtapa1(admin, slug);
  const naEtapa1 = dados.estado === "etapa1" || dados.estado === "preparando";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-secundario" href={`/admin/clientes/${slug}`}>
            {t("Voltar ao cliente")}
          </Link>
        }
        resto={naEtapa1 ? t("Informações gerais") : t("Conversa")}
        sobretitulo={`${nome} · ${t("Onboarding")} · ${t("Etapa {n} de 3", { n: naEtapa1 ? 1 : dados.estado === "conversa" ? 2 : 3 })}`}
        subtitulo={naEtapa1 ? t("A equipe da Lexia preenche esta etapa. A IA lê tudo e prepara o rascunho, e a conversa só pergunta o que faltar.") : undefined}
      />
      {naEtapa1 ? (
        <Etapa1Form {...dados} clienteSlug={slug} liberar={liberarConversa.bind(null, slug)} salvarAcao={salvarEtapa1.bind(null, slug)} />
      ) : (
        // A equipe acompanha a conversa, sem responder no lugar da cliente.
        <ConversaOnboarding clienteSlug={slug} somenteLeitura />
      )}
    </main>
  );
}

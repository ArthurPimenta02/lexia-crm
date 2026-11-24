import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { gravarNaBase, liberarConversa, previaDaBase, salvarEtapa1 } from "@/app/admin/clientes/[slug]/onboarding/actions";
import { BaseDoAgente } from "@/app/components/onboarding/base-do-agente";
import { ConversaOnboarding } from "@/app/components/onboarding/conversa";
import { Etapa1Form } from "@/app/components/onboarding/etapa1-form";
import { FichaDoAgente } from "@/app/components/onboarding/revisao";
import { CabecalhoTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { dadosDaEtapa1 } from "@/lib/onboarding/etapa1-tela";
import { clienteDaExportacao } from "@/lib/onboarding/exportar";
import { fichaDe } from "@/lib/onboarding/revisao";
import { createAdminClient } from "@/lib/supabase/admin";

/** A prévia e a gravação da base do agente (Etapa 3) podem chamar a IA do cliente: mais tempo que o padrão. */
export const maxDuration = 300;

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
  const ficha = naEtapa1 ? [] : await fichaDe({ admin, clienteSlug: slug });

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
        <>
          {/* Etapa 3: passar as respostas confirmadas para a base própria do agente (só clientes com tabelas configuradas). */}
          {clienteDaExportacao(slug) ? <BaseDoAgente gravar={gravarNaBase.bind(null, slug)} previa={previaDaBase.bind(null, slug)} /> : null}
          {/* Tudo o que a cliente ensinou até agora, para a equipe montar o agente (só leitura). */}
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="ds-titulo-3 text-foreground">
              {dados.estado === "aprovado" ? t("Ficha enviada pela cliente") : dados.estado === "revisao" ? t("Ficha em revisão pela cliente") : t("Ficha até agora")}
            </h2>
            <FichaDoAgente ficha={ficha} />
          </div>
          {/* A equipe acompanha a conversa, sem responder no lugar da cliente. */}
          <h2 className="ds-titulo-3 text-foreground">{t("Conversa")}</h2>
          <ConversaOnboarding clienteSlug={slug} somenteLeitura />
        </>
      )}
    </main>
  );
}

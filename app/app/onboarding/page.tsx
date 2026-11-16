import { redirect } from "next/navigation";

import { liberarConversa, salvarEtapa1 } from "@/app/app/onboarding/actions";
import { Etapa1Form } from "@/app/components/onboarding/etapa1-form";
import { PassosOnboarding } from "@/app/components/onboarding/passos";
import { CabecalhoTela, VazioTela } from "@/app/components/tela";
import { exigirEcra, temOPainelInteiro } from "@/lib/auth/ecras";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { dadosDaEtapa1 } from "@/lib/onboarding/etapa1-tela";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O onboarding, dentro da conta do cliente. Enquanto durar, é a ÚNICA tela que
 * a conta abre (ver `lib/auth/ecras.ts`). Três etapas: informações gerais,
 * conversa com a entrevistadora e revisão.
 *
 * A empresa é sempre a da sessão.
 */
export default async function OnboardingPage() {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  exigirEcra(profile.cliente_slug, "/app/onboarding");
  // Quem já tem o painel inteiro não está em onboarding.
  if (!profile.cliente_slug || temOPainelInteiro(profile.cliente_slug)) redirect("/app");

  const slug = profile.cliente_slug;
  const t = await getT();
  const admin = createAdminClient();
  const [{ data: cliente }, dados] = await Promise.all([
    admin.from("lexia_clientes").select("nome").eq("slug", slug).maybeSingle(),
    dadosDaEtapa1(admin, slug),
  ]);
  const nome = (cliente as { nome: string | null } | null)?.nome ?? slug;
  const naEtapa1 = dados.estado === "etapa1" || dados.estado === "preparando";
  const etapa = naEtapa1 ? 1 : dados.estado === "conversa" ? 2 : 3;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoTela
        resto={etapa === 1 ? t("Informações gerais") : etapa === 2 ? t("Conversa") : t("Revisão")}
        sobretitulo={`${nome} · ${t("Onboarding")} · ${t("Etapa {n} de 3", { n: etapa })}`}
        subtitulo={etapa === 1 ? t("A equipe da Lexia preenche esta etapa. A IA lê tudo e prepara o rascunho, e a conversa só pergunta o que faltar.") : undefined}
      />
      <PassosOnboarding
        atual={dados.estado === "aprovado" ? 4 : etapa}
        itens={[
          { titulo: t("Informações gerais"), nota: t("Links, materiais e anotações") },
          { titulo: t("Conversa"), nota: t("A entrevistadora pergunta só o que faltar") },
          { titulo: t("Revisão"), nota: t("Conferir tudo e aprovar") },
        ]}
      />
      {naEtapa1 ? (
        <Etapa1Form {...dados} liberar={liberarConversa} salvarAcao={salvarEtapa1} />
      ) : (
        <div className="ds-cartao">
          <VazioTela texto={t("As informações gerais já estão guardadas. A conversa com a entrevistadora é o próximo passo e abre aqui.")} titulo={t("A conversa abre em breve")} />
        </div>
      )}
    </div>
  );
}

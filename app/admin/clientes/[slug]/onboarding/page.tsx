import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Etapa1Form } from "@/app/admin/clientes/[slug]/onboarding/etapa1-form";
import { CabecalhoTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { lerOnboarding, listarArquivos } from "@/lib/onboarding/dados";
import { situacaoDoCaderno } from "@/lib/onboarding/etapa1";
import { ESQUEMA_ONBOARDING } from "@/lib/onboarding/esquema";
import { chaveDoCliente } from "@/lib/onboarding/ia";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Onboarding, Etapa 1 (informações gerais). Quem preenche é a equipe da Lexia:
 * links, materiais e anotações. A IA lê tudo e deixa o rascunho pronto para a
 * cliente confirmar na conversa (Etapa 2).
 */
export default async function OnboardingEtapa1Page({ params }: { params: Promise<{ slug: string }> }) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const { slug } = await params;
  const t = await getT();
  const admin = createAdminClient();
  const { data: cliente } = await admin.from("lexia_clientes").select("slug, nome").eq("slug", slug).maybeSingle();
  if (!cliente) notFound();
  const nome = (cliente as { nome: string | null }).nome ?? slug;

  const onb = await lerOnboarding(admin, slug);
  const [arquivos, situacao, ia] = await Promise.all([
    onb ? listarArquivos(admin, slug, onb.id) : Promise.resolve([]),
    onb ? situacaoDoCaderno(admin, slug, onb.id) : Promise.resolve(null),
    chaveDoCliente(admin, slug),
  ]);

  const rotulo = new Map(ESQUEMA_ONBOARDING.flatMap((s) => [...s.campos, ...s.grupos.flatMap((g) => g.campos)]).map((c) => [c.chave, c.pergunta]));
  const titulos = new Map(ESQUEMA_ONBOARDING.map((s) => [s.chave, s.titulo]));
  // O rascunho, para a equipe conferir antes de liberar: o que foi achado, seção a seção.
  const achado = (situacao?.caderno ?? [])
    .filter((c) => c.linha && c.situacao === "por_confirmar")
    .map((c) => ({
      secao: titulos.get(c.secao) ?? c.secao,
      grupo: c.grupo,
      itemId: c.itemId,
      chave: c.campo.chave,
      pergunta: rotulo.get(c.campo.chave) ?? c.campo.chave,
      valor: c.linha!.valor,
      fonte: c.linha!.fonte,
    }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-secundario" href={`/admin/clientes/${slug}`}>
            {t("Voltar ao cliente")}
          </Link>
        }
        resto={t("Informações gerais")}
        sobretitulo={`${nome} · ${t("Onboarding")} · ${t("Etapa 1 de 3")}`}
        subtitulo={t("A equipe da Lexia preenche esta etapa. A IA lê tudo e prepara o rascunho, e a conversa só pergunta o que faltar.")}
      />
      <Etapa1Form
        achado={achado}
        achados={onb?.achados ?? {}}
        arquivos={arquivos.filter((a) => a.origem === "etapa1").map((a) => ({ id: a.id, nome: a.nome ?? "arquivo", tamanho: a.tamanho ?? 0, lido: !!a.texto_em }))}
        clienteSlug={slug}
        estado={onb?.estado ?? "etapa1"}
        etapa1={onb?.etapa1 ?? {}}
        numeros={situacao ? { raizTotal: situacao.raizTotal, raizPreenchidos: situacao.raizPreenchidos, servicos: situacao.servicos, servicosComPreco: situacao.servicosComPreco, servicosComDuracao: situacao.servicosComDuracao, faqs: situacao.faqs, profissionais: situacao.profissionais, promocoes: situacao.promocoes } : null}
        temChaveDeIa={!!ia}
      />
    </main>
  );
}

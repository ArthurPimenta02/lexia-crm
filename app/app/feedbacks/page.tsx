import { redirect } from "next/navigation";

import {
  ajustesPendentes,
  CartoesFeedback,
  filtrosFeedback,
  LinhaFeedback,
  lerFiltroFeedback,
  passaNoFiltroFeedback,
} from "@/app/app/feedbacks/lista-feedbacks";
import { buildAppConversationHref } from "@/app/components/feedback-conversation-utils";
import { CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";

type ClientFeedback = {
  id: string;
  avaliacao: string | null;
  mensagem_cliente: string | null;
  resposta_agente: string | null;
  comentario: string | null;
  status: string | null;
  criado_em: string | null;
};

/** Data e hora no idioma de quem vê, no fuso do cliente. */
function formatarData(
  date: string | null,
  timeZone: string,
  locale: string,
  semData: string,
) {
  if (!date) {
    return semData;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(date));
}

export default async function ClientFeedbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/feedbacks");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const timeZone = getClientTimezone(profile.cliente_slug);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_feedbacks")
    .select(
      "id, avaliacao, mensagem_cliente, resposta_agente, comentario, status, criado_em",
    )
    .eq("cliente_slug", profile.cliente_slug)
    .order("criado_em", { ascending: false });

  if (error) {
    throw new Error("Não foi possível buscar os feedbacks.");
  }

  const feedbacks = (data ?? []) as ClientFeedback[];
  const filtro = lerFiltroFeedback((await searchParams).status);
  const visiveis = feedbacks.filter((f) => passaNoFiltroFeedback(f, filtro));
  const pendentes = ajustesPendentes(feedbacks);

  return (
    <section className="flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <CabecalhoTela
        acoes={
          feedbacks.length > 0 ? (
            <FiltroTrilho
              opcoes={filtrosFeedback.map((f) => ({
                ativo: f.chave === filtro,
                href: f.chave === "todos" ? "/app/feedbacks" : `/app/feedbacks?status=${f.chave}`,
                label: t(f.label),
                quantidade: feedbacks.filter((x) => passaNoFiltroFeedback(x, f.chave)).length,
              }))}
              rotulo={t("Situação")}
            />
          ) : undefined
        }
        destaque={
          pendentes === 0
            ? undefined
            : pendentes === 1
              ? t("1 ajuste")
              : t("{n} ajustes", { n: pendentes })
        }
        resto={
          pendentes === 0
            ? t("Nenhum ajuste esperando a nossa equipe.")
            : t("esperando a nossa equipe.")
        }
        sobretitulo={t("Feedbacks · o que você ensinou ao agente")}
      />

      {feedbacks.length > 0 ? <CartoesFeedback feedbacks={feedbacks} t={t} /> : null}

      <div className="ds-bloco">
        {visiveis.length > 0 ? (
          <div className="tela-lista p-1.5">
            {visiveis.map((feedback) => (
              <LinhaFeedback
                data={formatarData(feedback.criado_em, timeZone, locale, t("Sem data"))}
                feedback={feedback}
                hrefConversa={buildAppConversationHref}
                key={feedback.id}
                t={t}
              />
            ))}
          </div>
        ) : (
          <VazioTela
            pose="feliz"
            texto={t("Avalie as respostas na Área de testes ou toque em Reportar numa conversa para pedir um ajuste.")}
            titulo={
              feedbacks.length === 0
                ? t("Ainda não há feedbacks registrados.")
                : t("Nenhum feedback nesta situação.")
            }
          />
        )}
      </div>
    </section>
  );
}

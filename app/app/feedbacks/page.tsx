import Link from "next/link";
import { redirect } from "next/navigation";

import { ExpandableText } from "@/app/components/expandable-text";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import {
  buildAppConversationHref,
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

/*
 * Os valores (`erro_grave`, `pendente`…) vêm da base. Os conhecidos têm
 * tradução no dicionário; um valor novo aparece tal como está.
 */
function formatLabel(value: string | null, t: FuncaoT) {
  if (!value) {
    return t("Sem valor");
  }

  return t(value.replaceAll("_", " "));
}

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

function FeedbackResponse({ t, text }: { t: FuncaoT; text: string | null }) {
  if (isLikelyImageUrl(text)) {
    return (
      <a
        className="inline-flex max-w-full rounded-2xl border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        href={text ?? ""}
        rel="noreferrer"
        target="_blank"
      >
        {t("Ver imagem marcada")}
      </a>
    );
  }

  return (
    <ExpandableText
      emptyText={t("Resposta marcada não registrada.")}
      text={text}
    />
  );
}

export default async function ClientFeedbacksPage() {
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

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo={t("Feedbacks")} />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {feedbacks.length > 0 ? (
          /*
            Larguras em píxeis: em percentagem, a coluna da data ficava com
            41px em telemóvel e partia-se a meio do ano. Aqui cada coluna tem
            o que precisa e a tabela desliza na horizontal quando não cabe.
          */
          <div className="overflow-x-auto">
            <table className="min-w-[1024px] table-fixed border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="w-[112px] border-b border-border px-3 py-3 font-medium">
                    {t("Data")}
                  </th>
                  <th className="w-[140px] border-b border-border px-3 py-3 font-medium">
                    {t("Categoria")}
                  </th>
                  <th className="w-[240px] border-b border-border px-3 py-3 font-medium">
                    {t("Mensagem do cliente")}
                  </th>
                  <th className="w-[260px] border-b border-border px-3 py-3 font-medium">
                    {t("Resposta do agente")}
                  </th>
                  <th className="w-[240px] border-b border-border px-3 py-3 font-medium">
                    {t("Comentário")}
                  </th>
                  <th className="w-[112px] border-b border-border px-3 py-3 font-medium">
                    {t("Status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.map((feedback) => {
                  const parsedComentario = parseFeedbackComentario(
                    feedback.comentario,
                  );
                  const conversationTarget = parsedComentario.conversa
                    ? buildAppConversationHref(
                        parsedComentario.conversa,
                        parsedComentario.messageId,
                      )
                    : null;
                  const commentText = parsedComentario.isConversationFeedback
                    ? parsedComentario.observacao
                    : feedback.comentario;

                  return (
                    <tr className="border-b border-border" key={feedback.id}>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                        {formatarData(feedback.criado_em, timeZone, locale, t("Sem data"))}
                      </td>
                      <td className="break-words px-3 py-3 align-top font-medium text-foreground">
                        <div className="flex flex-col gap-2">
                          <span>{formatLabel(feedback.avaliacao, t)}</span>
                          {parsedComentario.categoria ? (
                            <span className="ds-selo ds-selo-perigo w-fit">
                              {t(parsedComentario.categoria)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <ExpandableText
                          emptyText={t("Mensagem do cliente não registrada.")}
                          text={feedback.mensagem_cliente}
                        />
                        {conversationTarget ? (
                          <Link
                            className="mt-2 block text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            href={conversationTarget}
                          >
                            {t("Abrir na conversa")}
                          </Link>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <FeedbackResponse t={t} text={feedback.resposta_agente} />
                        {conversationTarget ? (
                          <Link
                            className="mt-2 block text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            href={conversationTarget}
                          >
                            {t("Ver conversa")}
                          </Link>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <ExpandableText
                          emptyText={t("Sem comentário")}
                          text={commentText}
                        />
                        {parsedComentario.conversa ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("Conversa relacionada")}
                          </p>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <span className="ds-selo ds-selo-neutro">
                          {formatLabel(feedback.status, t)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("Ainda não há feedbacks registrados.")}
          </div>
        )}
      </div>
    </section>
  );
}

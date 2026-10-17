import Link from "next/link";
import { redirect } from "next/navigation";

import { ExpandableText } from "@/app/components/expandable-text";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import {
  buildAppConversationHref,
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import {
  formatDateInTimezone,
  getClientTimezone,
} from "@/lib/clientes/timezone";
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

function formatLabel(value: string | null) {
  if (!value) {
    return "Sem valor";
  }

  return value.replaceAll("_", " ");
}

function FeedbackResponse({ text }: { text: string | null }) {
  if (isLikelyImageUrl(text)) {
    return (
      <a
        className="inline-flex max-w-full rounded-2xl border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        href={text ?? ""}
        rel="noreferrer"
        target="_blank"
      >
        Ver imagem marcada
      </a>
    );
  }

  return (
    <ExpandableText emptyText="Resposta marcada não registada." text={text} />
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

  if (!profile.cliente_slug) {
    redirect("/app");
  }

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
      <PaginaCabecalho titulo="Feedbacks" />

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
                    Data
                  </th>
                  <th className="w-[140px] border-b border-border px-3 py-3 font-medium">
                    Categoria
                  </th>
                  <th className="w-[240px] border-b border-border px-3 py-3 font-medium">
                    Mensagem do cliente
                  </th>
                  <th className="w-[260px] border-b border-border px-3 py-3 font-medium">
                    Resposta do agente
                  </th>
                  <th className="w-[240px] border-b border-border px-3 py-3 font-medium">
                    Comentário
                  </th>
                  <th className="w-[112px] border-b border-border px-3 py-3 font-medium">
                    Estado
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
                        {formatDateInTimezone(feedback.criado_em, timeZone)}
                      </td>
                      <td className="break-words px-3 py-3 align-top font-medium text-foreground">
                        <div className="flex flex-col gap-2">
                          <span>{formatLabel(feedback.avaliacao)}</span>
                          {parsedComentario.categoria ? (
                            <span className="inline-flex w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              {parsedComentario.categoria}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <ExpandableText
                          emptyText="Mensagem do cliente não registada."
                          text={feedback.mensagem_cliente}
                        />
                        {conversationTarget ? (
                          <Link
                            className="mt-2 block text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            href={conversationTarget}
                          >
                            Abrir na conversa
                          </Link>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <FeedbackResponse text={feedback.resposta_agente} />
                        {conversationTarget ? (
                          <Link
                            className="mt-2 block text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            href={conversationTarget}
                          >
                            Ver conversa
                          </Link>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <ExpandableText
                          emptyText="Sem comentário"
                          text={commentText}
                        />
                        {parsedComentario.conversa ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Conversa relacionada
                          </p>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {formatLabel(feedback.status)}
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
            Ainda não há feedbacks registados.
          </div>
        )}
      </div>
    </section>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { ExpandableText } from "@/app/components/expandable-text";
import {
  buildAppConversationHref,
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
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

function formatDate(date: string | null) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

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
        className="inline-flex max-w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 underline-offset-2 hover:underline"
        href={text ?? ""}
        rel="noreferrer"
        target="_blank"
      >
        Ver imagem marcada
      </a>
    );
  }

  return (
    <ExpandableText
      emptyText="Resposta marcada não registada."
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

  if (!profile.cliente_slug) {
    redirect("/app");
  }

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
      <div>
        <p className="text-sm font-semibold tracking-[0.32em] text-zinc-500 uppercase">
          Agente
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Feedbacks
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Problemas e melhorias marcadas nas respostas do agente.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        {feedbacks.length > 0 ? (
          <div className="w-full">
            <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th className="w-[12%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Data
                  </th>
                  <th className="w-[12%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Categoria
                  </th>
                  <th className="w-[20%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Mensagem do cliente
                  </th>
                  <th className="w-[22%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Resposta do agente
                  </th>
                  <th className="w-[22%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Comentário
                  </th>
                  <th className="w-[12%] border-b border-zinc-200 px-3 py-3 font-medium">
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
                  <tr className="border-b border-zinc-200" key={feedback.id}>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatDate(feedback.criado_em)}
                    </td>
                    <td className="break-words px-3 py-3 align-top font-medium text-zinc-950">
                      <div className="flex flex-col gap-2">
                          <span>{formatLabel(feedback.avaliacao)}</span>
                        {parsedComentario.categoria ? (
                          <span className="inline-flex w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {parsedComentario.categoria}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-700">
                      <ExpandableText
                        emptyText="Mensagem do cliente não registada."
                        text={feedback.mensagem_cliente}
                      />
                      {conversationTarget ? (
                        <Link
                          className="mt-2 block text-xs font-medium text-zinc-950 underline-offset-2 hover:underline"
                          href={conversationTarget}
                        >
                          Abrir na conversa
                        </Link>
                      ) : null}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-700">
                      <FeedbackResponse text={feedback.resposta_agente} />
                      {conversationTarget ? (
                        <Link
                          className="mt-2 block text-xs font-medium text-zinc-950 underline-offset-2 hover:underline"
                          href={conversationTarget}
                        >
                          Ver conversa
                        </Link>
                      ) : null}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-700">
                      <ExpandableText
                        emptyText="Sem comentário"
                        text={commentText}
                      />
                      {parsedComentario.conversa ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          Conversa relacionada
                        </p>
                      ) : null}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-700">
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
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
          <div className="px-4 py-10 text-center text-sm text-zinc-600">
            Ainda não há feedbacks registados.
          </div>
        )}
      </div>
    </section>
  );
}

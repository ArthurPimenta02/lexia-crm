import Link from "next/link";

import {
  updateAdminFeedbackStatus,
  type AdminFeedbackStatus,
} from "@/app/admin/feedbacks/actions";
import { ExpandableText } from "@/app/components/expandable-text";
import {
  buildAdminConversationHref,
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { createClient } from "@/lib/supabase/server";

type AdminFeedback = {
  id: string;
  cliente_slug: string;
  avaliacao: string | null;
  mensagem_cliente: string | null;
  resposta_agente: string | null;
  comentario: string | null;
  origem: string | null;
  status: AdminFeedbackStatus | null;
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
        className="inline-flex max-w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 underline-offset-2 hover:underline"
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

const statusActions: { label: string; status: AdminFeedbackStatus }[] = [
  { label: "Marcar como analisado", status: "analisado" },
  { label: "Marcar como resolvido", status: "resolvido" },
  { label: "Voltar para pendente", status: "pendente" },
];

export default async function AdminFeedbacksPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_feedbacks")
    .select(
      "id, cliente_slug, avaliacao, mensagem_cliente, resposta_agente, comentario, origem, status, criado_em",
    )
    .order("criado_em", { ascending: false });

  if (error) {
    throw new Error("Não foi possível buscar os feedbacks.");
  }

  const feedbacks = (data ?? []) as AdminFeedback[];

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Feedbacks</h1>
        <p className="mt-2 text-zinc-600">
          Feedbacks recebidos em todos os clientes da Lexia.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        {feedbacks.length > 0 ? (
          <div className="w-full">
            <table className="w-full table-fixed border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="w-[9%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Data
                  </th>
                  <th className="w-[9%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Cliente
                  </th>
                  <th className="w-[10%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Avaliação
                  </th>
                  <th className="w-[16%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Mensagem do cliente
                  </th>
                  <th className="w-[18%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Resposta do agente
                  </th>
                  <th className="w-[16%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Comentário
                  </th>
                  <th className="w-[8%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Origem
                  </th>
                  <th className="w-[7%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Status
                  </th>
                  <th className="w-[7%] border-b border-zinc-200 px-3 py-3 font-medium">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.map((feedback) => {
                  const parsedComentario = parseFeedbackComentario(
                    feedback.comentario,
                  );
                  const conversationTarget = parsedComentario.conversa
                    ? buildAdminConversationHref(
                        feedback.cliente_slug,
                        parsedComentario.conversa,
                        parsedComentario.messageId,
                      )
                    : null;
                  const commentText = parsedComentario.isConversationFeedback
                    ? parsedComentario.observacao
                    : feedback.comentario;

                  return (
                  <tr className="border-b border-zinc-100" key={feedback.id}>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatDate(feedback.criado_em)}
                    </td>
                    <td className="break-words px-3 py-3 align-top font-medium text-zinc-950">
                      {feedback.cliente_slug}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      <div className="flex flex-col gap-2">
                        <span>{formatLabel(feedback.avaliacao)}</span>
                        {parsedComentario.categoria ? (
                          <span className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                            {parsedComentario.categoria}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
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
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
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
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      <ExpandableText
                        emptyText="Sem comentário"
                        text={commentText}
                      />
                      {parsedComentario.conversa ? (
                        <p className="mt-2 break-all font-mono text-xs text-zinc-400">
                          {parsedComentario.conversa}
                        </p>
                      ) : null}
                      {parsedComentario.origemDetalhada ? (
                        <p className="mt-1 text-xs text-zinc-400">
                          Origem: {formatLabel(parsedComentario.origemDetalhada)}
                        </p>
                      ) : null}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatLabel(feedback.origem)}
                    </td>
                    <td className="break-words px-3 py-3 align-top text-zinc-600">
                      {formatLabel(feedback.status)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <Link
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-left text-xs font-medium whitespace-normal text-zinc-700 transition hover:bg-zinc-100"
                          href={`/admin/ajustes?cliente=${encodeURIComponent(
                            feedback.cliente_slug,
                          )}&feedback=${encodeURIComponent(feedback.id)}`}
                        >
                          Criar ajuste
                        </Link>
                        {statusActions.map((action) => (
                          <form
                            action={updateAdminFeedbackStatus.bind(
                              null,
                              feedback.id,
                              action.status,
                            )}
                            key={action.status}
                          >
                            <button
                              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-left text-xs font-medium whitespace-normal text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={feedback.status === action.status}
                              type="submit"
                            >
                              {action.label}
                            </button>
                          </form>
                        ))}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Nenhum feedback recebido ainda.
          </div>
        )}
      </div>
    </section>
  );
}

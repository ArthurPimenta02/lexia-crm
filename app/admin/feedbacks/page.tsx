import Link from "next/link";

import {
  updateAdminFeedbackStatus,
  type AdminFeedbackStatus,
} from "@/app/admin/feedbacks/actions";
import { ExpandableText } from "@/app/components/expandable-text";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import {
  buildAdminConversationHref,
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

const statusActions: { label: string; status: AdminFeedbackStatus }[] = [
  { label: "Marcar como analisado", status: "analisado" },
  { label: "Marcar como resolvido", status: "resolvido" },
  { label: "Voltar para pendente", status: "pendente" },
];

export default async function AdminFeedbacksPage() {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
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
      <PaginaCabecalho titulo={t("Feedbacks")} />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {feedbacks.length > 0 ? (
          /*
            Larguras em píxeis e não em percentagem.
            Com nove colunas em percentagem, a data ficava com 84px úteis e
            partia-se a meio do ano ("05/09/20" / "26, 00:59"); o slug do
            cliente partia-se letra a letra. Em píxeis cada coluna tem o que
            precisa e, se não couber tudo, a tabela desliza na horizontal —
            que é o que as outras tabelas do painel já fazem.
          */
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] table-fixed border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="w-[112px] border-b border-border px-3 py-3 font-medium">
                    {t("Data")}
                  </th>
                  <th className="w-[132px] border-b border-border px-3 py-3 font-medium">
                    {t("Cliente")}
                  </th>
                  <th className="w-[120px] border-b border-border px-3 py-3 font-medium">
                    {t("Avaliação")}
                  </th>
                  <th className="w-[220px] border-b border-border px-3 py-3 font-medium">
                    {t("Mensagem do cliente")}
                  </th>
                  <th className="w-[240px] border-b border-border px-3 py-3 font-medium">
                    {t("Resposta do agente")}
                  </th>
                  <th className="w-[200px] border-b border-border px-3 py-3 font-medium">
                    {t("Comentário")}
                  </th>
                  <th className="w-[104px] border-b border-border px-3 py-3 font-medium">
                    {t("Origem")}
                  </th>
                  <th className="w-[96px] border-b border-border px-3 py-3 font-medium">
                    {t("Status")}
                  </th>
                  <th className="w-[156px] border-b border-border px-3 py-3 font-medium">
                    {t("Ações")}
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
                    <tr className="border-b border-border" key={feedback.id}>
                      <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                        {formatarData(
                          feedback.criado_em,
                          getClientTimezone(feedback.cliente_slug),
                          locale,
                          t("Sem data"),
                        )}
                      </td>
                      <td className="break-words px-3 py-3 align-top font-medium text-foreground">
                        {feedback.cliente_slug}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        <div className="flex flex-col gap-2">
                          <span>{formatLabel(feedback.avaliacao, t)}</span>
                          {parsedComentario.categoria ? (
                            <span className="ds-selo ds-selo-neutro w-fit">
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
                          <p className="mt-2 break-all font-mono text-xs text-muted-foreground/60">
                            {parsedComentario.conversa}
                          </p>
                        ) : null}
                        {parsedComentario.origemDetalhada ? (
                          <p className="mt-1 text-xs text-muted-foreground/60">
                            {t("Origem")}:{" "}
                            {formatLabel(parsedComentario.origemDetalhada, t)}
                          </p>
                        ) : null}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        {formatLabel(feedback.origem, t)}
                      </td>
                      <td className="break-words px-3 py-3 align-top text-muted-foreground">
                        {formatLabel(feedback.status, t)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-2">
                          <Link
                            className="w-full rounded-lg border border-border-strong px-2 py-1.5 text-left text-xs font-medium whitespace-normal text-muted-foreground transition hover:bg-muted"
                            href={`/admin/ajustes?cliente=${encodeURIComponent(
                              feedback.cliente_slug,
                            )}&feedback=${encodeURIComponent(feedback.id)}`}
                          >
                            {t("Criar ajuste")}
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
                              <FormSubmitButton
                                className="min-h-10 w-full rounded-lg border border-border-strong px-2 py-1.5 text-left text-xs font-medium whitespace-normal text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={feedback.status === action.status}
                                pendingLabel={t("Salvando...")}
                              >
                                {t(action.label)}
                              </FormSubmitButton>
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
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("Nenhum feedback recebido ainda.")}
          </div>
        )}
      </div>
    </section>
  );
}

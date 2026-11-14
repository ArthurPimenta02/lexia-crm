import Link from "next/link";

import {
  updateAdminFeedbackStatus,
  type AdminFeedbackStatus,
} from "@/app/admin/feedbacks/actions";
import {
  ajustesPendentes,
  CartoesFeedback,
  filtrosFeedback,
  LinhaFeedback,
  lerFiltroFeedback,
  passaNoFiltroFeedback,
  rotuloDoValor,
} from "@/app/app/feedbacks/lista-feedbacks";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import {
  buildAdminConversationHref,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
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

/** Data e hora no idioma de quem vê, no fuso do cliente do feedback. */
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

const statusActions: { label: string; status: AdminFeedbackStatus }[] = [
  { label: "Marcar como analisado", status: "analisado" },
  { label: "Marcar como resolvido", status: "resolvido" },
  { label: "Voltar para pendente", status: "pendente" },
];

export default async function AdminFeedbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string | string[]; status?: string | string[] }>;
}) {
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

  // `?cliente=` vem da casa do cliente: a mesma tela, só com os dele.
  const params = await searchParams;
  const clientePedido = Array.isArray(params.cliente) ? params.cliente[0] : params.cliente;
  const feedbacks = ((data ?? []) as AdminFeedback[]).filter(
    (f) => !clientePedido || f.cliente_slug === clientePedido,
  );
  const comCliente = (q: string) =>
    clientePedido ? `${q}${q ? "&" : "?"}cliente=${encodeURIComponent(clientePedido)}` : q;
  const filtro = lerFiltroFeedback(params.status);
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
                href: `/admin/feedbacks${comCliente(f.chave === "todos" ? "" : `?status=${f.chave}`)}`,
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
            ? t("Nenhum ajuste esperando análise.")
            : t("esperando análise.")
        }
        sobretitulo={clientePedido ? t("Feedbacks") : t("Feedbacks · todos os clientes")}
      />

      {feedbacks.length > 0 ? <CartoesFeedback feedbacks={feedbacks} t={t} /> : null}

      <div className="ds-bloco">
        {visiveis.length > 0 ? (
          <div className="tela-lista p-1.5">
            {visiveis.map((feedback) => {
              const parsed = parseFeedbackComentario(feedback.comentario);

              return (
                <LinhaFeedback
                  acoes={
                    <>
                      <Link
                        className="ds-botao ds-botao-primario ds-botao-p"
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
                            className="ds-botao ds-botao-secundario ds-botao-p disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={feedback.status === action.status}
                            pendingLabel={t("Salvando...")}
                          >
                            {t(action.label)}
                          </FormSubmitButton>
                        </form>
                      ))}
                    </>
                  }
                  data={formatarData(
                    feedback.criado_em,
                    getClientTimezone(feedback.cliente_slug),
                    locale,
                    t("Sem data"),
                  )}
                  detalheExtra={
                    <p className="text-xs text-muted-foreground">
                      {t("Origem")}: {rotuloDoValor(feedback.origem, t)}
                      {parsed.origemDetalhada
                        ? ` · ${rotuloDoValor(parsed.origemDetalhada, t)}`
                        : ""}
                      {parsed.conversa ? (
                        <span className="ml-1 font-mono break-all text-muted-foreground/70">
                          · {parsed.conversa}
                        </span>
                      ) : null}
                    </p>
                  }
                  feedback={feedback}
                  hrefConversa={(conversa, messageId) =>
                    buildAdminConversationHref(feedback.cliente_slug, conversa, messageId)
                  }
                  key={feedback.id}
                  rotuloExtra={feedback.cliente_slug}
                  t={t}
                />
              );
            })}
          </div>
        ) : (
          <VazioTela
            pose="feliz"
            titulo={
              feedbacks.length === 0
                ? t("Nenhum feedback recebido ainda.")
                : t("Nenhum feedback nesta situação.")
            }
          />
        )}
      </div>
    </section>
  );
}

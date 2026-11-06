import Link from "next/link";
import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, ChevronDown, MessageCircleWarning } from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";
import { ExpandableText } from "@/app/components/expandable-text";
import {
  isLikelyImageUrl,
  parseFeedbackComentario,
} from "@/app/components/feedback-conversation-utils";
import { GradeMetricas } from "@/app/components/tela";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * As peças da tela de Feedbacks, iguais no painel do cliente e no admin
 * (redesenho de 06/11/2026): três cartões com as avaliações, o filtro por
 * situação e uma linha por feedback que abre para mostrar a conversa.
 */

export type FeedbackBase = {
  avaliacao: string | null;
  comentario: string | null;
  criado_em: string | null;
  id: string;
  mensagem_cliente: string | null;
  resposta_agente: string | null;
  status: string | null;
};

export const filtrosFeedback = [
  { chave: "todos", label: "Todos" },
  { chave: "pendente", label: "Pendentes" },
  { chave: "analisado", label: "Analisados" },
  { chave: "resolvido", label: "Resolvidos" },
] as const;
export type FiltroFeedback = (typeof filtrosFeedback)[number]["chave"];

export function lerFiltroFeedback(valor: string | string[] | undefined): FiltroFeedback {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return filtrosFeedback.find((f) => f.chave === v)?.chave ?? "todos";
}

/** Sem status gravado, o feedback ainda não foi visto: conta como pendente. */
function statusDe(feedback: Pick<FeedbackBase, "status">) {
  return feedback.status || "pendente";
}

export function passaNoFiltroFeedback(feedback: FeedbackBase, filtro: FiltroFeedback) {
  return filtro === "todos" || statusDe(feedback) === filtro;
}

/** Ajuste à espera: pediu correção (não é "boa resposta") e ainda está pendente. */
export function ajustesPendentes(feedbacks: FeedbackBase[]) {
  return feedbacks.filter(
    (f) => f.avaliacao !== "boa_resposta" && statusDe(f) === "pendente",
  ).length;
}

const avaliacoes: Record<string, { cor: string; icone: ReactNode }> = {
  boa_resposta: { cor: "var(--ds-acao)", icone: <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> },
  erro_grave: { cor: "var(--ds-perigo)", icone: <AlertTriangle aria-hidden="true" className="h-4 w-4" /> },
  precisa_ajuste: { cor: "var(--ds-alerta)", icone: <MessageCircleWarning aria-hidden="true" className="h-4 w-4" /> },
};
const avaliacaoNeutra = {
  cor: "var(--ds-texto-2)",
  icone: <MessageCircleWarning aria-hidden="true" className="h-4 w-4" />,
};

const selosStatus: Record<string, string> = {
  analisado: "ds-selo-neutro",
  pendente: "ds-selo-alerta ds-selo-ponto",
  resolvido: "ds-selo-verde",
};

/*
 * Os valores (`erro_grave`, `pendente`…) vêm da base. Os conhecidos têm
 * tradução no dicionário; um valor novo aparece tal como está.
 */
export function rotuloDoValor(value: string | null, t: FuncaoT) {
  if (!value) {
    return t("Sem valor");
  }

  return t(value.replaceAll("_", " "));
}

function maiuscula(texto: string) {
  return texto.charAt(0).toLocaleUpperCase() + texto.slice(1);
}

/** Os três cartões: quantas respostas boas, a ajustar e com erro grave. */
export function CartoesFeedback({ feedbacks, t }: { feedbacks: FeedbackBase[]; t: FuncaoT }) {
  const total = feedbacks.length;
  const de = (avaliacao: string) => feedbacks.filter((f) => f.avaliacao === avaliacao);
  const boas = de("boa_resposta").length;
  const ajustes = de("precisa_ajuste");
  const graves = de("erro_grave");
  const resolvidos = (lista: FeedbackBase[]) => lista.filter((f) => statusDe(f) === "resolvido").length;
  const porcento = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <GradeMetricas colunas={3}>
      <CartaoMetrica
        cor="var(--ds-acao)"
        icone={avaliacoes.boa_resposta.icone}
        nota={t("{n}% dos feedbacks", { n: porcento(boas) })}
        rotulo={t("Boa resposta")}
        valor={String(boas)}
      />
      <CartaoMetrica
        cor="var(--ds-alerta)"
        icone={avaliacoes.precisa_ajuste.icone}
        nota={t("{n} já resolvidos", { n: resolvidos(ajustes) })}
        rotulo={t("Precisa ajuste")}
        valor={String(ajustes.length)}
      />
      {/* No celular a grade tem 2 colunas: o terceiro cartão ocupa a linha toda. */}
      <div className="col-span-2 xl:col-span-1">
        <CartaoMetrica
          cor="var(--ds-perigo)"
          icone={avaliacoes.erro_grave.icone}
          nota={t("{n} já resolvidos", { n: resolvidos(graves) })}
          rotulo={t("Erro grave")}
          valor={String(graves.length)}
        />
      </div>
    </GradeMetricas>
  );
}

function Campo({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-6 break-words text-foreground">{children}</div>
    </div>
  );
}

function RespostaMarcada({ t, text }: { t: FuncaoT; text: string | null }) {
  if (isLikelyImageUrl(text)) {
    return (
      <a
        className="ds-botao ds-botao-secundario ds-botao-p"
        href={text ?? ""}
        rel="noreferrer"
        target="_blank"
      >
        {t("Ver imagem marcada")}
      </a>
    );
  }

  return <ExpandableText emptyText={t("Resposta marcada não registrada.")} maxLength={400} text={text} />;
}

/**
 * Uma linha por feedback. Fechada: o que foi dito, a avaliação, quando e a
 * situação. Aberta: a mensagem do cliente, a resposta marcada e o link para
 * a conversa. `acoes` e `detalheExtra` são do admin.
 */
export function LinhaFeedback({
  acoes,
  data,
  detalheExtra,
  feedback,
  hrefConversa,
  rotuloExtra,
  t,
}: {
  acoes?: ReactNode;
  data: string;
  detalheExtra?: ReactNode;
  feedback: FeedbackBase;
  hrefConversa: (conversa: string, messageId: string | null) => string;
  rotuloExtra?: string;
  t: FuncaoT;
}) {
  const parsed = parseFeedbackComentario(feedback.comentario);
  const comentario = parsed.isConversationFeedback ? parsed.observacao : feedback.comentario;
  const alvo = parsed.conversa ? hrefConversa(parsed.conversa, parsed.messageId) : null;
  const aval = avaliacoes[feedback.avaliacao ?? ""] ?? avaliacaoNeutra;
  const status = statusDe(feedback);
  const titulo =
    comentario?.trim() ||
    (parsed.categoria ? t(parsed.categoria) : "") ||
    feedback.mensagem_cliente?.trim() ||
    maiuscula(rotuloDoValor(feedback.avaliacao, t));
  const meta = [
    maiuscula(rotuloDoValor(feedback.avaliacao, t)),
    parsed.categoria && comentario?.trim() ? t(parsed.categoria) : null,
    parsed.conversa ? t("Conversa real") : t("Área de testes"),
    rotuloExtra,
    data,
  ].filter(Boolean);

  return (
    <details className="group">
      <summary className="tela-linha cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="ds-chip-icone" style={{ ["--chip" as string]: aval.cor }}>
          {aval.icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-foreground sm:line-clamp-1">{titulo}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
        </div>
        <span className={`ds-selo shrink-0 ${selosStatus[status] ?? "ds-selo-neutro"}`}>
          {maiuscula(rotuloDoValor(status, t))}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 max-sm:hidden"
        />
      </summary>

      <div className="flex flex-col gap-4 px-3 pt-1 pb-4 sm:pl-[3.5rem]">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo label={t("Mensagem do cliente")}>
            <ExpandableText
              emptyText={t("Mensagem do cliente não registrada.")}
              maxLength={400}
              text={feedback.mensagem_cliente}
            />
          </Campo>
          <Campo label={t("Resposta do agente")}>
            <RespostaMarcada t={t} text={feedback.resposta_agente} />
          </Campo>
          <Campo label={t("Comentário")}>
            <ExpandableText emptyText={t("Sem comentário")} maxLength={400} text={comentario} />
          </Campo>
        </div>
        {detalheExtra}
        {alvo || acoes ? (
          <div className="flex flex-wrap items-center gap-2">
            {alvo ? (
              <Link className="ds-botao ds-botao-secundario ds-botao-p" href={alvo}>
                {t("Ver conversa")}
              </Link>
            ) : null}
            {acoes}
          </div>
        ) : null}
      </div>
    </details>
  );
}

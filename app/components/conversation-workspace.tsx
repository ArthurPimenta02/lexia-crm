import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { ChevronLeft } from "lucide-react";

import { getChannelLabel } from "@/app/components/channel-brand";
import { ConversationFeedbackAction } from "@/app/components/conversation-feedback-action";
import {
  ConversationDaySeparator,
  ConversationMessageBubble,
} from "@/app/components/conversation-message-bubble";
import { ScrollToBottomPanel } from "@/app/components/scroll-to-bottom-panel";
import { AvatarCanal, VazioTela } from "@/app/components/tela";
import {
  getConversationDayKey,
  isSentConversationMessage,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";
import { getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * As peças da tela de Conversas, iguais no painel do cliente e no admin
 * (redesenho de 06/11/2026): a lista com rosto à esquerda, a conversa no
 * meio e, em telas largas, a ficha à direita.
 */

/**
 * A situação de uma conversa, tirada da última mensagem do período. É a
 * mesma regra do número do dashboard: a última foi do cliente, está à
 * espera de resposta.
 */
export type SituacaoConversa = "esperando" | "agente" | "equipe";

const origensDaEquipe = new Set(["humano", "painel_cliente"]);

export function situacaoDaConversa(
  ultima: Pick<DisplayConversationMessage, "direccao" | "origem"> | null | undefined,
): SituacaoConversa | null {
  if (!ultima) return null;
  if (ultima.direccao === "recebida") return "esperando";
  if (!isSentConversationMessage(ultima)) return null;
  return ultima.origem && origensDaEquipe.has(ultima.origem) ? "equipe" : "agente";
}

const selos: Record<SituacaoConversa, { classe: string; texto: string }> = {
  agente: { classe: "ds-selo-neutro", texto: "Agente respondeu" },
  equipe: { classe: "ds-selo-neutro", texto: "Equipe respondeu" },
  esperando: { classe: "ds-selo-alerta ds-selo-ponto", texto: "Esperando" },
};

export function SeloSituacao({ situacao, t }: { situacao: SituacaoConversa; t: FuncaoT }) {
  const selo = selos[situacao];
  return <span className={`ds-selo ${selo.classe}`}>{t(selo.texto)}</span>;
}

/** Na lista, a prévia diz quem escreveu por último quando não foi o cliente. */
export function previaComAutor(situacao: SituacaoConversa | null, previa: string, t: FuncaoT) {
  if (situacao === "agente") return `${t("Agente")}: ${previa}`;
  if (situacao === "equipe") return `${t("Equipe")}: ${previa}`;
  return previa;
}

/**
 * O nome que vai para o rosto (iniciais). As letras "estilizadas" (𝓜𝓪𝓻𝓲𝓪)
 * viram letras normais e o que sobra fora do plano básico sai: o AvatarCanal
 * pega a primeira unidade de cada palavra e partia o emoji ao meio, o que
 * dava erro de hidratação.
 */
export function nomeParaAvatar(nome: string) {
  const limpo = nome.normalize("NFKC").replace(/[\u{10000}-\u{10FFFF}]/gu, "").trim();
  return limpo || "?";
}

/** Hora curta na lista: só a hora se foi hoje, senão o dia. */
export function quandoCurto(
  data: string | null | undefined,
  timeZone: string,
  locale: string,
  semData: string,
) {
  if (!data) return semData;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return semData;
  const dia = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(x);
  if (dia(d) === dia(new Date())) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone }).format(d);
}

/** O contorno das três colunas. No celular a conversa abre por cima da lista. */
export function AreaConversas({
  chat,
  conversaAberta,
  ficha,
  lista,
}: {
  chat: ReactNode;
  conversaAberta: boolean;
  ficha?: ReactNode;
  lista: ReactNode;
}) {
  return (
    <div
      className={`grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)] ${
        ficha
          ? "xl:grid-cols-[300px_minmax(0,1fr)_220px] 2xl:grid-cols-[340px_minmax(0,1fr)_260px]"
          : "xl:grid-cols-[320px_minmax(0,1fr)]"
      }`}
    >
      <aside
        className={`ds-bloco flex min-h-0 flex-col overflow-hidden max-lg:min-h-[60dvh] ${
          conversaAberta ? "max-lg:hidden" : ""
        }`}
      >
        {lista}
      </aside>
      <section
        className={`ds-bloco flex min-h-0 flex-col overflow-hidden ${
          conversaAberta
            ? "max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:h-dvh max-lg:rounded-none max-lg:border-0"
            : "max-lg:hidden"
        }`}
      >
        {chat}
      </section>
      {ficha ? (
        <aside className="ds-bloco hidden min-h-0 flex-col overflow-y-auto xl:flex">{ficha}</aside>
      ) : null}
    </div>
  );
}

/** Topo da lista: a busca e o filtro de situação. */
export function TopoLista({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">{children}</div>;
}

export type ItemConversa = {
  canal: string | null;
  foraDoPeriodo: boolean;
  href: string;
  id: string;
  nome: string;
  previa: string;
  quando: string;
  selecionado: boolean;
  /** Sem nome nem número: o rosto mostra "?" em vez das iniciais de "Sem nome". */
  semNome?: boolean;
  situacao: SituacaoConversa | null;
};

export async function ListaConversas({
  itens,
  vazio,
}: {
  itens: ItemConversa[];
  vazio: ReactNode;
}) {
  const t = await getT();

  if (itens.length === 0) {
    return <div className="flex flex-1 items-center justify-center overflow-y-auto">{vazio}</div>;
  }

  return (
    <div className="tela-lista min-h-0 flex-1 overflow-y-auto p-1.5">
      {itens.map((item) => (
        <Link
          aria-current={item.selecionado ? "true" : undefined}
          className="tela-linha"
          href={item.href}
          key={item.id}
          /*
           * Escolher uma conversa muda o que está ao lado, não a página: sem
           * isto o Next rola tudo para o topo e a lista salta para a primeira
           * conversa.
           */
          scroll={false}
        >
          <AvatarCanal canal={item.canal} nome={item.semNome ? "?" : nomeParaAvatar(item.nome)} tamanho={40} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{item.nome}</p>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.quando}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">{item.previa}</p>
              {item.foraDoPeriodo ? (
                <span className="ds-selo ds-selo-ouro shrink-0">{t("Fora do período")}</span>
              ) : item.situacao === "esperando" ? (
                <SeloSituacao situacao={item.situacao} t={t} />
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Cabeçalho da conversa aberta: voltar (celular), rosto, nome, canal e ações. */
export async function CabecalhoConversa({
  acoes,
  canal,
  nome,
  semNome,
  subtitulo,
  voltarHref,
}: {
  acoes?: ReactNode;
  canal: string | null;
  nome: string;
  semNome?: boolean;
  subtitulo?: string | null;
  voltarHref: string;
}) {
  const t = await getT();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 lg:px-4 lg:py-3">
      <div className="flex min-w-[min(100%,14rem)] flex-1 items-center gap-2.5">
        <Link
          aria-label={t("Voltar para a lista de conversas")}
          className="-ml-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted lg:hidden"
          href={voltarHref}
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </Link>
        <AvatarCanal canal={canal} nome={semNome ? "?" : nomeParaAvatar(nome)} tamanho={40} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] leading-tight font-semibold text-foreground">{nome}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t(getChannelLabel(canal))}
            {subtitulo ? ` · ${subtitulo}` : ""}
          </p>
        </div>
      </div>
      {acoes ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 max-md:w-full">{acoes}</div>
      ) : null}
    </div>
  );
}

/** O histórico com as bolhas, os separadores de dia e o "Reportar". */
export async function HistoricoConversa({
  formatarDia,
  mensagens,
  onSave,
  scrollKey,
  timeZone,
}: {
  formatarDia: (data: string | null) => string;
  mensagens: DisplayConversationMessage[];
  onSave: Parameters<typeof ConversationFeedbackAction>[0]["onSave"];
  scrollKey: string;
  timeZone: string;
}) {
  const t = await getT();

  return (
    <ScrollToBottomPanel
      className="lexia-chat-wallpaper flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-2.5 sm:px-4 sm:py-3"
      scrollKey={scrollKey}
    >
      {mensagens.length > 0 ? (
        mensagens.map((message, i) => {
          const dia = getConversationDayKey(message.criado_em, timeZone);
          const anterior = mensagens[i - 1];
          const diaAnterior = anterior ? getConversationDayKey(anterior.criado_em, timeZone) : null;
          const mostrarReportar =
            isSentConversationMessage(message) && message.partIndex === message.partCount - 1;

          return (
            <Fragment key={message.displayId}>
              {dia !== diaAnterior ? <ConversationDaySeparator label={formatarDia(message.criado_em)} /> : null}
              <ConversationMessageBubble
                feedback={
                  mostrarReportar ? (
                    <ConversationFeedbackAction
                      appearance="dark"
                      messageId={message.sourceMessageId}
                      onSave={onSave}
                    />
                  ) : null
                }
                message={message}
                timeZone={timeZone}
              />
            </Fragment>
          );
        })
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <VazioTela pose="ola" titulo={t("Esta conversa ainda não tem mensagens registradas.")} />
        </div>
      )}
    </ScrollToBottomPanel>
  );
}

/** A ficha da pessoa, em telas largas: só o que a conversa já sabe. */
export async function FichaConversa({
  canal,
  extra,
  linhas,
  situacao,
}: {
  canal: string | null;
  extra?: ReactNode;
  linhas: { rotulo: string; valor: ReactNode }[];
  situacao: SituacaoConversa | null;
}) {
  const t = await getT();

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="ds-sobretitulo">{t("Ficha")}</p>
      {situacao ? (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("Situação")}</span>
          <span className="justify-self-start">
            <SeloSituacao situacao={situacao} t={t} />
          </span>
        </div>
      ) : null}
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t("Canal")}</span>
        <span className="text-sm font-medium text-foreground">{t(getChannelLabel(canal))}</span>
      </div>
      {linhas.map((linha) => (
        <div className="grid min-w-0 gap-1" key={linha.rotulo}>
          <span className="text-xs text-muted-foreground">{linha.rotulo}</span>
          <span className="min-w-0 break-words text-sm font-medium text-foreground tabular-nums">{linha.valor}</span>
        </div>
      ))}
      {extra ? <div className="border-t border-border pt-4">{extra}</div> : null}
    </div>
  );
}

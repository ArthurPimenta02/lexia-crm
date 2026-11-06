import type { ReactNode } from "react";

import { ChevronDown, FlaskConical } from "lucide-react";

import { nomeParaAvatar } from "@/app/components/conversation-workspace";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica } from "@/app/components/painel-ui";
import { AvatarCanal, VazioTela } from "@/app/components/tela";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";

/**
 * As peças da tela de Handoffs (redesenho de 06/11/2026): cada pedido é uma
 * linha com o rosto da pessoa e o selo da situação; o resumo e as ações
 * abrem ao tocar na linha.
 */

export type HandoffStatusValue =
  "pendente" | "em_atendimento" | "resolvido" | "perdido";

export type HandoffStatusAction = {
  action: () => Promise<void>;
  label: string;
  status: HandoffStatusValue;
};

/*
 * Os rótulos ficam aqui em pt-BR e são traduzidos onde se desenham, com
 * `t(label)`. Cada um tem a sua linha no dicionário `textos/conversas.ts`.
 */
const statusMeta: Record<string, { chip: string; label: string }> = {
  em_atendimento: { chip: "ds-selo-alerta", label: "Em atendimento" },
  pendente: { chip: "ds-selo-perigo ds-selo-ponto", label: "Pendente" },
  perdido: { chip: "ds-selo-neutro", label: "Perdido" },
  resolvido: { chip: "ds-selo-verde", label: "Resolvido" },
};

const priorityMeta: Record<string, { chip: string; label: string }> = {
  alta: { chip: "ds-selo-perigo", label: "Prioridade alta" },
  urgente: { chip: "ds-selo-perigo ds-selo-ponto", label: "Urgente" },
};

/** Um handoff está aberto enquanto ninguém o resolveu nem o deu por perdido. */
export function handoffAberto(status: string | null | undefined) {
  return status !== "resolvido" && status !== "perdido";
}

/** Data e hora curtas no idioma de quem vê, no fuso do cliente. */
function formatarDataHora(
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

function Campo({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
        {children}
      </div>
    </div>
  );
}

/** O título de uma secção de handoffs, com a contagem e a explicação no `?`. */
export function HandoffSectionHeader({
  count,
  dica,
  sufixo,
  title,
}: {
  count?: number;
  dica?: string;
  /** Qualifica a secção sem pesar como título — o slug do cliente, por ex. */
  sufixo?: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="ds-titulo-3 min-w-0 text-foreground">
        {title}
        {sufixo ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {sufixo}
          </span>
        ) : null}
      </h2>
      {typeof count === "number" ? (
        <span className="ds-selo ds-selo-neutro tabular-nums">{count}</span>
      ) : null}
      {dica ? <Dica texto={dica} /> : null}
    </div>
  );
}

/** Bloco vazio com o beija-flor. */
export function HandoffEmptyState({
  children,
  texto,
}: {
  children: ReactNode;
  texto?: ReactNode;
}) {
  return (
    <div className="ds-bloco">
      <VazioTela pose="feliz" texto={texto} titulo={children} />
    </div>
  );
}

export const handoffCardClass = "ds-bloco flex min-w-0 flex-col gap-3 p-4";

export const handoffGridClass = "grid gap-3 md:grid-cols-2 2xl:grid-cols-3";

/** A lista agrupada onde vivem as linhas dos pedidos. */
export const handoffListClass = "ds-bloco tela-lista p-1.5";

const resumoLinha =
  "tela-linha cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export async function HandoffCard({
  actions,
  clientLabel,
  criadoEm,
  motivo,
  nome,
  origem,
  prioridade,
  resumo,
  status,
  telefone,
  timeZone,
}: {
  actions: HandoffStatusAction[];
  clientLabel?: string;
  criadoEm: string | null;
  motivo: string | null;
  nome: string | null;
  origem?: string | null;
  prioridade: string | null;
  resumo: string | null;
  status: string | null;
  telefone: string | null;
  /** O fuso do cliente a quem o handoff pertence. */
  timeZone: string;
}) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const knownStatus = statusMeta[status ?? "pendente"];
  const statusInfo = knownStatus
    ? { chip: knownStatus.chip, label: t(knownStatus.label) }
    : {
        chip: "ds-selo-neutro",
        label: status?.replaceAll("_", " ") ?? t("Sem status"),
      };
  const priorityInfo = priorityMeta[prioridade ?? ""] ?? null;
  const titulo = nome || telefone || t("Sem nome");

  return (
    <details className="group">
      <summary className={resumoLinha}>
        <AvatarCanal nome={nome || telefone ? nomeParaAvatar(titulo) : "?"} tamanho={40} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{titulo}</p>
            <span className={`ds-selo ${statusInfo.chip}`}>{statusInfo.label}</span>
            {priorityInfo ? (
              <span className={`ds-selo ${priorityInfo.chip}`}>{t(priorityInfo.label)}</span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted-foreground sm:line-clamp-1">
            {motivo?.trim() || t("Sem motivo")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatarDataHora(criadoEm, timeZone, locale, t("Sem data"))}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </div>
      </summary>

      <div className="flex flex-col gap-4 px-3 pt-1 pb-4 sm:pl-[3.75rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label={t("Motivo")}>{motivo?.trim() || t("Sem motivo")}</Campo>
          <Campo label={t("Resumo")}>{resumo?.trim() || t("Sem resumo")}</Campo>
          <Campo label={t("Contato")}>
            {telefone ?? t("Sem telefone")}
            {clientLabel ? ` · ${clientLabel}` : ""}
            {origem ? ` · ${origem.replaceAll("_", " ")}` : ""}
          </Campo>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((item) => {
            const isCurrent = status === item.status;

            return (
              <form action={item.action} key={item.status}>
                <FormSubmitButton
                  aria-pressed={isCurrent}
                  className={`ds-botao ds-botao-p disabled:cursor-default ${
                    isCurrent ? "ds-botao-primario" : "ds-botao-secundario"
                  }`}
                  disabled={isCurrent}
                  pendingLabel={t("Salvando...")}
                >
                  {t(item.label)}
                </FormSubmitButton>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export async function SimulatedHandoffCard({
  clientLabel,
  criadoEm,
  deleteButton,
  mensagem,
  resposta,
  timeZone,
}: {
  clientLabel?: string;
  criadoEm: string | null;
  deleteButton: ReactNode;
  mensagem: string | null;
  resposta: string | null;
  /** O fuso do cliente a quem o handoff pertence. */
  timeZone: string;
}) {
  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];

  return (
    <details className="group">
      <summary className={resumoLinha}>
        <span className="ds-chip-icone" style={{ ["--chip" as string]: "var(--ds-info)" }}>
          <FlaskConical aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {mensagem?.trim() || t("Sem mensagem")}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("Simulado")}
            {clientLabel ? ` · ${clientLabel}` : ""}
            {" · "}
            {formatarDataHora(criadoEm, timeZone, locale, t("Sem data"))}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 px-3 pt-1 pb-4 sm:pl-[3.75rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label={t("Mensagem do cliente")}>{mensagem?.trim() || t("Sem mensagem")}</Campo>
          <Campo label={t("Resposta do agente")}>{resposta?.trim() || t("Sem resposta")}</Campo>
        </div>
        <div>{deleteButton}</div>
      </div>
    </details>
  );
}

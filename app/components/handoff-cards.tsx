import type { ReactNode } from "react";

import { ExpandableText } from "@/app/components/expandable-text";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica } from "@/app/components/painel-ui";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";

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
  pendente: { chip: "ds-selo-perigo", label: "Pendente" },
  perdido: { chip: "ds-selo-neutro", label: "Perdido" },
  resolvido: { chip: "ds-selo-verde", label: "Resolvido" },
};

const priorityMeta: Record<string, { chip: string; label: string }> = {
  alta: { chip: "ds-selo-perigo", label: "Prioridade alta" },
  baixa: { chip: "ds-selo-neutro", label: "Prioridade baixa" },
  normal: { chip: "ds-selo-neutro", label: "Prioridade normal" },
  urgente: { chip: "ds-selo-perigo ds-selo-ponto", label: "Urgente" },
};

function Chip({
  className,
  children,
}: {
  children: ReactNode;
  className: string;
}) {
  return <span className={`ds-selo ${className}`}>{children}</span>;
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

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-muted-foreground/60">
        {label}
      </p>
      <div className="mt-1 text-sm leading-6 break-words text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * O título de uma secção de handoffs.
 *
 * A explicação de cada secção era um parágrafo por baixo do título — três
 * linhas em telemóvel antes do primeiro cartão. Agora vive no `?`: quem já
 * sabe o que a secção é vê só o título e a contagem.
 */
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
      <h2 className="min-w-0 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
        {title}
        {sufixo ? (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {sufixo}
          </span>
        ) : null}
      </h2>
      {typeof count === "number" ? (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      {dica ? <Dica texto={dica} /> : null}
    </div>
  );
}

export function HandoffEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export const handoffCardClass =
  "flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5";

export const handoffGridClass = "grid gap-3 md:grid-cols-2 2xl:grid-cols-3";

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
  const knownStatus = statusMeta[status ?? ""];
  const statusInfo = knownStatus
    ? { chip: knownStatus.chip, label: t(knownStatus.label) }
    : {
        chip: "ds-selo-neutro",
        label: status?.replaceAll("_", " ") ?? t("Sem status"),
      };
  const priorityInfo = priorityMeta[prioridade ?? ""] ?? null;

  return (
    <article className={handoffCardClass}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {nome ?? t("Sem nome")}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {telefone ?? t("Sem telefone")}
            {clientLabel ? ` · ${clientLabel}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {formatarDataHora(criadoEm, timeZone, locale, t("Sem data"))}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Chip className={statusInfo.chip}>{statusInfo.label}</Chip>
        {priorityInfo ? (
          <Chip className={priorityInfo.chip}>{t(priorityInfo.label)}</Chip>
        ) : null}
        {origem ? (
          <Chip className="ds-selo-neutro">
            {origem.replaceAll("_", " ")}
          </Chip>
        ) : null}
      </div>

      <Field label={t("Motivo")}>
        <ExpandableText emptyText={t("Sem motivo")} maxLength={140} text={motivo} />
      </Field>
      <Field label={t("Resumo")}>
        <ExpandableText emptyText={t("Sem resumo")} maxLength={160} text={resumo} />
      </Field>

      <div className="mt-auto grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-t border-border pt-4">
        {actions.map((item) => {
          const isCurrent = status === item.status;

          return (
            <form action={item.action} key={item.status}>
              <FormSubmitButton
                aria-pressed={isCurrent}
                className={`h-10 w-full rounded-full border px-1 text-xs font-semibold transition disabled:cursor-default ${
                  isCurrent
                    ? "border-foreground bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-foreground"
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
    </article>
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
    <article className={handoffCardClass}>
      <header className="flex items-center justify-between gap-3">
        <Chip className="ds-selo-neutro">
          {t("Simulado")}
          {clientLabel ? ` · ${clientLabel}` : ""}
        </Chip>
        <p className="shrink-0 text-xs text-muted-foreground">
          {formatarDataHora(criadoEm, timeZone, locale, t("Sem data"))}
        </p>
      </header>
      <Field label={t("Mensagem do cliente")}>
        <ExpandableText
          emptyText={t("Sem mensagem")}
          maxLength={130}
          text={mensagem}
        />
      </Field>
      <Field label={t("Resposta do agente")}>
        <ExpandableText
          emptyText={t("Sem resposta")}
          maxLength={150}
          text={resposta}
        />
      </Field>
      <div className="mt-auto border-t border-border pt-4">{deleteButton}</div>
    </article>
  );
}

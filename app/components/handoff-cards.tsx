import type { ReactNode } from "react";

import { ExpandableText } from "@/app/components/expandable-text";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { Dica } from "@/app/components/painel-ui";
import { formatDateInTimezone } from "@/lib/clientes/timezone";

export type HandoffStatusValue =
  "pendente" | "em_atendimento" | "resolvido" | "perdido";

export type HandoffStatusAction = {
  action: () => Promise<void>;
  label: string;
  status: HandoffStatusValue;
};

const statusMeta: Record<string, { chip: string; label: string }> = {
  em_atendimento: {
    chip: "border-amber-200 bg-amber-50 text-amber-900",
    label: "Em atendimento",
  },
  pendente: {
    chip: "border-red-200 bg-red-50 text-red-800",
    label: "Pendente",
  },
  perdido: {
    chip: "border-border bg-muted text-muted-foreground",
    label: "Perdido",
  },
  resolvido: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900",
    label: "Resolvido",
  },
};

const priorityMeta: Record<string, { chip: string; label: string }> = {
  alta: {
    chip: "border-red-200 bg-surface text-red-700",
    label: "Prioridade alta",
  },
  baixa: {
    chip: "border-border bg-surface text-muted-foreground",
    label: "Prioridade baixa",
  },
  normal: {
    chip: "border-border bg-surface text-muted-foreground",
    label: "Prioridade normal",
  },
  urgente: { chip: "border-red-300 bg-red-600 text-white", label: "Urgente" },
};

function Chip({
  className,
  children,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
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
  "flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-5";

export const handoffGridClass = "grid gap-3 md:grid-cols-2 2xl:grid-cols-3";

export function HandoffCard({
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
  const statusInfo = statusMeta[status ?? ""] ?? {
    chip: "border-border bg-surface-muted text-muted-foreground",
    label: status?.replaceAll("_", " ") ?? "Sem estado",
  };
  const priorityInfo = priorityMeta[prioridade ?? ""] ?? null;

  return (
    <article className={handoffCardClass}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {nome ?? "Sem nome"}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {telefone ?? "Sem telefone"}
            {clientLabel ? ` · ${clientLabel}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {formatDateInTimezone(criadoEm, timeZone)}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Chip className={statusInfo.chip}>{statusInfo.label}</Chip>
        {priorityInfo ? (
          <Chip className={priorityInfo.chip}>{priorityInfo.label}</Chip>
        ) : null}
        {origem ? (
          <Chip className="border-border bg-surface text-muted-foreground">
            {origem.replaceAll("_", " ")}
          </Chip>
        ) : null}
      </div>

      <Field label="Motivo">
        <ExpandableText emptyText="Sem motivo" maxLength={140} text={motivo} />
      </Field>
      <Field label="Resumo">
        <ExpandableText emptyText="Sem resumo" maxLength={160} text={resumo} />
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
                pendingLabel="Salvando..."
              >
                {item.label}
              </FormSubmitButton>
            </form>
          );
        })}
      </div>
    </article>
  );
}

export function SimulatedHandoffCard({
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
  return (
    <article className={handoffCardClass}>
      <header className="flex items-center justify-between gap-3">
        <Chip className="border-border bg-surface-muted text-muted-foreground">
          Simulado{clientLabel ? ` · ${clientLabel}` : ""}
        </Chip>
        <p className="shrink-0 text-xs text-muted-foreground">
          {formatDateInTimezone(criadoEm, timeZone)}
        </p>
      </header>
      <Field label="Mensagem do cliente">
        <ExpandableText
          emptyText="Sem mensagem"
          maxLength={130}
          text={mensagem}
        />
      </Field>
      <Field label="Resposta do agente">
        <ExpandableText
          emptyText="Sem resposta"
          maxLength={150}
          text={resposta}
        />
      </Field>
      <div className="mt-auto border-t border-border pt-4">{deleteButton}</div>
    </article>
  );
}

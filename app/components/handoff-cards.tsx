import type { ReactNode } from "react";

import { ExpandableText } from "@/app/components/expandable-text";
import { FormSubmitButton } from "@/app/components/form-submit-button";

export type HandoffStatusValue =
  | "pendente"
  | "em_atendimento"
  | "resolvido"
  | "perdido";

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
    chip: "border-zinc-200 bg-zinc-100 text-zinc-600",
    label: "Perdido",
  },
  resolvido: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900",
    label: "Resolvido",
  },
};

const priorityMeta: Record<string, { chip: string; label: string }> = {
  alta: { chip: "border-red-200 bg-white text-red-700", label: "Prioridade alta" },
  baixa: {
    chip: "border-zinc-200 bg-white text-zinc-500",
    label: "Prioridade baixa",
  },
  normal: {
    chip: "border-zinc-200 bg-white text-zinc-600",
    label: "Prioridade normal",
  },
  urgente: { chip: "border-red-300 bg-red-600 text-white", label: "Urgente" },
};

export function formatHandoffDate(date: string | null) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

function Chip({ className, children }: { children: ReactNode; className: string }) {
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
      <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
        {label}
      </p>
      <div className="mt-1 text-sm leading-6 break-words text-zinc-700">
        {children}
      </div>
    </div>
  );
}

export function HandoffSectionHeader({
  count,
  description,
  title,
}: {
  count?: number;
  description: string;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
          {title}
        </h2>
        {typeof count === "number" ? (
          <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-xs font-semibold text-white">
            {count}
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
        {description}
      </p>
    </div>
  );
}

export function HandoffEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-4 py-8 text-center text-sm text-zinc-600">
      {children}
    </div>
  );
}

export const handoffCardClass =
  "flex min-w-0 flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:p-5";

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
}) {
  const statusInfo = statusMeta[status ?? ""] ?? {
    chip: "border-zinc-200 bg-zinc-50 text-zinc-600",
    label: status?.replaceAll("_", " ") ?? "Sem estado",
  };
  const priorityInfo = priorityMeta[prioridade ?? ""] ?? null;

  return (
    <article className={handoffCardClass}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-zinc-950">
            {nome ?? "Sem nome"}
          </h3>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {telefone ?? "Sem telefone"}
            {clientLabel ? ` · ${clientLabel}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-xs text-zinc-500">
          {formatHandoffDate(criadoEm)}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Chip className={statusInfo.chip}>{statusInfo.label}</Chip>
        {priorityInfo ? (
          <Chip className={priorityInfo.chip}>{priorityInfo.label}</Chip>
        ) : null}
        {origem ? (
          <Chip className="border-zinc-200 bg-white text-zinc-500">
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

      <div className="mt-auto grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-t border-zinc-100 pt-4">
        {actions.map((item) => {
          const isCurrent = status === item.status;

          return (
            <form action={item.action} key={item.status}>
              <FormSubmitButton
                aria-pressed={isCurrent}
                className={`h-10 w-full rounded-full border px-1 text-xs font-semibold transition disabled:cursor-default ${
                  isCurrent
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950"
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
}: {
  clientLabel?: string;
  criadoEm: string | null;
  deleteButton: ReactNode;
  mensagem: string | null;
  resposta: string | null;
}) {
  return (
    <article className={handoffCardClass}>
      <header className="flex items-center justify-between gap-3">
        <Chip className="border-zinc-200 bg-zinc-50 text-zinc-600">
          Simulado{clientLabel ? ` · ${clientLabel}` : ""}
        </Chip>
        <p className="shrink-0 text-xs text-zinc-500">
          {formatHandoffDate(criadoEm)}
        </p>
      </header>
      <Field label="Mensagem do cliente">
        <ExpandableText emptyText="Sem mensagem" maxLength={130} text={mensagem} />
      </Field>
      <Field label="Resposta do agente">
        <ExpandableText emptyText="Sem resposta" maxLength={150} text={resposta} />
      </Field>
      <div className="mt-auto border-t border-zinc-100 pt-4">{deleteButton}</div>
    </article>
  );
}

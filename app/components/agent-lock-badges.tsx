import type { AgentLock } from "@/lib/redis/agent-locks";

const lockLabels: Record<AgentLock["kind"], string> = {
  pausa_eterna: "Pausado após agendamento",
  pausa_manual: "Pausado manualmente",
  status: "Atendimento humano em curso",
};

const lockStyles: Record<AgentLock["kind"], { chip: string; dot: string }> = {
  pausa_eterna: {
    chip: "border-violet-200 bg-violet-50 text-violet-900",
    dot: "bg-violet-500",
  },
  pausa_manual: {
    chip: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-500",
  },
  status: {
    chip: "border-sky-200 bg-sky-50 text-sky-900",
    dot: "bg-sky-500",
  },
};

export function formatLockRemaining(ttlSeconds: number | null) {
  if (ttlSeconds === null) {
    return "sem prazo";
  }

  if (ttlSeconds < 60) {
    return "volta em menos de 1 min";
  }

  const minutes = Math.round(ttlSeconds / 60);

  if (minutes < 60) {
    return `volta em ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `volta em ${hours} h ${remainingMinutes} min`
    : `volta em ${hours} h`;
}

export function AgentActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Agente ativo
    </span>
  );
}

export function AgentLockBadges({
  align = "start",
  locks,
}: {
  align?: "end" | "start";
  locks: AgentLock[];
}) {
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${align === "end" ? "md:justify-end" : ""}`}
    >
      {locks.map((lock) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${lockStyles[lock.kind].chip}`}
          key={lock.kind}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${lockStyles[lock.kind].dot}`}
          />
          <span>
            {lockLabels[lock.kind]}
            <span className="font-normal opacity-75">
              {" · "}
              {formatLockRemaining(lock.ttlSeconds)}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

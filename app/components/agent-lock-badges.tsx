import type { AgentLock, AgentLockReason } from "@/lib/redis/agent-locks";

/*
 * A trava `status` tem duas origens e uma só chave no Redis: o dono escreveu
 * na conversa, ou o agente entregou a conversa à equipa. Dizer "atendimento
 * humano em curso" nos dois casos era dar a razão errada metade das vezes —
 * incluindo em conversas em que ninguém da equipa tinha aberto a boca.
 *
 * Quando o prazo não chega para separar os dois (ver `classifyStatusLock`), a
 * etiqueta diz só o que é certo: o agente está parado e volta a tal hora.
 */
const statusLabels: Record<AgentLockReason, string> = {
  handoff: "Handoff feito pelo agente",
  indeterminado: "Agente pausado pela equipa",
  intervencao: "Atendimento humano em curso",
};

function lockLabel(lock: AgentLock) {
  if (lock.kind === "pausa_eterna") {
    return "Pausado após agendamento";
  }

  if (lock.kind === "pausa_manual") {
    return "Pausado manualmente";
  }

  return statusLabels[lock.reason ?? "indeterminado"];
}

/*
 * Três travas, três razões, uma só aparência.
 *
 * Isto era violeta, âmbar e azul — três famílias de cor para dizer a mesma
 * coisa: o agente não vai responder. O porquê e o até quando já estão
 * escritos na etiqueta, em palavras, que é onde se lêem. A cor só ficava
 * a competir com o resto do ecrã.
 *
 * O ponto é o único sinal que sobra, e carrega a única distinção que o dono
 * precisa de apanhar de relance: uma pausa sem prazo não se desfaz sozinha,
 * fica à espera de alguém. Essa leva o tom de aviso; as outras expiram e por
 * isso são neutras.
 */
const lockDots: Record<AgentLock["kind"], string> = {
  pausa_eterna: "bg-warning",
  pausa_manual: "bg-muted-foreground",
  status: "bg-muted-foreground",
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
      <span className="bg-positive h-1.5 w-1.5 rounded-full" />
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
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
          key={lock.kind}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${lockDots[lock.kind]}`}
          />
          <span>
            {lockLabel(lock)}
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

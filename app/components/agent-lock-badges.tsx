import { getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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
  indeterminado: "Agente pausado pela equipe",
  intervencao: "Atendimento humano em curso",
};

function lockLabel(lock: AgentLock, t: FuncaoT) {
  if (lock.kind === "pausa_eterna") {
    return t("Pausado após agendamento");
  }

  if (lock.kind === "pausa_manual") {
    return t("Pausado manualmente");
  }

  return t(statusLabels[lock.reason ?? "indeterminado"]);
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

export function formatLockRemaining(ttlSeconds: number | null, t: FuncaoT) {
  if (ttlSeconds === null) {
    return t("sem prazo");
  }

  if (ttlSeconds < 60) {
    return t("volta em menos de 1 min");
  }

  const minutes = Math.round(ttlSeconds / 60);

  if (minutes < 60) {
    return t("volta em {minutos} min", { minutos: minutes });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? t("volta em {horas} h {minutos} min", {
        horas: hours,
        minutos: remainingMinutes,
      })
    : t("volta em {horas} h", { horas: hours });
}

export async function AgentActiveBadge() {
  const t = await getT();

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
      <span className="bg-positive h-1.5 w-1.5 rounded-full" />
      {t("Agente ativo")}
    </span>
  );
}

export async function AgentLockBadges({
  align = "start",
  locks,
}: {
  align?: "end" | "start";
  locks: AgentLock[];
}) {
  const t = await getT();

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
            {lockLabel(lock, t)}
            <span className="font-normal opacity-75">
              {" · "}
              {formatLockRemaining(lock.ttlSeconds, t)}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

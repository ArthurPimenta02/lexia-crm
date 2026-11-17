import { Check } from "lucide-react";

/** As três etapas do onboarding, numa linha: feitas, a atual e as que faltam. */
export function PassosOnboarding({ atual, itens }: { atual: number; itens: { nota: string; titulo: string }[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {itens.map((item, i) => {
        const n = i + 1;
        const feita = n < atual;
        const ativa = n === atual;
        return (
          <li
            aria-current={ativa ? "step" : undefined}
            className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 sm:gap-3 sm:px-3.5 sm:py-3 ${ativa ? "border-[var(--ds-acao)] bg-[var(--ds-acao-fundo)]" : "border-[var(--ds-linha-forte)]"} ${!ativa && !feita ? "opacity-60" : ""}`}
            key={item.titulo}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${feita || ativa ? "bg-[var(--ds-acao)] text-[var(--ds-acao-texto)]" : "border border-[var(--ds-linha-forte)] text-muted-foreground"}`}
            >
              {feita ? <Check aria-hidden="true" size={13} strokeWidth={3} /> : n}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.8125rem] font-medium text-foreground sm:text-sm">{item.titulo}</span>
              <span className="hidden truncate text-[0.8125rem] text-muted-foreground sm:block">{item.nota}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

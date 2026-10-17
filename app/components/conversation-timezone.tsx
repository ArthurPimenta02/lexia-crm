import Link from "next/link";

import { timezoneOptions } from "@/lib/clientes/timezone";

export function TimezoneSwitcher({
  activeValue,
  buildHref,
  variant = "light",
}: {
  activeValue: string;
  buildHref: (timezone: string) => string;
  variant?: "light" | "dark";
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p
        className={`shrink-0 text-[11px] font-medium ${
          variant === "dark" ? "text-background" : "text-muted-foreground"
        }`}
      >
        Fuso horário
      </p>
      <div className="flex min-w-0 gap-1.5 overflow-x-auto">
        {timezoneOptions.map((timezone) => {
          const isActive = activeValue === timezone.value;

          return (
            <Link
              className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                isActive
                  ? variant === "dark"
                    ? "border-white bg-surface text-foreground"
                    : "border-foreground bg-primary text-primary-foreground"
                  : variant === "dark"
                    ? "border-white/10 bg-white/[0.04] text-background hover:border-white/20 hover:bg-white/[0.08]"
                    : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-muted"
              }`}
              href={buildHref(timezone.value)}
              key={timezone.value}
            >
              {timezone.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

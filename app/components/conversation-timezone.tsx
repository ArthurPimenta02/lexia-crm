import Link from "next/link";

export const timezoneOptions = [
  { label: "Brasil", value: "brasil", timeZone: "America/Sao_Paulo" },
  { label: "Lisboa", value: "lisboa", timeZone: "Europe/Lisbon" },
  { label: "New York", value: "new_york", timeZone: "America/New_York" },
] as const;

export type TimezoneValue = (typeof timezoneOptions)[number]["value"];

export function getSelectedTimezone(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  return (
    timezoneOptions.find((option) => option.value === raw) ?? timezoneOptions[0]
  );
}

export function formatDateInTimezone(
  date: string | null,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "short",
    timeStyle: "short",
  },
) {
  if (!date) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone,
  }).format(new Date(date));
}

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
        className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] ${
          variant === "dark" ? "text-zinc-200" : "text-zinc-500"
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
                    ? "border-white bg-white text-zinc-950"
                    : "border-zinc-950 bg-zinc-950 text-white"
                  : variant === "dark"
                    ? "border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.08]"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
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

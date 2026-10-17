import Image from "next/image";

type LexiaBrandProps = {
  compact?: boolean;
  showText?: boolean;
  tone?: "dark" | "light";
};

export function LexiaBrand({
  compact = false,
  showText = true,
  tone = "dark",
}: LexiaBrandProps) {
  const isDark = tone === "dark";

  return (
    <div className="flex items-center gap-3">
      <Image
        alt="Lexia AI"
        className={
          compact ? "h-11 w-11 object-contain" : "h-16 w-16 object-contain"
        }
        height={compact ? 44 : 64}
        priority
        src={
          isDark ? "/lexia/lexia-symbol-light.png" : "/lexia/lexia-symbol-dark.png"
        }
        width={compact ? 44 : 64}
      />
      {showText ? (
        <div className="min-w-0">
          <p
            className={`text-lg font-semibold tracking-tight ${
              isDark ? "text-background" : "text-foreground"
            }`}
          >
            Lexia AI
          </p>
          <p
            className={`mt-0.5 text-[11px] font-medium tracking-[0.22em] uppercase ${
              isDark ? "text-muted-foreground/60" : "text-muted-foreground"
            }`}
          >
            IA que entende
          </p>
        </div>
      ) : null}
    </div>
  );
}

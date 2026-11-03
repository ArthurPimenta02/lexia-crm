import Image from "next/image";

import { Tr } from "@/app/components/idioma";

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
        className={`${compact ? "h-11 w-11" : "h-16 w-16"} object-contain ${
          isDark ? "" : "lexia-simbolo-tema"
        }`}
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
              isDark ? "text-white" : "text-foreground"
            }`}
          >
            Lexia AI
          </p>
          <p
            className={`mt-0.5 text-[10px] font-medium tracking-[0.16em] whitespace-nowrap uppercase ${
              isDark ? "text-white/40" : "text-muted-foreground"
            }`}
          >
            <Tr>IA que entende</Tr>
          </p>
        </div>
      ) : null}
    </div>
  );
}

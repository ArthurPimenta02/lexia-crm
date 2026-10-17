import Link from "next/link";

type ChannelVariant = "light" | "dark";

type ChannelMeta = {
  label: string;
  shortLabel: string;
  iconLabel: string;
  icon: string;
};

/*
 * A cor da marca vive só no círculo do canal.
 *
 * Antes a etiqueta inteira era tingida — fundo verde, borda verde, texto
 * verde — à volta de um círculo que já era verde. A mesma informação três
 * vezes, e numa lista de cem conversas em que quase todas são WhatsApp, o
 * ecrã ficava verde e o que distingue uma linha da outra deixava de saltar.
 *
 * O estado seleccionado também era da cor do canal, com brilho e tudo,
 * enquanto todos os outros botões escolhidos no produto ficam pretos. Agora
 * segue o preto da Lexia, como os restantes.
 */
const channelMeta: Record<string, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    iconLabel: "W",
    icon: "bg-[#25D366] text-white",
  },
  messenger: {
    label: "Messenger",
    shortLabel: "Messenger",
    iconLabel: "M",
    icon: "bg-gradient-to-br from-[#00B2FF] to-[#A033FF] text-white",
  },
  instagram: {
    label: "Instagram",
    shortLabel: "Instagram",
    iconLabel: "I",
    icon: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#515BD4] text-white",
  },
};

const defaultMeta: ChannelMeta = {
  label: "Todas",
  shortLabel: "Todas",
  iconLabel: "•",
  icon: "bg-primary text-primary-foreground",
};

export function getChannelLabel(channel: string | null | undefined) {
  if (!channel) {
    return "Todas";
  }

  return channelMeta[channel]?.label ?? channel.replaceAll("_", " ");
}

function getChannelMeta(channel: string | null | undefined) {
  return channel ? (channelMeta[channel] ?? defaultMeta) : defaultMeta;
}

export function ChannelIcon({
  channel,
  size = "md",
}: {
  channel: string | null | undefined;
  size?: "sm" | "md";
}) {
  const meta = getChannelMeta(channel);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${
        size === "sm" ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-xs"
      } ${meta.icon}`}
    >
      {meta.iconLabel}
    </span>
  );
}

export function ChannelBadge({
  channel,
  variant = "light",
}: {
  channel: string | null | undefined;
  variant?: ChannelVariant;
}) {
  const meta = getChannelMeta(channel);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        variant === "dark"
          ? "border-white/10 bg-white/[0.06] text-white"
          : "border-border bg-muted text-foreground"
      }`}
    >
      <ChannelIcon channel={channel} size="sm" />
      {meta.shortLabel}
    </span>
  );
}

export function ChannelFilterLink({
  active,
  channel,
  href,
  variant = "light",
}: {
  active: boolean;
  channel: string;
  href: string;
  variant?: ChannelVariant;
}) {
  const meta = getChannelMeta(channel);
  const inactive =
    variant === "dark"
      ? "border-white/10 bg-white/[0.04] text-background hover:border-white/20 hover:bg-white/[0.08]"
      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-muted";

  return (
    <Link
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "border-foreground bg-primary text-primary-foreground shadow-sm"
          : inactive
      }`}
      href={href}
    >
      <ChannelIcon channel={channel} size="sm" />
      {meta.label}
    </Link>
  );
}

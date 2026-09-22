import Link from "next/link";

type ChannelVariant = "light" | "dark";

type ChannelMeta = {
  label: string;
  shortLabel: string;
  iconLabel: string;
  pill: string;
  icon: string;
  active: string;
};

const channelMeta: Record<string, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    iconLabel: "W",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: "bg-[#25D366] text-white",
    active: "border-[#25D366] bg-[#25D366] text-white shadow-[0_12px_28px_rgba(37,211,102,0.24)]",
  },
  messenger: {
    label: "Messenger",
    shortLabel: "Messenger",
    iconLabel: "M",
    pill: "border-sky-200 bg-sky-50 text-sky-800",
    icon: "bg-gradient-to-br from-[#00B2FF] to-[#A033FF] text-white",
    active: "border-[#00B2FF] bg-gradient-to-r from-[#00B2FF] to-[#A033FF] text-white shadow-[0_12px_28px_rgba(0,178,255,0.22)]",
  },
  instagram: {
    label: "Instagram",
    shortLabel: "Instagram",
    iconLabel: "I",
    pill: "border-pink-200 bg-pink-50 text-pink-800",
    icon: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#515BD4] text-white",
    active: "border-[#DD2A7B] bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#515BD4] text-white shadow-[0_12px_28px_rgba(221,42,123,0.24)]",
  },
};

const defaultMeta: ChannelMeta = {
  label: "Todas",
  shortLabel: "Todas",
  iconLabel: "•",
  pill: "border-zinc-200 bg-zinc-100 text-zinc-700",
  icon: "bg-zinc-900 text-white",
  active: "border-zinc-950 bg-zinc-950 text-white shadow-sm",
};

export function getChannelLabel(channel: string | null | undefined) {
  if (!channel) {
    return "Todas";
  }

  return channelMeta[channel]?.label ?? channel.replaceAll("_", " ");
}

function getChannelMeta(channel: string | null | undefined) {
  return channel ? channelMeta[channel] ?? defaultMeta : defaultMeta;
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
          : meta.pill
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
      ? "border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/20 hover:bg-white/[0.08]"
      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50";

  return (
    <Link
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? meta.active : inactive
      }`}
      href={href}
    >
      <ChannelIcon channel={channel} size="sm" />
      {meta.label}
    </Link>
  );
}

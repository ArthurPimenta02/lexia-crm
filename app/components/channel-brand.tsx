import Link from "next/link";
import type { ReactElement } from "react";

import {
  InstagramGlyph,
  MessengerGlyph,
  TodosGlyph,
  WhatsAppGlyph,
} from "@/app/components/channel-glyphs";

type ChannelVariant = "light" | "dark";

type ChannelMeta = {
  label: string;
  shortLabel: string;
  /** O desenho oficial da marca. Pinta-se a branco sobre a cor do canal. */
  Glyph: (props: { className?: string }) => ReactElement;
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
 *
 * As cores são as que cada marca publica, e os degradés seguem a construção
 * dos ícones reais: o do Instagram irradia do canto inferior esquerdo (amarelo
 * → vermelho → magenta → azul), e não em diagonal recta como estava, que dava
 * um roxo que não existe no ícone deles. São cores de terceiros, por isso ficam
 * fixas aqui de propósito — não acompanham a `cor_principal` do cliente.
 */
const channelMeta: Record<string, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    shortLabel: "WhatsApp",
    Glyph: WhatsAppGlyph,
    icon: "bg-[#25D366] text-white",
  },
  messenger: {
    label: "Messenger",
    shortLabel: "Messenger",
    Glyph: MessengerGlyph,
    icon: "bg-[linear-gradient(135deg,#00B2FF_0%,#006AFF_40%,#A033FF_70%,#FF5280_90%,#FF7061_100%)] text-white",
  },
  instagram: {
    label: "Instagram",
    shortLabel: "Instagram",
    Glyph: InstagramGlyph,
    icon: "bg-[radial-gradient(circle_at_30%_107%,#FDF497_0%,#FDF497_5%,#FD5949_45%,#D6249F_60%,#285AEB_90%)] text-white",
  },
};

const defaultMeta: ChannelMeta = {
  label: "Todas",
  shortLabel: "Todas",
  Glyph: TodosGlyph,
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
  const Glyph = meta.Glyph;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${
        size === "sm" ? "h-5 w-5" : "h-8 w-8"
      } ${meta.icon}`}
    >
      {/*
        O glifo ocupa cerca de 60% do círculo, que é a proporção com que as
        próprias marcas desenham os seus ícones de aplicação. Os traçados da
        Simple Icons preenchem a caixa de 24x24 toda, sem margem, por isso a
        margem tem de ser dada aqui — a 100% o desenho encostava ao rebordo.

        As medidas são em pixéis inteiros (12 dentro de 20, 20 dentro de 32)
        para que as linhas finas do Instagram caiam na grelha do ecrã em vez de
        ficarem esborratadas entre dois pixéis.
      */}
      <Glyph className={size === "sm" ? "h-3 w-3" : "h-5 w-5"} />
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

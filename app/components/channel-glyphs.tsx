/*
 * Os glifos oficiais do WhatsApp, do Messenger e do Instagram.
 *
 * Antes cada canal era uma letra — "W", "M", "I" — dentro de um círculo da cor
 * da marca. Funcionava como código de cores, mas não como ícone: a inicial é a
 * mesma do Messenger e de qualquer "M", e num ecrã onde o cliente está a ver as
 * suas próprias conversas o canal tem de se reconhecer sem ler.
 *
 * Os traçados são os desenhos oficiais de cada marca, no formato vectorial da
 * Simple Icons (domínio público, CC0): a mesma geometria que as marcas
 * publicam, e não uma imitação desenhada à mão. São vectores, por isso ficam
 * nítidos a 20px na lista e a 32px no cabeçalho da conversa, e em qualquer
 * ecrã retina — era isto que um PNG não dava.
 *
 * Todos partilham uma caixa de 24x24 e pintam-se com `currentColor`, de modo a
 * que quem os desenha controle o tamanho e a cor pelas classes do contentor,
 * como em qualquer outro ícone do produto.
 */

import type { ReactNode } from "react";

/** Propriedades comuns a todos os glifos. */
type GlyphProps = {
  className?: string;
};

/**
 * Base de todos os glifos.
 *
 * `aria-hidden` porque o nome do canal aparece sempre ao lado, ou no
 * `title`/texto de quem desenha o ícone. Anunciá-lo aqui faria o leitor de ecrã
 * dizer "WhatsApp WhatsApp" em cada uma das cem linhas da lista.
 */
function Glyph({
  children,
  className,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      focusable="false"
      role="presentation"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function WhatsAppGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.966 1.164-.199.198-.396.223-.693.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.347-.446.52-.644.174-.198.232-.34.347-.569.115-.23.057-.429-.015-.6-.074-.198-.669-1.611-.916-2.206-.24-.58-.486-.5-.666-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </Glyph>
  );
}

export function MessengerGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M.001 11.639C.001 4.95 5.241 0 12 0s12 4.95 12 11.639c0 6.689-5.24 11.639-12 11.639-1.21 0-2.38-.16-3.47-.46a.96.96 0 0 0-.64.05l-2.39 1.05a.96.96 0 0 1-1.35-.85l-.07-2.14a.97.97 0 0 0-.32-.68A11.39 11.39 0 0 1 .001 11.64Zm8.32-2.19-3.52 5.6c-.35.53.32 1.14.82.75l3.79-2.87c.26-.2.6-.2.86 0l2.8 2.1c.84.63 2.04.41 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.26.2-.6.2-.86 0l-2.8-2.1a1.84 1.84 0 0 0-2.6.48Z" />
    </Glyph>
  );
}

export function InstagramGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.667 1.336 1.08 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.667-.667 1.08-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0Zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.9.419.418.679.82.896 1.382.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.38-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03Zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324ZM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4Zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z" />
    </Glyph>
  );
}

/**
 * O "Todas" não é uma marca, por isso não tem glifo: é só um ponto, que é o
 * que já era antes em texto. Em SVG em vez do carácter "•" porque o ponto do
 * tipo de letra não assenta no centro óptico do círculo, e ao lado dos três
 * glifos a desalinhar notava-se.
 */
export function TodosGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="6" />
    </Glyph>
  );
}

/**
 * O mascote da Lexia: o beija-flor (05/11/2026).
 *
 * Quatro expressões, cada uma para um momento:
 * - `ola`: boas-vindas e telas vazias (a padrão);
 * - `piscadinha`: o Analista e as dicas;
 * - `feliz`: agendamento novo, meta batida;
 * - `voando`: carregando, enviando.
 *
 * As imagens vivem em `public/mascote/`. São ilustrações, por isso o texto
 * alternativo é vazio: quem lê o ecrã ouve o texto ao lado, não "pássaro".
 */
export type PoseMascote = "ola" | "piscadinha" | "feliz" | "voando";

export function Mascote({ className, pairar = true, pose = "ola", tamanho = 96 }: { className?: string; pairar?: boolean; pose?: PoseMascote; tamanho?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem pequena e fixa; o next/image não traz nada aqui
    <img alt="" aria-hidden="true" className={`mascote${pairar ? " mascote-pairar" : ""}${className ? ` ${className}` : ""}`} decoding="async" draggable={false} src={`/mascote/${pose}.webp`} style={{ width: tamanho, height: "auto" }} />
  );
}

/**
 * A cabeça do beija-flor num círculo, para avatares pequenos (cabeçalho do
 * Analista, botão do painel). Fica toda dentro do círculo.
 */
export function AvatarMascote({ className, tamanho = 32 }: { className?: string; tamanho?: number }) {
  return (
    <span aria-hidden="true" className={`mascote-avatar${className ? ` ${className}` : ""}`} style={{ width: tamanho, height: tamanho }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ver acima */}
      <img alt="" decoding="async" draggable={false} src="/mascote/cabeca.webp" />
    </span>
  );
}

/**
 * O botão redondo do Analista no app: a cabeça do beija-flor sai por cima do
 * círculo e o bico passa a borda à direita. O recorte é calculado para o
 * tamanho pedido: o círculo inteiro mais uma "janela" só em cima e à direita,
 * que começa por dentro do círculo, para não haver degrau nas laterais.
 * Quem se mexe é o botão inteiro (CSS `.mascote-fab`), nunca a ave contra o
 * recorte — era isso que fazia a "quebradinha".
 */
export function CabecaMascoteFab({ tamanho = 52 }: { tamanho?: number }) {
  const k = tamanho / 56;
  const n = (v: number) => Math.round(v * k * 100) / 100;
  const caminho = `M${n(36)},${n(23)} A${n(25)},${n(25)} 0 1 1 ${n(35.99)},${n(23)} Z M${n(22)},${n(34)} L${n(4)},${n(-10)} L${n(84)},${n(-10)} L${n(84)},${n(44)} L${n(56)},${n(40)} Z`;
  return (
    <span aria-hidden="true" className="mascote-fab" style={{ width: tamanho, height: tamanho }}>
      <span className="mascote-fab-disco" />
      <span className="mascote-fab-corte" style={{ left: n(-8), top: n(-20), width: n(72), height: n(76), clipPath: `path("${caminho}")` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ver acima */}
        <img alt="" decoding="async" draggable={false} src="/mascote/cabeca.webp" style={{ left: n(6), bottom: n(3), width: n(62), height: n(62) }} />
      </span>
    </span>
  );
}

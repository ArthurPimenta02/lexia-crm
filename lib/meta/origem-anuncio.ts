/**
 * De que anúncio veio uma conversa — a regra ÚNICA da plataforma, para todos os
 * clientes (Detail, Miranda, Claudia, Jessica e os próximos).
 *
 * QUEM APLICA ISTO
 * A base central (migration 202611190019_atribuicao_padrao.sql), com triggers em
 * `lexia_webhooks_meta`, `lexia_contactos` e `lexia_mensagens`. Cada agente
 * continua a gravar a ficha como sempre gravou; a base completa o que ele não
 * soube ler. Assim a regra é uma só, e o agente da Miranda (intocável) fica
 * igual. Este ficheiro é o espelho em TypeScript da mesma regra: é o que o
 * script de recuperação do histórico corre, e os testes confirmam que as duas
 * versões dizem o mesmo.
 *
 * AS TRÊS FONTES, da mais forte para a mais fraca
 *  3. o id do anúncio (`ad_id`) que a Meta mandou — em `message.referral`,
 *     `postback.referral` ou no evento `messaging_referrals` (em `messaging[]`
 *     ou em `changes[]`). Não se exige `source == "ADS"`: na UE pode faltar.
 *  2. a frase pronta do anúncio como PRIMEIRA mensagem do cliente ("Olá! Posso
 *     saber mais informações sobre isto?") — origem_tipo `anuncio`, sem
 *     campanha (a não ser que a frase esteja ligada a uma no mapa).
 *  1. orgânico.
 * A origem só sobe, nunca desce: um `organico` gravado pelo agente não apaga
 * uma origem de anúncio que já lá estava.
 */

export type FraseDeAnuncio = {
  /** null = vale para todos os clientes (as frases que a própria Meta põe). */
  cliente_slug: string | null;
  frase: string;
  /** Mapa frase → campanha. Vazio hoje; preencher quando cada campanha tiver a sua frase. */
  campanha_externa_id: string | null;
};

/**
 * As frases com que a base começa (a migration semeia exactamente estas; um
 * teste confere). Medidas a 19/11/2026 nas primeiras mensagens desde 20/09.
 */
export const FRASES_INICIAIS: readonly FraseDeAnuncio[] = [
  // As frases por omissão da Meta (Click-to-Message), em pt, en e es.
  { cliente_slug: null, frase: "Olá! Posso saber mais informações sobre isto?", campanha_externa_id: null },
  { cliente_slug: null, frase: "Hello! Can I get more info on this?", campanha_externa_id: null },
  { cliente_slug: null, frase: "¡Hola! Quiero más información", campanha_externa_id: null },
  // Detail by Cordeiro
  { cliente_slug: "detail_by_cordeiro", frase: "Olá! Gostaria de conhecer mais sobre os pacotes de detalhe automóvel", campanha_externa_id: null },
  { cliente_slug: "detail_by_cordeiro", frase: "Olá! Gostaria de saber mais sobre os pacotes de detalhe automóvel", campanha_externa_id: null },
  // Miranda Skin Experts
  { cliente_slug: "miranda_skin_experts", frase: "Olá, vim pelo anúncio e gostaria de agendar uma avaliação de pele", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Olá! Vim pelo anúncio e quero agendar uma avaliação de pele gratuita", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Hi! I saw your ad and I'd like to know more about the treatments", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Hi! I came across your ad and I'm interested in laser hair removal", campanha_externa_id: null },
  // Estas quatro também são texto de anúncio da Miranda (medidas a 19/11: 13, 9, 7 e 4 conversas).
  { cliente_slug: "miranda_skin_experts", frase: "Hi! I saw your ad and I'd like to schedule a consultation", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Olá! Vim pelo anúncio e tenho interesse na depilação a laser", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Olá, vim pelo anúncio e quero agendar uma avaliação para Botox", campanha_externa_id: null },
  { cliente_slug: "miranda_skin_experts", frase: "Hi! I came across your ad and I'm interested in laser tattoo removal", campanha_externa_id: null },
];

// A MESMA tabela do `translate()` da função SQL lexia_frase_normalizada.
// Não usar NFD aqui: tem de dar byte a byte o mesmo que o Postgres.
// Maiúsculas acentuadas também: o lower() do Postgres depende da collation.
export const ACENTOS_DE = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
export const ACENTOS_PARA = "aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn";

export function normalizarFrase(texto: string | null | undefined) {
  const s = [...String(texto ?? "")].map((c) => {
    const i = ACENTOS_DE.indexOf(c);
    return i >= 0 ? ACENTOS_PARA[i] : c;
  }).join("").replace(/[A-Z]/g, (c) => c.toLowerCase());
  return s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Uma frase só conta com pelo menos isto de texto normalizado (nunca "olá"). */
export const FRASE_MINIMA = 8;

/**
 * A frase pronta que abre `texto`, se houver. Basta que UMA linha da primeira
 * mensagem comece pela frase (o buffer junta mensagens seguidas, e às vezes o
 * cliente escreve uma linha antes do texto automático chegar). Começa por, e
 * não "contém": "Olá! Posso saber mais informações sobre os vossos serviços?"
 * foi escrita por uma pessoa e não conta.
 */
export function frasePronta(
  clienteSlug: string,
  texto: string | null | undefined,
  frases: readonly FraseDeAnuncio[],
): FraseDeAnuncio | null {
  const linhas = String(texto ?? "").split("\n").map((l) => normalizarFrase(l) + " ");
  const candidatas = frases
    .filter((f) => f.cliente_slug === null || f.cliente_slug === clienteSlug)
    .filter((f) => normalizarFrase(f.frase).length >= FRASE_MINIMA)
    // As do próprio cliente primeiro (podem trazer campanha), depois a mais longa.
    .sort((a, b) => Number(a.cliente_slug === null) - Number(b.cliente_slug === null) || b.frase.length - a.frase.length);

  for (const f of candidatas) {
    const alvo = normalizarFrase(f.frase) + " ";
    if (linhas.some((l) => l.startsWith(alvo))) {
      return f;
    }
  }

  return null;
}

/** 0 sem origem · 1 orgânico · 2 anúncio sem id (frase, post) · 3 anúncio com id. */
export function forcaDaOrigem(tipo: string | null | undefined, sourceId: string | null | undefined) {
  const t = String(tipo ?? "").trim();
  if (!t) return 0;
  if (t === "organico") return 1;
  if (t !== "instagram_post" && String(sourceId ?? "").trim()) return 3;
  return 2;
}

export function tipoDeAnuncioDoCanal(canal: string) {
  return canal === "instagram" ? "instagram_ad" : canal === "messenger" ? "messenger_ad" : canal === "whatsapp" ? "ctwa" : "meta_ad";
}

/** Um referral liga-se a uma ficha criada até 7 dias antes ou depois dele. */
export const JANELA_REFERRAL_MS = 7 * 24 * 3600 * 1000;

export type ReferralDaConversa = {
  anuncioExternoId: string;
  titulo: string | null;
  caminho: string;
  canal: string;
  recebidoEm: string;
};

export type FichaParaOrigem = {
  cliente_slug: string;
  identificador_conversa: string;
  criado_em: string;
  origem_tipo: string | null;
  origem_source_id: string | null;
};

export type OrigemNova = {
  origem_tipo: string;
  origem_source_id: string | null;
  origem_titulo: string | null;
  origem_dados: Record<string, unknown>;
  fonte: "referral" | "frase_pronta";
};

/**
 * O que a base faria a esta ficha (é o que o script de recuperação aplica ao
 * histórico). `campanhaDoAnuncio` = lexia_anuncios.anuncio_externo_id → campanha.
 */
export function origemRecuperada(
  ficha: FichaParaOrigem,
  primeiraRecebida: string | null,
  referrais: readonly ReferralDaConversa[],
  frases: readonly FraseDeAnuncio[],
  campanhaDoAnuncio: ReadonlyMap<string, string | null> = new Map(),
): OrigemNova | null {
  const forca = forcaDaOrigem(ficha.origem_tipo, ficha.origem_source_id);
  const criado = Date.parse(ficha.criado_em);

  if (forca < 3) {
    // O referral mais recente dentro da janela (a base guarda o último que chegou).
    const ref = [...referrais]
      .filter((r) => /^\d{1,32}$/.test(r.anuncioExternoId))
      .filter((r) => Math.abs(Date.parse(r.recebidoEm) - criado) <= JANELA_REFERRAL_MS)
      .sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm))[0];
    if (ref) {
      return {
        origem_tipo: tipoDeAnuncioDoCanal(ref.canal),
        origem_source_id: ref.anuncioExternoId,
        origem_titulo: ref.titulo,
        origem_dados: { fonte: "referral", caminho: ref.caminho, canal: ref.canal, campanha_externa_id: campanhaDoAnuncio.get(ref.anuncioExternoId) ?? null },
        fonte: "referral",
      };
    }
  }

  if (forca < 2) {
    const f = frasePronta(ficha.cliente_slug, primeiraRecebida, frases);
    if (f) {
      return {
        origem_tipo: "anuncio",
        origem_source_id: null,
        origem_titulo: null,
        origem_dados: { fonte: "frase_pronta", frase: f.frase, campanha_externa_id: f.campanha_externa_id },
        fonte: "frase_pronta",
      };
    }
  }

  return null;
}

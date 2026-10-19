import "server-only";

import { createHash } from "node:crypto";

/**
 * Ler a origem do anúncio dentro de um webhook de mensagens da Meta.
 *
 * PORQUE É QUE ISTO NÃO É UM `corpo.referral`
 *
 * A Meta manda a mesma informação nos três canais, em quatro sítios
 * diferentes, com nomes de campo diferentes. Um leitor escrito a olhar para o
 * WhatsApp não encontra nada no Instagram, e não dá erro — devolve vazio, que
 * passa por "esta pessoa não veio de anúncio".
 *
 *  1. WhatsApp:  entry[].changes[].value.messages[].referral.source_id
 *                O id do ANÚNCIO chama-se `source_id`, e traz `ctwa_clid`.
 *  2. Instagram e Messenger, primeira mensagem de uma conversa nova:
 *                entry[].messaging[].message.referral.ad_id
 *                Aqui chama-se `ad_id`, está um nível mais fundo, e não há
 *                `ctwa_clid` nenhum.
 *  3. Conversa reaberta (evento `messaging_referral`, subscrição separada):
 *                entry[].messaging[].referral.ad_id
 *                Mesmo nome, outro sítio — fora do `message`.
 *  4. Messenger pelo botão "Começar":
 *                entry[].messaging[].postback.referral.ad_id
 *
 * Medido a 19/10/2026 no Detail, desde 15/10: WhatsApp 11 de 30, Instagram 1
 * de 2, Messenger 0 de 8 — e zero em 540 contactos de sempre. É para saber
 * qual destes quatro caminhos o Messenger usa (e o n8n ignora) que existe este
 * ficheiro.
 *
 * O `caminho` devolvido em cada achado é a parte útil para o diagnóstico: diz
 * literalmente onde dentro do corpo é que o id estava. Sem ele, "não
 * encontrei" e "encontrei no sítio que ninguém lê" são a mesma resposta.
 *
 * Isto é só leitura de um objecto. Não fala com a Meta e não escreve nada: a
 * derivação corre sobre o corpo guardado, para que corrigir um erro aqui
 * corrija também o passado.
 */

export const canaisDeWebhook = [
  "whatsapp",
  "instagram",
  "messenger",
  "desconhecido",
] as const;

export type CanalDeWebhook = (typeof canaisDeWebhook)[number];

export type CaminhoDoReferral =
  | "message.referral"
  | "messaging.referral"
  | "postback.referral"
  | "whatsapp.messages.referral";

export type AchadoDeReferral = {
  /** Título e imagem do criativo, quando o canal os manda. */
  anuncioContexto: { imagemUrl: string | null; titulo: string | null } | null;
  /** O id do ANÚNCIO. Nunca o da campanha — a Meta não manda esse. */
  anuncioExternoId: string | null;
  caminho: CaminhoDoReferral;
  /** Identificador do clique, só existe no Click-to-WhatsApp. */
  ctwaClid: string | null;
  /** `source_type` do WhatsApp ou `source` do Instagram: "ad", "ADS", … */
  origemTipo: string | null;
  /** Quem enviou: `wa_id`/`from` no WhatsApp, PSID nos outros. */
  remetenteExternoId: string | null;
};

/**
 * O canal, lido do campo `object` que a Meta põe no topo de cada webhook.
 *
 * `desconhecido` não é falha: um canal novo tem de ficar gravado para se poder
 * olhar para ele, e não recusado à porta.
 */
export function canalDeWebhookMeta(corpo: unknown): CanalDeWebhook {
  const objecto = textoDe(objectoDoWebhookMeta(corpo));

  if (objecto === "whatsapp_business_account") {
    return "whatsapp";
  }

  if (objecto === "instagram") {
    return "instagram";
  }

  // O Messenger entrega sob `object: "page"` — é o objecto da Página, não um
  // objecto "messenger". Quem procurar a palavra "messenger" não a encontra.
  return objecto === "page" ? "messenger" : "desconhecido";
}

/** O valor literal de `object`, sem tradução, para se ver um canal novo. */
export function objectoDoWebhookMeta(corpo: unknown) {
  const raiz = objectoOuNulo(corpo);

  return raiz ? textoDe(raiz.object) : null;
}

/**
 * sha256 do corpo tal como chegou.
 *
 * Recebe o texto, não o objecto: a Meta reentrega o mesmo webhook byte a byte
 * quando não recebe 200, e é essa igualdade que se quer apanhar. Voltar a
 * serializar o objecto introduzia a ordem das chaves do nosso JSON.stringify
 * no meio, e duas entregas iguais podiam dar impressões diferentes.
 */
export function impressaoDigitalDoWebhook(corpoEmTexto: string) {
  return createHash("sha256").update(corpoEmTexto).digest("hex");
}

/**
 * Todos os referrals dentro do corpo, dos quatro caminhos possíveis.
 *
 * Devolve lista e não um só: um webhook da Meta pode trazer várias entradas e
 * várias mensagens no mesmo corpo. Ficar com a primeira perdia as outras em
 * silêncio.
 */
export function extrairReferraisDoWebhook(corpo: unknown): AchadoDeReferral[] {
  const raiz = objectoOuNulo(corpo);

  if (!raiz) {
    return [];
  }

  const achados: AchadoDeReferral[] = [];

  for (const entrada of listaDe(raiz.entry)) {
    const entry = objectoOuNulo(entrada);

    if (!entry) {
      continue;
    }

    recolherDoWhatsApp(entry, achados);
    recolherDoMessaging(entry, achados);
  }

  return achados;
}

/** O primeiro achado com anúncio identificado, ou null. */
export function primeiroReferralComAnuncio(corpo: unknown) {
  return (
    extrairReferraisDoWebhook(corpo).find(
      (achado) => achado.anuncioExternoId !== null,
    ) ?? null
  );
}

function recolherDoWhatsApp(
  entry: Record<string, unknown>,
  achados: AchadoDeReferral[],
) {
  for (const alteracao of listaDe(entry.changes)) {
    const change = objectoOuNulo(alteracao);
    const valor = change && objectoOuNulo(change.value);

    if (!valor) {
      continue;
    }

    for (const mensagem of listaDe(valor.messages)) {
      const message = objectoOuNulo(mensagem);
      const referral = message && objectoOuNulo(message.referral);

      if (!message || !referral) {
        continue;
      }

      const origemTipo = textoDe(referral.source_type);

      achados.push({
        anuncioContexto: null,
        // `source_id` só é o id de um anúncio quando `source_type` é "ad". Num
        // referral de `source_type: "post"` o MESMO campo traz o id do POST —
        // e gravá-lo como anúncio dava um contacto contado como identificado,
        // a apontar para uma campanha que nunca vai existir.
        anuncioExternoId:
          origemTipo?.toLowerCase() === "ad"
            ? idDeAnuncio(referral.source_id)
            : null,
        caminho: "whatsapp.messages.referral",
        ctwaClid: textoDe(referral.ctwa_clid),
        origemTipo,
        remetenteExternoId: textoDe(message.from),
      });
    }
  }
}

function recolherDoMessaging(
  entry: Record<string, unknown>,
  achados: AchadoDeReferral[],
) {
  for (const evento of listaDe(entry.messaging)) {
    const messaging = objectoOuNulo(evento);

    if (!messaging) {
      continue;
    }

    const remetente = objectoOuNulo(messaging.sender);
    const remetenteExternoId = remetente ? textoDe(remetente.id) : null;
    const message = objectoOuNulo(messaging.message);
    const postback = objectoOuNulo(messaging.postback);
    const sitios: { caminho: CaminhoDoReferral; cru: unknown }[] = [
      { caminho: "message.referral", cru: message?.referral },
      { caminho: "messaging.referral", cru: messaging.referral },
      { caminho: "postback.referral", cru: postback?.referral },
    ];

    for (const { caminho, cru } of sitios) {
      const referral = objectoOuNulo(cru);

      if (!referral) {
        continue;
      }

      achados.push({
        anuncioContexto: contextoDoAnuncio(referral.ads_context_data),
        anuncioExternoId: idDeAnuncio(referral.ad_id),
        caminho,
        // O Instagram e o Messenger não mandam `ctwa_clid`: esse identificador
        // é do Click-to-WhatsApp. Ficar aqui a null é a resposta certa, e não
        // um campo esquecido.
        ctwaClid: null,
        origemTipo: textoDe(referral.source),
        remetenteExternoId,
      });
    }
  }
}

function contextoDoAnuncio(valor: unknown) {
  const contexto = objectoOuNulo(valor);

  if (!contexto) {
    return null;
  }

  return {
    imagemUrl: textoDe(contexto.photo_url),
    titulo: textoDe(contexto.ad_title),
  };
}

/**
 * Os ids da Meta passam dos 15 dígitos e vêm como texto. Devolver o texto e
 * nunca um número: `Number("120237312707190118")` perde o último dígito sem
 * avisar, e o anúncio deixa de casar com o espelho em lexia_anuncios.
 */
function idDeAnuncio(valor: unknown) {
  const texto = textoDe(valor);

  return texto && /^\d{1,32}$/.test(texto) ? texto : null;
}

function textoDe(valor: unknown) {
  if (typeof valor !== "string") {
    return null;
  }

  const limpo = valor.trim();

  return limpo ? limpo.slice(0, 512) : null;
}

function listaDe(valor: unknown) {
  return Array.isArray(valor) ? valor : [];
}

function objectoOuNulo(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

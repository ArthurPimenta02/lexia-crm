import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Traduz o id de anúncio guardado na ficha em campanha / conjunto / criativo.
 *
 * O QUE ESTÁ AQUI E PORQUE NÃO ESTÁ EM lib/clientes/read.ts
 * O agente guarda `lexia_contactos.origem_source_id` quando o referral da Meta
 * vem na primeira mensagem. Esse valor é o id do ANÚNCIO. Quem o quer mostrar
 * são dois ecrãs diferentes — a ficha do cliente e o ecrã de campanhas — e por
 * isso a tradução vive num sítio só.
 *
 * LÊ COM O CLIENTE AUTENTICADO, não com a chave de serviço, igual a
 * lib/campaigns/read.ts: a policy `anuncios_select` é que faz o isolamento
 * entre clientes. Um `createAdminClient()` aqui passava por cima dela.
 *
 * O QUE ESTES NÚMEROS SÃO E NÃO SÃO
 * Medido em 19/10/2026 no Detail: 13 de 1.028 contactos têm id de anúncio. Não
 * é porque os outros 1.015 não vieram de anúncio — é porque o Instagram Direct
 * e o Messenger não enviam referral, e 76% do gasto da conta vai justamente
 * para Instagram Direct. Só o clique-para-WhatsApp o manda. Qualquer contagem
 * por campanha é um PISO: serve para comparar campanhas entre si, nunca para
 * dizer que percentagem dos contactos veio de pago.
 */

export type AtribuicaoAnuncio = {
  campanhaExternaId: string | null;
  campanhaNome: string | null;
  conjuntoNome: string | null;
  criativoNome: string | null;
};

type AnuncioRow = {
  anuncio_externo_id: unknown;
  campanha_externa_id: unknown;
  campanha_nome: unknown;
  conjunto_nome: unknown;
  nome: unknown;
};

function texto(valor: unknown): string | null {
  const limpo = typeof valor === "string" ? valor.trim() : "";

  return limpo ? limpo : null;
}

/**
 * Limite de ids por pedido. A lista de clientes já vem paginada (50 fichas por
 * página), por isso na prática são sempre poucos; o teto existe para o caso de
 * alguém chamar isto com uma lista inteira.
 */
const maxIds = 500;

/**
 * @param sourceIds Os `origem_source_id` das fichas que estão no ecrã. Valores
 *   vazios e repetidos são ignorados.
 * @returns Mapa de id de anúncio → nomes. Um id que não esteja na tabela fica
 *   fora do mapa, e isso é o caso normal: o anúncio pode ter sido apagado na
 *   Meta antes da primeira sincronização, ou a sincronização pode nunca ter
 *   corrido para este cliente. Quem mostra tem de saber lidar com a ausência.
 */
export async function getAtribuicaoPorAnuncio(
  clienteSlug: string,
  sourceIds: (string | null | undefined)[],
): Promise<Map<string, AtribuicaoAnuncio>> {
  const ids = [
    ...new Set(
      sourceIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  ].slice(0, maxIds);

  if (ids.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lexia_anuncios")
    .select(
      "anuncio_externo_id, nome, conjunto_nome, campanha_nome, campanha_externa_id",
    )
    .eq("cliente_slug", clienteSlug)
    .eq("plataforma", "meta")
    .in("anuncio_externo_id", ids);

  if (error) {
    // Um dicionário em falta não pode apagar a ficha do cliente do ecrã. Sem
    // tradução, a ficha mostra o resto e cala a origem — que é exactamente o
    // que fazia antes desta funcionalidade existir.
    console.error("Atribuição: falha ao ler lexia_anuncios", error);

    return new Map();
  }

  const mapa = new Map<string, AtribuicaoAnuncio>();

  for (const row of (data ?? []) as AnuncioRow[]) {
    const id = texto(row.anuncio_externo_id);

    if (!id) {
      continue;
    }

    mapa.set(id, {
      campanhaExternaId: texto(row.campanha_externa_id),
      campanhaNome: texto(row.campanha_nome),
      conjuntoNome: texto(row.conjunto_nome),
      criativoNome: texto(row.nome),
    });
  }

  return mapa;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItemResumo } from "@/lib/analises/regras";

/**
 * Leitura das análises das conversas para /admin/analises. Recebe o cliente
 * da service_role: quem chama já confirmou `lexia_admin`.
 */

export const ANALISES_NA_LISTA = 30;
export const DIAS_DOS_REPETIDOS = 30;

export type Analise = {
  cliente_slug: string | null;
  concluida_em: string | null;
  conversa: string | null;
  criado_em: string;
  custo_estimado: number | string | null;
  erro: string | null;
  estado: string;
  id: string;
  pedido: string | null;
  periodo_fim: string | null;
  periodo_inicio: string | null;
  resumo: string | null;
  tipo: string;
};

export type ItemAnalise = {
  analise_id: string;
  causa: string | null;
  citacao: string | null;
  cliente_slug: string;
  criado_em: string;
  estado: string;
  gravidade: string;
  id: string;
  identificador_conversa: string | null;
  nota_admin: string | null;
  o_que_a_ia_decidiu: string | null;
  o_que_o_codigo_fez: string | null;
  onde_corrigir: string | null;
  titulo: string;
};

export type LeituraAnalises =
  | { faltaMigracao: true }
  | {
      analises: Analise[];
      faltaMigracao: false;
      /** Itens leves de todas as análises da lista (para as contagens). */
      itensDaLista: Pick<ItemAnalise, "analise_id" | "cliente_slug" | "estado" | "gravidade" | "id">[];
      itensSelecionada: ItemAnalise[];
      repetidosBase: ItemResumo[];
      selecionada: Analise | null;
    };

const semTabela = (code: string | undefined) => code === "42P01" || code === "PGRST205";

export async function lerAnalises(
  admin: SupabaseClient,
  { cliente, pedida, agora }: { agora: Date; cliente: string; pedida: string },
): Promise<LeituraAnalises> {
  let consulta = admin
    .from("lexia_analises")
    .select("id, criado_em, tipo, estado, pedido, cliente_slug, conversa, periodo_inicio, periodo_fim, resumo, custo_estimado, concluida_em, erro")
    .order("criado_em", { ascending: false })
    .limit(ANALISES_NA_LISTA);
  // `cliente` já vem confirmado contra a lexia_clientes por quem chama.
  if (cliente) consulta = consulta.or(`cliente_slug.is.null,cliente_slug.eq.${cliente}`);
  const { data, error } = await consulta;
  if (error) {
    if (semTabela(error.code)) return { faltaMigracao: true };
    throw new Error(`lexia_analises: ${error.message}`);
  }
  const analises = (data ?? []) as Analise[];

  let selecionada = analises.find((a) => a.id === pedida) ?? null;
  if (!selecionada && pedida && /^[0-9a-f-]{36}$/i.test(pedida)) {
    // Pode estar fora das 30 mais recentes (link antigo).
    const { data: antiga } = await admin
      .from("lexia_analises")
      .select("id, criado_em, tipo, estado, pedido, cliente_slug, conversa, periodo_inicio, periodo_fim, resumo, custo_estimado, concluida_em, erro")
      .eq("id", pedida)
      .maybeSingle();
    selecionada = (antiga as Analise | null) ?? null;
  }
  selecionada ??= analises[0] ?? null;

  const ids = analises.map((a) => a.id);
  const desde = new Date(agora.getTime() - DIAS_DOS_REPETIDOS * 86_400_000).toISOString();

  const [lista, detalhe, repetidos] = await Promise.all([
    ids.length
      ? admin.from("lexia_analises_itens").select("id, analise_id, cliente_slug, gravidade, estado").in("analise_id", ids).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    selecionada
      ? admin
          .from("lexia_analises_itens")
          .select("id, analise_id, cliente_slug, identificador_conversa, gravidade, titulo, citacao, o_que_a_ia_decidiu, o_que_o_codigo_fez, causa, onde_corrigir, estado, nota_admin, criado_em")
          .eq("analise_id", selecionada.id)
          .order("criado_em", { ascending: true })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("lexia_analises_itens")
      .select("id, analise_id, cliente_slug, gravidade, estado, titulo, causa, criado_em")
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(3000),
  ]);

  for (const r of [lista, detalhe, repetidos]) {
    if (r.error) {
      if (semTabela(r.error.code)) return { faltaMigracao: true };
      throw new Error(`lexia_analises_itens: ${r.error.message}`);
    }
  }

  return {
    analises,
    faltaMigracao: false,
    itensDaLista: (lista.data ?? []) as LeituraAnalisesItensLeves,
    itensSelecionada: (detalhe.data ?? []) as ItemAnalise[],
    repetidosBase: (repetidos.data ?? []) as ItemResumo[],
    selecionada,
  };
}

type LeituraAnalisesItensLeves = Pick<ItemAnalise, "analise_id" | "cliente_slug" | "estado" | "gravidade" | "id">[];

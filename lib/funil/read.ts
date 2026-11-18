import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getClientTimezone, instanteNoFuso } from "@/lib/clientes/timezone";
import {
  agrupar,
  agruparPorSemana,
  apurarConversas,
  chaveDaConversa,
  type EtapaFunil,
  type MarcacaoFunil,
  type MensagemFunil,
  type SemanaFunil,
  ultimasSemanas,
} from "@/lib/funil/etapas";
import { chaveTelefone } from "@/lib/pipeline/etapas";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * Quem entra no funil e o que não se pode medir em cada um.
 *
 * `agenda`: as marcações vêm de `lexia_agendamentos` (o espelho do Google,
 * igual para todos), ligadas à conversa pelos últimos 9 dígitos do telefone.
 * Sem agenda espelhada, "marcada" e "compareceu" ficam "sem dado".
 */
/** Porque é que uma etapa fica "sem dado" num cliente. */
export type MotivoSemDado = "agenda_sem_espelho" | "loja";

export const CLIENTES_DO_FUNIL: {
  slug: string;
  agenda: boolean;
  /** Etapas que não se medem neste cliente, com o motivo (o ecrã traduz o código). */
  semDado: Partial<Record<EtapaFunil, MotivoSemDado>>;
}[] = [
  { agenda: true, semDado: {}, slug: "miranda_skin_experts" },
  { agenda: true, semDado: {}, slug: "detail_by_cordeiro" },
  {
    agenda: false,
    semDado: {
      compareceu: "agenda_sem_espelho",
      marcada: "agenda_sem_espelho",
    },
    slug: "claudia_leite_spa",
  },
  {
    agenda: false,
    semDado: {
      compareceu: "loja",
      horarios: "loja",
      marcada: "loja",
      resumo: "loja",
    },
    slug: "asteric",
  },
];

export const SEMANAS_DO_FUNIL = 8;

export type FunilDoCliente = {
  slug: string;
  timeZone: string;
  semanas: SemanaFunil[];
  total: SemanaFunil;
  semDado: Partial<Record<EtapaFunil, MotivoSemDado>>;
  /** Última sincronização do espelho da agenda (só com agenda). */
  agendaSincronizadaEm: string | null;
  /** Quantas marcações do período não se ligaram a nenhuma conversa (sem telefone que bata). */
  marcacoesSemConversa: number | null;
};

const LOTE = 100;

function lotes<T>(valores: T[]) {
  const saida: T[][] = [];
  for (let i = 0; i < valores.length; i += LOTE) saida.push(valores.slice(i, i + LOTE));
  return saida;
}

export async function lerFunilDoCliente(
  supabase: SupabaseClient,
  slug: string,
  agora = new Date(),
): Promise<FunilDoCliente> {
  const config = CLIENTES_DO_FUNIL.find((c) => c.slug === slug) ?? {
    agenda: false,
    semDado: {
      compareceu: "agenda_sem_espelho",
      marcada: "agenda_sem_espelho",
    },
    slug,
  };
  const timeZone = getClientTimezone(slug);
  const semanas = ultimasSemanas(agora, timeZone, SEMANAS_DO_FUNIL);
  const inicioIso = instanteNoFuso(semanas[semanas.length - 1], "00:00", timeZone);
  if (!inicioIso) throw new Error("Não foi possível calcular o início do funil.");

  const mensagens = await fetchAllSupabaseRows<MensagemFunil>((from, to) =>
    supabase
      .from("lexia_mensagens")
      .select("identificador_conversa, direccao, origem, conteudo, criado_em")
      .eq("cliente_slug", slug)
      .not("identificador_conversa", "like", "teste:%")
      .gte("criado_em", inicioIso)
      .order("criado_em", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (mensagens.error) throw new Error("Não foi possível ler as mensagens do funil.");

  // Só conversas que COMEÇARAM na janela: fora as que já tinham mensagem recebida antes.
  const candidatas = Array.from(
    new Set(mensagens.data.filter((m) => m.direccao === "recebida").map((m) => m.identificador_conversa)),
  );
  const antigas = new Set<string>();
  const naoWhatsapp: string[] = [];
  for (const lote of lotes(candidatas)) {
    const r = await fetchAllSupabaseRows<{ identificador_conversa: string }>((from, to) =>
      supabase
        .from("lexia_mensagens")
        .select("identificador_conversa")
        .eq("cliente_slug", slug)
        .eq("direccao", "recebida")
        .in("identificador_conversa", lote)
        .lt("criado_em", inicioIso)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (r.error) throw new Error("Não foi possível ler o histórico do funil.");
    for (const x of r.data) antigas.add(x.identificador_conversa);
  }
  const novas = new Set(candidatas.filter((id) => !antigas.has(id)));
  for (const id of novas) if (!id.startsWith("whatsapp:")) naoWhatsapp.push(id);

  // Nos canais da Meta o telefone não está no identificador: vem do contacto, se o lead o deu.
  const telefones = new Map<string, string | null>();
  if (config.agenda) {
    for (const lote of lotes(naoWhatsapp)) {
      const { data, error } = await supabase
        .from("lexia_contactos")
        .select("identificador_conversa, telefone_digitos")
        .eq("cliente_slug", slug)
        .in("identificador_conversa", lote);
      if (error) throw new Error("Não foi possível ler os contactos do funil.");
      for (const c of data ?? []) telefones.set(c.identificador_conversa, c.telefone_digitos);
    }
  }

  let marcacoes: MarcacaoFunil[] | null = null;
  let agendaSincronizadaEm: string | null = null;
  if (config.agenda) {
    const desde = new Date(new Date(inicioIso).getTime() - 60 * 60 * 1000).toISOString();
    const r = await fetchAllSupabaseRows<MarcacaoFunil>((from, to) =>
      supabase
        .from("lexia_agendamentos")
        .select("telefone_digitos, criado_no_google, inicio, estado")
        .eq("cliente_slug", slug)
        .not("telefone_digitos", "is", null)
        .gte("criado_no_google", desde)
        .order("criado_no_google", { ascending: true })
        .range(from, to),
    );
    if (r.error) throw new Error("Não foi possível ler a agenda do funil.");
    marcacoes = r.data;

    const { data: sinc } = await supabase
      .from("lexia_agendamentos")
      .select("sincronizado_em")
      .eq("cliente_slug", slug)
      .order("sincronizado_em", { ascending: false, nullsFirst: false })
      .limit(1);
    agendaSincronizadaEm = (sinc?.[0]?.sincronizado_em as string | undefined) ?? null;
  }

  const conversas = apurarConversas({
    agora,
    marcacoes,
    mensagens: mensagens.data.filter((m) => novas.has(m.identificador_conversa)),
    telefonesDosContactos: telefones,
    timeZone,
  });

  // Marcações do período que não ficaram ligadas a nenhuma conversa nova (o lead deu outro número,
  // ou a conversa começou antes da janela). Fica à vista para ninguém ler o funil como a agenda toda.
  let marcacoesSemConversa: number | null = null;
  if (marcacoes) {
    const chaves = new Set(
      Array.from(novas)
        .map((id) => chaveDaConversa(id, telefones.get(id)))
        .filter((c): c is string => c !== null),
    );
    marcacoesSemConversa = marcacoes.filter((m) => {
      if ((m.criado_no_google ?? "") < inicioIso) return false;
      const chave = chaveTelefone(m.telefone_digitos);
      return !chave || !chaves.has(chave);
    }).length;
  }

  return {
    agendaSincronizadaEm,
    marcacoesSemConversa,
    semDado: config.semDado,
    semanas: agruparPorSemana(conversas, semanas),
    slug,
    timeZone,
    total: agrupar(conversas, "total"),
  };
}

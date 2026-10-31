/**
 * Leitura dos turnos do agente em código (tabela `lexia_turnos`, Fase 18).
 *
 * Quem escreve é o repo lexia-agente (src/registo.ts). Aqui só se traduz o
 * que está gravado para linguagem de quem não é técnico: o Arthur abre esta
 * tela quando um cliente reclama e precisa de perceber o que a agente fez.
 */

export type TurnoLinha = {
  id: string;
  cliente_slug: string;
  agente: string;
  modo: string;
  identificador_conversa: string | null;
  canal: string | null;
  estado: string;
  motivo: string | null;
  erro: string | null;
  mensagem_cliente: string | null;
  mensagens: unknown;
  custo_usd: number | string | null;
  duracao_ms: number | null;
  criado_em: string;
};

export type EventoIa = {
  agente: string;
  modelo: string;
  ms: number;
  tokens: { entrada: number; saida: number; cache: number; gravado: number };
  saida: string;
};

export type EventoFerramenta = {
  agente: string;
  nome: string;
  ms: number;
  entrada: unknown;
  saida: unknown;
  erro?: string;
};

export type Passo = { workflow: string; no: string; ms: number; saida: unknown };

export type TurnoCompleto = TurnoLinha & {
  run_id: string | null;
  rota: string | null;
  handoff: {
    necessario?: boolean;
    motivo?: string;
    prioridade?: string;
    resumo_para_equipa?: string;
  } | null;
  resumo: {
    assunto?: string | null;
    trava_roteamento?: string | null;
    idioma?: string | null;
    agentes?: string[];
    briefing?: {
      objectivo?: string;
      factos?: unknown[];
      pergunta_a_fazer?: string;
      notas_para_redator?: unknown[];
    } | null;
    texto_do_redator?: unknown;
    travas?: string[];
    textos_finais?: string[];
  } | null;
  ia: EventoIa[] | null;
  ferramentas: EventoFerramenta[] | null;
  passos: Passo[] | null;
  custo_sem_preco: string[] | null;
  tokens: EventoIa["tokens"] | null;
  versao: string | null;
  iniciado_em: string | null;
};

const ESTADOS: Record<string, string> = {
  respondido: "Respondeu",
  parado: "Não respondeu",
  juntado_a_outra: "Juntou com a seguinte",
  erro: "Erro",
};

export function descreverEstado(estado: string) {
  return ESTADOS[estado] ?? estado;
}

/** Custo em dólares; abaixo de 1 dólar aparece em centavos ("8,34¢"), que é a escala de um turno. */
export function formatarCusto(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}¢`;
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
}

export function formatarDuracao(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

/** JSON legível; texto fica como está. */
export function legivel(valor: unknown) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
}

/**
 * Lista de textos a partir do que o Redator devolveu: o registo guarda o
 * array `mensagens` quando conseguiu ler o JSON, ou o texto cru quando não.
 */
export function textosDoRedator(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((v) => String(v));
  if (typeof valor === "string" && valor.trim()) return [valor];
  return [];
}

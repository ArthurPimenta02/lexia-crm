/**
 * Análises das conversas (19/11/2026): as regras puras da tela
 * /admin/analises. Sem acesso a dados, para se poderem testar sozinhas.
 *
 * - O pedido de uma análise nova (geral ou específica) vindo do navegador:
 *   o que se aceita e como vira linha de `lexia_analises`.
 * - O corpo da issue que avisa a rotina na nuvem.
 * - As contagens por cliente e os "erros que se repetem".
 */

export const TIPOS_ANALISE = ["diaria", "geral", "especifica"] as const;
export type TipoAnalise = (typeof TIPOS_ANALISE)[number];

export const ESTADOS_ANALISE = ["pedida", "a_correr", "concluida", "falhou"] as const;
export type EstadoAnalise = (typeof ESTADOS_ANALISE)[number];

export const GRAVIDADES = ["grave", "medio", "detalhe", "positivo"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const ESTADOS_ITEM = ["novo", "visto", "corrigido", "falso_alarme"] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number];

/** Os períodos que a tela oferece, em horas. */
export const PERIODOS = { "24h": 24, "3d": 72, "7d": 168 } as const;
export type Periodo = keyof typeof PERIODOS;

export const LIMITE_PERGUNTA = 4000;
export const LIMITE_CONVERSA = 200;
export const LIMITE_NOTA = 2000;

export const eGravidade = (v: unknown): v is Gravidade => GRAVIDADES.includes(v as Gravidade);
export const eEstadoItem = (v: unknown): v is EstadoItem => ESTADOS_ITEM.includes(v as EstadoItem);
export const ePeriodo = (v: unknown): v is Periodo => typeof v === "string" && Object.hasOwn(PERIODOS, v);

/** A linha a gravar em `lexia_analises` para um pedido do admin. */
export type LinhaPedido = {
  cliente_slug: string | null;
  conversa: string | null;
  estado: "pedida";
  pedido: string | null;
  periodo_fim: string;
  periodo_inicio: string;
  tipo: "geral" | "especifica";
};

export type ResultadoPedido =
  | { erro: "cliente" | "pergunta" | "periodo" | "tipo"; ok: false }
  | { linha: LinhaPedido; ok: true };

function texto(v: unknown, limite: number) {
  return typeof v === "string" ? v.trim().slice(0, limite) : "";
}

/**
 * Valida o corpo do pedido. Não confirma se o cliente existe (isso é consulta
 * à `lexia_clientes`, feita pela rota): só a forma.
 *
 * - geral: período; cliente opcional (vazio = todos); pergunta opcional.
 * - especifica: cliente, período e pergunta obrigatórios; conversa opcional.
 */
export function validarPedido(corpo: unknown, agora: Date): ResultadoPedido {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const tipo = c.tipo;
  if (tipo !== "geral" && tipo !== "especifica") return { erro: "tipo", ok: false };
  if (!ePeriodo(c.periodo)) return { erro: "periodo", ok: false };

  const cliente = texto(c.cliente, 80) || null;
  const pergunta = texto(c.pergunta, LIMITE_PERGUNTA) || null;
  const conversa = tipo === "especifica" ? texto(c.conversa, LIMITE_CONVERSA) || null : null;

  if (tipo === "especifica" && !cliente) return { erro: "cliente", ok: false };
  if (tipo === "especifica" && !pergunta) return { erro: "pergunta", ok: false };

  const fim = agora;
  const inicio = new Date(agora.getTime() - PERIODOS[c.periodo] * 3_600_000);
  return {
    linha: {
      cliente_slug: cliente,
      conversa,
      estado: "pedida",
      pedido: pergunta,
      periodo_fim: fim.toISOString(),
      periodo_inicio: inicio.toISOString(),
      tipo,
    },
    ok: true,
  };
}

/** O repositório privado onde a rotina na nuvem escuta issues novas. */
export const REPOSITORIO_DA_ROTINA = "ArthurPimenta02/lexia-agentes";

/** Título e corpo (JSON) da issue que avisa a rotina. Nunca leva segredos. */
export function issueDoPedido(id: string, linha: LinhaPedido) {
  return {
    body: JSON.stringify(
      {
        cliente_slug: linha.cliente_slug,
        conversa: linha.conversa,
        id,
        pedido: linha.pedido,
        periodo_fim: linha.periodo_fim,
        periodo_inicio: linha.periodo_inicio,
        tabela: "lexia_analises",
        tipo: linha.tipo,
      },
      null,
      2,
    ),
    title: `Análise pedida #${id}`,
  };
}

export type ItemResumo = {
  analise_id?: string;
  causa?: string | null;
  cliente_slug: string;
  criado_em: string;
  estado: string;
  gravidade: string;
  id?: string;
  titulo: string;
};

/** Um erro ainda por resolver: novo ou só visto. */
export const ePorResolver = (estado: string) => estado === "novo" || estado === "visto";
/** Corrigido ou falso alarme: já não é erro para contar. */
export const eResolvido = (estado: string) => estado === "corrigido" || estado === "falso_alarme";

/**
 * O que a tela conta. `grave`, `medio` e `detalhe` são SÓ os erros por
 * resolver (novo ou visto); os corrigidos e os falsos alarmes vão para
 * `corrigidos` e nunca entram nos números de erro. `positivo` é o que correu
 * bem, seja qual for o estado.
 */
export type Contagem = { corrigidos: number; detalhe: number; grave: number; medio: number; positivo: number };

const contagemVazia = (): Contagem => ({ corrigidos: 0, detalhe: 0, grave: 0, medio: 0, positivo: 0 });

function contar(c: Contagem, it: Pick<ItemResumo, "estado" | "gravidade">) {
  if (!eGravidade(it.gravidade)) return;
  if (it.gravidade === "positivo") c.positivo += 1;
  else if (eResolvido(it.estado)) c.corrigidos += 1;
  else if (ePorResolver(it.estado)) c[it.gravidade] += 1;
}

/** Quantos erros por resolver há (graves + médios + detalhes). */
export const totalPorResolver = (c: Contagem) => c.grave + c.medio + c.detalhe;

/** A contagem de cada cliente (ordem: mais graves por resolver primeiro). */
export function contagensPorCliente(itens: Pick<ItemResumo, "cliente_slug" | "estado" | "gravidade">[]) {
  const mapa = new Map<string, Contagem>();
  for (const it of itens) {
    if (!eGravidade(it.gravidade)) continue;
    const c = mapa.get(it.cliente_slug) ?? contagemVazia();
    contar(c, it);
    mapa.set(it.cliente_slug, c);
  }
  return [...mapa.entries()]
    .map(([cliente_slug, contagem]) => ({ cliente_slug, contagem }))
    .sort(
      (a, b) =>
        b.contagem.grave - a.contagem.grave ||
        b.contagem.medio - a.contagem.medio ||
        b.contagem.detalhe - a.contagem.detalhe ||
        a.cliente_slug.localeCompare(b.cliente_slug),
    );
}

/** A contagem de uma lista de itens (mesmas regras de `contagensPorCliente`). */
export function contagemTotal(itens: Pick<ItemResumo, "estado" | "gravidade">[]): Contagem {
  const c = contagemVazia();
  for (const it of itens) contar(c, it);
  return c;
}

/** O que a tela mostra: por resolver, só os corrigidos, ou tudo. */
export const VISTAS = ["por_resolver", "corrigidos", "todos"] as const;
export type Vista = (typeof VISTAS)[number];
export const eVista = (v: unknown): v is Vista => VISTAS.includes(v as Vista);

const ORDEM: Record<string, number> = { detalhe: 2, grave: 0, medio: 1 };

/**
 * Os itens de uma análise em três grupos, cada um na ordem em que se lê:
 * por resolver (grave → médio → detalhe, depois o mais antigo primeiro),
 * o que correu bem, e os já resolvidos (corrigidos e falsos alarmes).
 */
export function separarItens<T extends Pick<ItemResumo, "criado_em" | "estado" | "gravidade">>(itens: T[]) {
  const porOrdem = (a: T, b: T) =>
    (ORDEM[a.gravidade] ?? 9) - (ORDEM[b.gravidade] ?? 9) || a.criado_em.localeCompare(b.criado_em);
  const positivos = itens.filter((i) => i.gravidade === "positivo");
  const erros = itens.filter((i) => i.gravidade !== "positivo");
  return {
    porResolver: erros.filter((i) => !eResolvido(i.estado)).sort(porOrdem),
    positivos: [...positivos].sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    resolvidos: erros.filter((i) => eResolvido(i.estado)).sort(porOrdem),
  };
}

/** Minúsculas, sem acentos nem pontuação, espaços colapsados: "Preço  errado!" = "preco errado". */
export function chaveDeTexto(v: string | null | undefined) {
  return (v ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** O dia (AAAA-MM-DD) de um instante no fuso de Brasília, onde a rotina corre. */
export function diaEmBrasilia(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(new Date(iso));
}

export type Repetido = {
  /** Algum item marcado como corrigido e o mesmo erro voltou num dia posterior. */
  voltouDepoisDeCorrigido: boolean;
  campo: "titulo" | "causa";
  clientes: string[];
  dias: string[];
  gravidade: Gravidade;
  texto: string;
  ultimo: string;
  vezes: number;
};

const PESO: Record<Gravidade, number> = { detalhe: 1, grave: 3, medio: 2, positivo: 0 };

/**
 * Os erros que se repetem: o mesmo título (ou a mesma causa), escrito igual
 * depois de normalizado, em pelo menos `minimoDias` dias diferentes.
 * Positivos e falsos alarmes não contam. Os de mais dias e mais graves
 * primeiro.
 */
export function errosQueSeRepetem(itens: ItemResumo[], minimoDias = 2): Repetido[] {
  type Grupo = { campo: Repetido["campo"]; itens: ItemResumo[]; texto: string };
  const grupos = new Map<string, Grupo>();

  for (const it of itens) {
    if (it.gravidade === "positivo" || it.estado === "falso_alarme") continue;
    for (const campo of ["titulo", "causa"] as const) {
      const original = (campo === "titulo" ? it.titulo : it.causa)?.trim();
      const chave = chaveDeTexto(original);
      if (!original || chave.length < 4) continue;
      const k = `${campo}:${chave}`;
      const g = grupos.get(k) ?? { campo, itens: [], texto: original };
      g.itens.push(it);
      grupos.set(k, g);
    }
  }

  const resultado: Repetido[] = [];
  for (const g of grupos.values()) {
    const dias = [...new Set(g.itens.map((i) => diaEmBrasilia(i.criado_em)))].sort();
    if (dias.length < minimoDias) continue;
    const ordenados = [...g.itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const ultimo = ordenados.at(-1)!.criado_em;
    const corrigidos = ordenados.filter((i) => i.estado === "corrigido");
    const voltou = corrigidos.some((c) =>
      ordenados.some((o) => diaEmBrasilia(o.criado_em) > diaEmBrasilia(c.criado_em)),
    );
    const gravidade = ordenados
      .map((i) => i.gravidade)
      .filter(eGravidade)
      .reduce<Gravidade>((max, gv) => (PESO[gv] > PESO[max] ? gv : max), "detalhe");
    resultado.push({
      campo: g.campo,
      clientes: [...new Set(g.itens.map((i) => i.cliente_slug))].sort(),
      dias,
      gravidade,
      texto: g.texto,
      ultimo,
      vezes: g.itens.length,
      voltouDepoisDeCorrigido: voltou,
    });
  }

  // O mesmo conjunto de itens agrupado por título e por causa aparece uma vez só (fica o título).
  const vistos = new Set<string>();
  return resultado
    .sort(
      (a, b) =>
        b.dias.length - a.dias.length ||
        PESO[b.gravidade] - PESO[a.gravidade] ||
        (a.campo === "titulo" ? -1 : 1) - (b.campo === "titulo" ? -1 : 1) ||
        b.ultimo.localeCompare(a.ultimo),
    )
    .filter((r) => {
      const assinatura = `${r.vezes}|${r.dias.join(",")}|${r.clientes.join(",")}|${r.ultimo}`;
      if (vistos.has(assinatura)) return false;
      vistos.add(assinatura);
      return true;
    });
}

/** Link para a conversa no painel, quando o item tem uma conversa real. */
export function linkDaConversa(clienteSlug: string, identificador: string | null | undefined) {
  if (!identificador || identificador.startsWith("teste:")) return null;
  return `/admin/conversas?cliente=${encodeURIComponent(clienteSlug)}&conversa=${encodeURIComponent(identificador)}`;
}

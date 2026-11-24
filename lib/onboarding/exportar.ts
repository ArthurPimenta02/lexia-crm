/**
 * ETAPA 3 — A PASSAGEM AUTOMÁTICA: o que a cliente respondeu na entrevista vira a base que o agente DELA lê
 * (as 5 tabelas do Supabase do próprio cliente: serviços, info, config, profissionais, promoções).
 *
 * Só lógica (sem base de dados, sem rede). As regras estão em código, seguindo o mapa
 * ~/lexia-memoria/onboarding/mapa_etapa3.md; a IA só entra onde o mapa diz IA (nome em espanhol, apelidos,
 * categoria, separar preparo/cuidados, casar promoções com serviços) e por uma interface injetável: sem chave ou
 * com erro da IA, a conversão continua sem esses campos e nunca falha por isso.
 *
 * As regras do Arthur que este ficheiro guarda:
 *  1. NÃO PERDER NADA — no fim conta-se: cada resposta resolvida da entrevista tem de ter ido parar a uma coluna
 *     ou chave. Se alguma ficar sem destino, a exportação traz o erro com a lista e NÃO grava. Além disso a
 *     ficha inteira (todas as linhas atuais, com estado, fonte e evidência) vai sempre como JSON para a config
 *     (`ficha_onboarding_completa`): mesmo que o mapa esqueça alguma coisa, ela está lá.
 *  2. SÓ ENTRA O QUE A CLIENTE VIU — só linhas `confirmado`/`respondido`. Rascunho não entra; `pulado`/`vago`
 *     ficam como pendência (aviso); `nao_se_aplica` é resolvido mas não escreve nada.
 *  3. CADA CLIENTE É SEPARADO — o sufixo das tabelas sai de um mapa explícito por slug. Cliente sem sufixo
 *     configurado: recusa.
 */
import { montarCaderno, resumir, type ItemDoCaderno, type LinhaDoCaderno } from "./caderno";
import { ESQUEMA_ONBOARDING, type GrupoQueRepete, type SecaoOnboarding } from "./esquema";

// ------------------------------------------------------------------ clientes com base própria

export type ClienteDaExportacao = {
  slug: string;
  /** Sufixo das tabelas na base do cliente (`servicos_<sufixo>`…). */
  sufixo: string;
  /** Os nomes dos serviços já vêm em inglês (do sistema de agendamento): `nome_en` = nome limpo. */
  nomesEmIngles: boolean;
  /** Ficheiro SQL que cria as tabelas (para a mensagem "falta criar as tabelas"). */
  sql: string;
};

/**
 * Mapa EXPLÍCITO slug → sufixo. Um cliente que não está aqui não exporta (não se deduz o sufixo do slug:
 * a Jessica usa `_jessica`, a K-Glow `_kglow`; um palpite errado escrevia em tabelas de outra pessoa).
 */
const CLIENTES: Record<string, Omit<ClienteDaExportacao, "slug">> = {
  kglow_aesthetics: { sufixo: "kglow", nomesEmIngles: true, sql: "supabase/clientes/kglow_tabelas.sql" },
};

export function clienteDaExportacao(slug: string): ClienteDaExportacao | null {
  const c = Object.prototype.hasOwnProperty.call(CLIENTES, slug) ? CLIENTES[slug] : undefined;
  return c ? { slug, ...c } : null;
}

export type NomesDasTabelas = { servicos: string; info: string; config: string; profissionais: string; promocoes: string };
export const tabelasDo = (c: Pick<ClienteDaExportacao, "sufixo">): NomesDasTabelas => ({
  servicos: `servicos_${c.sufixo}`,
  info: `info_${c.sufixo}`,
  config: `config_${c.sufixo}`,
  profissionais: `profissionais_${c.sufixo}`,
  promocoes: `promocoes_${c.sufixo}`,
});

// ------------------------------------------------------------------ as linhas de cada tabela

export type TipoPreco = "fixo" | "a_partir" | "sob_avaliacao" | "por_unidade";
export type ModoPreco = "se_perguntar" | "se_insistir" | "nunca";

/** `undefined` = coluna que a conversão não toca (fica o que estiver na base); `null` = vazia. */
export type LinhaServico = {
  origem_item_id: string;
  nome: string;
  nome_en: string | null;
  nome_es?: string | null;
  aliases?: string[] | null;
  categoria?: string;
  preco: number | null;
  tipo_preco: TipoPreco;
  requer_avaliacao: boolean;
  profissional: string | null;
  duracao_min: number | null;
  descricao: string | null;
  preparo_e_cuidados: string | null;
  preparo_pre?: string | null;
  cuidados_pos?: string | null;
  observacoes: string | null;
  indicacao: string | null;
  contraindicacoes: string | null;
  sessoes: string | null;
  variacao_preco: string | null;
  motivo_avaliacao: string | null;
  modo_preco: ModoPreco;
  proximo_passo: "agendar" | "avaliacao" | "equipe";
  ativo: true;
  precos_por_profissional: null;
  preco_retoque?: number | null;
  dias_retoque?: number | null;
};

export type LinhaChave = { chave: string; valor: string; origem: string; ativo: true };

export type LinhaProfissional = {
  origem_item_id: string;
  nome: string;
  especialidade: string | null;
  horario: Record<string, [string, string]> | null;
  servicos: string[];
  ativo: true;
};

export type LinhaPromocao = {
  origem_item_id: string;
  nome: string;
  campanha?: string | null;
  /** Os serviços da promoção pelo `origem_item_id`: o `id` numérico só se conhece na base, ao gravar. */
  servicos_origem: string[];
  preco_promocional: number | null;
  desconto_percentual: number | null;
  profissional: null;
  condicao: string | null;
  brinde_pt?: string | null;
  brinde_en?: string | null;
  brinde_es?: string | null;
  /** Só na criação (default da base = dia em que foi gravada); nunca se reescreve. */
  inicio: string;
  fim: string | null;
  ate_acabar: boolean;
  apelidos?: string[] | null;
  publico: "todos" | "novos" | "atuais";
  observacoes: string | null;
  ativo: boolean;
};

/** Colunas que a gravação manda à base, por tabela (o resto é só para a prévia). */
export const COLUNAS = {
  servicos: ["origem_item_id", "nome", "nome_en", "nome_es", "aliases", "categoria", "preco", "tipo_preco", "requer_avaliacao", "profissional", "duracao_min", "descricao", "preparo_e_cuidados", "preparo_pre", "cuidados_pos", "observacoes", "indicacao", "contraindicacoes", "sessoes", "variacao_preco", "motivo_avaliacao", "modo_preco", "proximo_passo", "ativo", "precos_por_profissional", "preco_retoque", "dias_retoque"],
  profissionais: ["origem_item_id", "nome", "especialidade", "horario", "servicos", "ativo"],
  promocoes: ["origem_item_id", "nome", "campanha", "preco_promocional", "desconto_percentual", "profissional", "condicao", "brinde_pt", "brinde_en", "brinde_es", "fim", "ate_acabar", "apelidos", "publico", "observacoes", "ativo"],
  chave: ["chave", "valor", "origem", "ativo"],
} as const;

/** Prefixo da coluna `origem` das chaves que esta conversão escreve: só essas podem ser desativadas por ela. */
export const ORIGEM = "onboarding";

// ------------------------------------------------------------------ resultado

export type Pendencia = { campo: string; itemId: string | null; item: string | null; estado: string; valor: unknown };

export type Exportacao = {
  cliente: ClienteDaExportacao;
  tabelas: NomesDasTabelas;
  hoje: string;
  servicos: LinhaServico[];
  info: LinhaChave[];
  config: LinhaChave[];
  profissionais: LinhaProfissional[];
  promocoes: LinhaPromocao[];
  /** Itens removidos no onboarding: na base ficam `ativo=false` (nunca se apaga). */
  removidos: { servicos: string[]; profissionais: string[]; promocoes: string[] };
  /** O preço como o agente o vai dizer, por serviço (origem_item_id). */
  precoFalado: Record<string, string>;
  /** Para onde foi cada resposta resolvida (`item|campo` → destinos). */
  destinos: Record<string, string[]>;
  /** Respostas resolvidas sem destino: se houver alguma, NÃO se grava. */
  semDestino: Pendencia[];
  /** Respostas que já não se aplicam (a pergunta de que dependiam mudou): ficam só na ficha completa. */
  foraDeUso: Pendencia[];
  /** Pulado ou vago: ficaram para a equipe da Lexia. */
  pendencias: Pendencia[];
  /** Obrigatórios que ainda não estão resolvidos (a entrevista não acabou). */
  faltamObrigatorios: Pendencia[];
  contagem: { linhas: number; resolvidas: number; comDestino: number; rascunho: number; naoSeAplica: number; deItensRemovidos: number };
  erros: string[];
  avisos: string[];
  ia: { usada: boolean; erro?: string };
};

// ------------------------------------------------------------------ a IA (injetável)

export type PedidoServicoIa = { id: string; nome: string; descricao: string | null; preparo_e_cuidados: string | null };
export type RespostaServicoIa = { id: string; nome_es?: string | null; aliases?: string[] | null; categoria?: string | null; preparo_pre?: string | null; cuidados_pos?: string | null };
export type PedidoPromocaoIa = { id: string; nome: string; condicao: string | null };
export type RespostaPromocaoIa = { id: string; campanha?: string | null; servico_ids?: string[] | null; brinde_pt?: string | null; brinde_en?: string | null; brinde_es?: string | null; apelidos?: string[] | null };

export interface IaDaExportacao {
  servicos(itens: PedidoServicoIa[]): Promise<RespostaServicoIa[]>;
  promocoes(pedido: { promocoes: PedidoPromocaoIa[]; catalogo: { id: string; nome: string }[] }): Promise<RespostaPromocaoIa[]>;
}

/** As categorias que a IA pode escolher (código → título legível, que é o que se grava). */
export const CATEGORIAS: Record<string, string> = {
  injetaveis: "Injetáveis (toxina)",
  preenchimento: "Preenchimento",
  microagulhamento: "Microagulhamento",
  peeling: "Peeling",
  facial: "Facial",
  soro_iv: "Soro na veia (IV)",
  vitaminas: "Vitaminas injetáveis",
  laser_depilacao: "Depilação a laser",
  cabelo_prp: "Cabelo (PRP)",
  avaliacao: "Avaliação",
  outros: "Outros",
};

// ------------------------------------------------------------------ regras de conversão (puras, exportadas para teste)

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();
export const semEmojis = (s: string) => espacos(s.replace(EMOJI, " "));

/** Nome do serviço sem emojis; os que são frases (mais de 60 letras) cortam-se no primeiro "…" ou "(". */
export function limparNomeDoServico(bruto: string): { nome: string; original: string | null } {
  const limpo = semEmojis(bruto);
  if (limpo.length <= 60) return { nome: limpo, original: null };
  const cortes = [limpo.indexOf("..."), limpo.indexOf("…"), limpo.indexOf(" (")].filter((i) => i >= 5);
  if (!cortes.length) return { nome: limpo, original: null };
  const curto = limpo.slice(0, Math.min(...cortes)).replace(/[\s\-–—,:;]+$/, "").trim();
  return curto.length >= 5 ? { nome: curto, original: limpo } : { nome: limpo, original: null };
}

/** "210", "1,100", "1.100", "US$ 9,50" → número. Ilegível → null. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/US\$|R\$|\$|usd|dólares?|dolares?/gi, "").replace(/\s/g, "");
  const m = s.match(/\d[\d.,]*/);
  if (!m) return null;
  s = m[0].replace(/[.,]$/, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Duração em minutos: "45 min" → 45 · "1h" → 60 · "1h10" → 70 · "1h30" → 90 · "30–45 min" → 45 (o maior).
 * `exato=false` quando houve escolha (intervalo) ou o texto não dá um número seguro ("menos de 30 minutos" → null).
 */
export function minutos(texto: unknown): { min: number | null; exato: boolean } {
  if (typeof texto === "number") return { min: Math.round(texto), exato: true };
  if (typeof texto !== "string" || !texto.trim()) return { min: null, exato: false };
  const t = texto.toLowerCase().replace(/[–—]/g, "-").trim();
  if (/menos de|até|ate |less than|under|mais de|more than|varia/.test(t)) return { min: null, exato: false };
  const partes = t.split(/\s*(?:-|\ba\b|\bto\b|\bou\b|\bor\b)\s*/).filter((p) => /\d/.test(p));
  if (!partes.length) return { min: null, exato: false };
  const horasNoFim = /\d\s*h/.test(partes[partes.length - 1]);
  const valores = partes.map((p) => {
    const h = p.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?|rs?|ours?)?\s*(?:e\s*)?(\d{1,2})?/);
    if (h) return Math.round(Number(h[1].replace(",", ".")) * 60) + (h[2] ? Number(h[2]) : 0);
    const n = p.match(/(\d+)/);
    if (!n) return null;
    return /min/.test(p) || !horasNoFim ? Number(n[1]) : Number(n[1]) * 60;
  });
  const bons = valores.filter((v): v is number => v !== null && v > 0);
  if (!bons.length) return { min: null, exato: false };
  return { min: Math.max(...bons), exato: bons.length === 1 };
}

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const DIA_EXTENSO: Record<string, string> = { Seg: "segunda", Ter: "terça", Qua: "quarta", Qui: "quinta", Sex: "sexta", Sáb: "sábado", Dom: "domingo" };
type Horario = Record<string, [string, string]>;

/** `{"Seg":["10:00","16:00"]…}` → "segunda 10:00–16:00; …. Fechado: domingo." */
export function horarioPorExtenso(horario: Horario | null, dias: string[] | null): string {
  const h = horario ?? {};
  const abertos = DIAS.filter((d) => h[d] || dias?.includes(d));
  const partes = abertos.map((d) => (h[d] ? `${DIA_EXTENSO[d]} ${h[d][0]}–${h[d][1]}` : `${DIA_EXTENSO[d]} (horário não informado)`));
  const fechados = DIAS.filter((d) => !abertos.includes(d)).map((d) => DIA_EXTENSO[d]);
  return `${partes.join("; ")}.${fechados.length ? ` Fechado: ${fechados.join(", ")}.` : ""}`;
}

/** `{"Seg":[…]}` → `{"1":[…]}` (1 = segunda … 7 = domingo, como na base da Jessica). */
export const horarioNumerado = (h: Horario): Horario => Object.fromEntries(DIAS.filter((d) => h[d]).map((d) => [String(DIAS.indexOf(d) + 1), h[d]]));

/** Site sem parâmetros de rastreio (`utm_*`, `fbclid`, `gclid`, `igshid`). */
export function siteLimpo(url: string): string {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|igshid$|mc_|_hs)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, "");
  } catch {
    return url.trim();
  }
}

const dinheiro = (n: number) => `US$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;

/** O preço como o agente o vai dizer (para a prévia: o que a cliente final vai ler). */
export function precoFalado(s: Pick<LinhaServico, "preco" | "tipo_preco" | "modo_preco" | "variacao_preco">): string {
  if (s.modo_preco === "nunca") return "não diz o preço (encaminha para avaliação ou equipe)";
  const quando = s.modo_preco === "se_perguntar" ? " (só se perguntarem)" : "";
  if (s.tipo_preco === "sob_avaliacao") return `sob avaliação, sem preço fechado${quando}`;
  if (s.preco === null) return "SEM PREÇO na ficha";
  if (s.preco === 0) return `gratuita${quando}`;
  if (s.tipo_preco === "a_partir") return `a partir de ${dinheiro(s.preco)}${quando}`;
  if (s.tipo_preco === "por_unidade") return `${dinheiro(s.preco)} por unidade${quando}`;
  return `${dinheiro(s.preco)}${quando}`;
}

const CONSULTA = /^(free\s+|complimentary\s+)?(consultation|consulta|avalia[çc][ãa]o|evaluation)\b/i;
const OUTRO = /^outr[oa]$/i;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && v !== null && !Object.keys(v).length);
const chave = (campo: string, item: string | null) => `${item ?? ""}|${campo}`;
const IDIOMA: Record<string, string> = { português: "pt", portugues: "pt", inglês: "en", ingles: "en", english: "en", espanhol: "es", español: "es", spanish: "es" };

// ------------------------------------------------------------------ o leitor das respostas

const RESOLVIDAS = new Set(["confirmado", "respondido"]);

/** Lê as respostas resolvidas e anota para onde cada uma foi: é a contagem anti-perda. */
class Leitor {
  readonly destinos: Record<string, string[]> = {};
  private readonly porChave: Map<string, LinhaDoCaderno>;
  constructor(
    linhas: LinhaDoCaderno[],
    private readonly aplicaveis: Set<string>,
  ) {
    this.porChave = new Map(linhas.map((l) => [chave(l.campo, l.item_id), l]));
  }
  /** A resposta resolvida de um campo, marcada como levada para `destino`. `undefined` se não há. */
  v(campo: string, destino: string, item: string | null = null): unknown {
    const k = chave(campo, item);
    const l = this.porChave.get(k);
    if (!l || !RESOLVIDAS.has(l.estado) || !this.aplicaveis.has(k) || vazio(l.valor)) return undefined;
    const lista = (this.destinos[k] ??= []);
    if (!lista.includes(destino)) lista.push(destino);
    return l.valor;
  }
  /** Radio/select com "Outro": devolve "Outro: <texto>" no lugar de "Outro". */
  comOutro(campo: string, outro: string, destino: string, item: string | null = null): string | null {
    const v = this.v(campo, destino, item);
    if (v === undefined) return null;
    if (Array.isArray(v)) return this.listaComOutro(campo, outro, destino, item)?.join(", ") ?? null;
    const s = String(v);
    if (OUTRO.test(s)) {
      const o = texto(this.v(outro, destino, item));
      return o ? `Outro: ${o}` : s;
    }
    return s;
  }
  listaComOutro(campo: string, outro: string, destino: string, item: string | null = null): string[] | null {
    const v = this.v(campo, destino, item);
    if (v === undefined) return null;
    const l = lista(v);
    if (!l.some((x) => OUTRO.test(x))) return l;
    const o = texto(this.v(outro, destino, item));
    return l.map((x) => (OUTRO.test(x) ? (o ? `Outro: ${o}` : x) : x));
  }
}

// ------------------------------------------------------------------ a conversão

export type EntradaDaExportacao = {
  clienteSlug: string;
  linhas: LinhaDoCaderno[];
  itens: ItemDoCaderno[];
  /** Notas e links da Etapa 1 (o link de reserva do Moxie vem daqui). */
  etapa1?: { notas?: string; site?: string } | null;
  /** AAAA-MM-DD, no fuso do negócio. */
  hoje: string;
  agora?: string;
  esquema?: SecaoOnboarding[];
};

/** A conversão inteira, com a IA quando há (sem ela, continua sem os campos de IA). */
export async function exportar(entrada: EntradaDaExportacao, ia?: IaDaExportacao | null): Promise<Exportacao> {
  const ex = converter(entrada);
  if (!ia) {
    ex.avisos.push("Sem IA: nome em espanhol, apelidos, categoria, preparo/cuidados separados e serviços das promoções ficam por preencher (o resto grava normalmente).");
    return ex;
  }
  ex.ia.usada = true;
  await enriquecerComIa(ex, ia);
  return ex;
}

/** A parte só de regras (sem IA). Lança só se o cliente não tiver base configurada. */
export function converter(entrada: EntradaDaExportacao): Exportacao {
  const cliente = clienteDaExportacao(entrada.clienteSlug);
  if (!cliente) throw new Error(`O cliente "${entrada.clienteSlug}" não tem tabelas configuradas para a passagem automática.`);
  const esquema = entrada.esquema ?? ESQUEMA_ONBOARDING;
  const { linhas, itens } = entrada;
  const caderno = montarCaderno(linhas, itens, esquema);
  const aplicaveis = new Set(caderno.map((c) => chave(c.campo.chave, c.itemId)));
  const L = new Leitor(linhas, aplicaveis);
  const erros: string[] = [];
  const avisos: string[] = [];

  const ativos = (g: GrupoQueRepete) => itens.filter((i) => i.grupo === g && !i.removido).sort((a, b) => a.ordem - b.ordem);
  const removidosDe = (g: GrupoQueRepete) => itens.filter((i) => i.grupo === g && i.removido).map((i) => i.id);

  const info: LinhaChave[] = [];
  const config: LinhaChave[] = [];
  const por = (destino: LinhaChave[], k: string, valor: string | null | undefined, origem: string) => {
    if (valor === null || valor === undefined || !String(valor).trim()) return;
    const existente = destino.find((x) => x.chave === k);
    if (existente) {
      erros.push(`Chave repetida "${k}" (${origem} e ${existente.origem}): a segunda apagaria a primeira.`);
      return;
    }
    destino.push({ chave: k, valor: String(valor), origem: `${ORIGEM}:${origem}`, ativo: true });
  };
  const I = (k: string, valor: string | null | undefined, origem: string) => por(info, k, valor, origem);
  const C = (k: string, valor: string | null | undefined, origem: string) => por(config, k, valor, origem);
  const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
  const ti = (k: string) => `info_${cliente.sufixo}:${k}`;
  const tc = (k: string) => `config_${cliente.sufixo}:${k}`;

  // ---------------------------------------------------------------- serviços
  const nomesDosServicos = new Map<string, { original: string; limpo: string }>();
  for (const item of ativos("servicos")) {
    const bruto = texto(linhas.find((l) => l.item_id === item.id && l.campo === "nome" && RESOLVIDAS.has(l.estado))?.valor);
    if (bruto) nomesDosServicos.set(item.id, { original: bruto, limpo: limparNomeDoServico(bruto).nome });
  }
  const acharServico = (nome: string): string | null => {
    const n = semEmojis(nome).toLowerCase();
    for (const [id, s] of nomesDosServicos) if (s.original === nome || s.limpo.toLowerCase() === n || semEmojis(s.original).toLowerCase() === n) return id;
    return null;
  };

  // Que serviços pedem consulta antes (pergunta de 24/11).
  const comConsulta = new Set<string>();
  const consultaAntes = lista(L.v("servicos_com_consulta_antes", `servicos_${cliente.sufixo}.requer_avaliacao`));
  if (consultaAntes.length) L.v("servicos_com_consulta_antes", ti("serviços que pedem consulta antes"));
  for (const nome of consultaAntes) {
    const id = acharServico(nome);
    if (id) comConsulta.add(id);
    else avisos.push(`"Precisa de consulta antes": o serviço "${nome}" não está na lista de serviços (fica só no texto da info).`);
  }
  I("serviços que pedem consulta antes", consultaAntes.join(", "), "servicos_com_consulta_antes");

  // Quem faz cada serviço: a lista "serviços que atende" de cada profissional, ao contrário.
  const profs = ativos("profissionais");
  const quemFaz = new Map<string, string[]>();
  const nomeDoProf = new Map<string, string>();
  for (const p of profs) {
    const nome = texto(L.v("nome", `profissionais_${cliente.sufixo}.nome`, p.id));
    if (!nome) continue;
    nomeDoProf.set(p.id, nome);
    for (const s of lista(L.v("servicos_que_atende", `profissionais_${cliente.sufixo}.servicos + servicos_${cliente.sufixo}.profissional`, p.id))) {
      const id = acharServico(s);
      if (!id) {
        avisos.push(`${nome}: o serviço "${s}" da lista de quem faz o quê não está na lista de serviços.`);
        continue;
      }
      quemFaz.set(id, [...(quemFaz.get(id) ?? []), nome]);
    }
  }
  const unicaProf = nomeDoProf.size === 1 ? [...nomeDoProf.values()][0] : null;

  // Avaliação (para a linha da consulta e para a info).
  const ts = `servicos_${cliente.sufixo}`;
  const avaliacaoPaga = texto(L.v("avaliacao_paga", ti("avaliação")));
  const valorAvaliacao = numero(L.v("valor_da_avaliacao", ti("avaliação") + " + " + ti("valor_avaliacao")));
  const duracaoAvaliacao = L.v("duracao_da_avaliacao", ti("avaliação") + " + " + tc("duracao_avaliacao_min"));
  const minAvaliacao = minutos(duracaoAvaliacao).min;
  const precoDaConsulta = avaliacaoPaga === "Gratuita" ? 0 : avaliacaoPaga === "Paga" ? valorAvaliacao : null;
  const naoPodeMinimo = texto(L.v("pode_informar_preco_minimo", `${ti("pode informar preço mínimo")} + ${ts}.modo_preco`)) === "Não";

  const servicos: LinhaServico[] = [];
  const falado: Record<string, string> = {};
  for (const item of ativos("servicos")) {
    const id = item.id;
    const bruto = texto(L.v("nome", `${ts}.nome`, id));
    if (!bruto) {
      avisos.push(`Serviço nº ${item.ordem + 1} sem nome confirmado: não entra.`);
      continue;
    }
    const { nome, original } = limparNomeDoServico(bruto);
    const obs: string[] = [];
    if (original) obs.push(`Nome completo: ${original}`);
    const consulta = CONSULTA.test(nome);

    const tipo = texto(L.v("tipo_de_preco", `${ts}.tipo_preco`, id));
    const outroTipo = texto(L.v("outro_tipo_de_preco", `${ts}.tipo_preco + ${ts}.observacoes`, id));
    const valor = L.v("valor", `${ts}.preco`, id);
    let tipoPreco: TipoPreco = "fixo";
    let preco: number | null = numero(valor);
    if (valor !== undefined && preco === null) erros.push(`${nome}: preço ilegível ("${String(valor)}").`);
    if (tipo === "A partir de (preço mínimo)") tipoPreco = "a_partir";
    else if (tipo?.startsWith("Por unidade")) tipoPreco = "por_unidade";
    else if (tipo?.startsWith("Sob orçamento")) {
      tipoPreco = "sob_avaliacao";
      preco = null;
    } else if (tipo && OUTRO.test(tipo)) {
      if (outroTipo) obs.push(`Tipo de preço dito: ${outroTipo}`);
      if (consulta) {
        // A consulta segue a resposta da avaliação (abaixo).
      } else if (outroTipo && /unidade|\bunits?\b/i.test(outroTipo)) {
        tipoPreco = "por_unidade";
        preco = numero(outroTipo) ?? preco;
        if (preco === null) erros.push(`${nome}: preço por unidade sem número ("${outroTipo}").`);
      } else {
        erros.push(`${nome}: tipo de preço "Outro" (${outroTipo ?? "sem texto"}) — escolher na revisão: fixo, a partir de, por unidade ou sob orçamento.`);
      }
    }
    if (consulta && avaliacaoPaga && avaliacaoPaga !== "Não tem avaliação" && avaliacaoPaga !== "Depende do serviço") {
      tipoPreco = "fixo";
      preco = precoDaConsulta;
      L.v("avaliacao_paga", `${ts}.preco (${nome})`);
    }

    const dur = L.v("duracao_media", `${ts}.duracao_min`, id);
    let duracao = minutos(dur);
    if (consulta && minAvaliacao) duracao = { min: Math.max(minAvaliacao, duracao.min ?? 0), exato: true };
    if (dur !== undefined && !duracao.exato) obs.push(`Duração dita: ${String(dur)}${duracao.min === null ? " (sem número seguro: confirmar no sistema de agenda)" : ` (usado o maior: ${duracao.min} min)`}`);
    if (dur !== undefined && duracao.min === null) avisos.push(`${nome}: duração "${String(dur)}" sem número seguro — preencher à mão (ex.: do Moxie).`);

    const variacao = [texto(L.v("variacao_de_preco", `${ts}.variacao_preco`, id)), texto(L.v("faixa_de_preco", `${ts}.variacao_preco`, id))];
    const requer = !consulta && (tipoPreco === "sob_avaliacao" || comConsulta.has(id));
    const linha: LinhaServico = {
      origem_item_id: id,
      nome,
      nome_en: cliente.nomesEmIngles ? nome : null,
      ...(consulta ? { categoria: CATEGORIAS.avaliacao } : {}),
      preco,
      tipo_preco: tipoPreco,
      requer_avaliacao: requer,
      profissional: (quemFaz.get(id) ?? (unicaProf ? [unicaProf] : [])).join(", ") || null,
      duracao_min: duracao.min,
      descricao: texto(L.v("descricao_e_indicacao", `${ts}.descricao`, id)),
      preparo_e_cuidados: texto(L.v("preparo_e_cuidados", `${ts}.preparo_e_cuidados (IA separa em preparo_pre/cuidados_pos)`, id)),
      observacoes: null,
      indicacao: texto(L.v("para_quem_indicar", `${ts}.indicacao`, id)),
      contraindicacoes: texto(L.v("contraindicacoes", `${ts}.contraindicacoes`, id)),
      sessoes: texto(L.v("numero_de_sessoes", `${ts}.sessoes`, id)),
      variacao_preco: variacao[0] && variacao[1] ? `${variacao[0]}\nFaixa: ${variacao[1]}` : variacao[1] ? `Faixa: ${variacao[1]}` : variacao[0],
      motivo_avaliacao: texto(L.v("motivo_da_avaliacao", `${ts}.motivo_avaliacao`, id)),
      modo_preco: naoPodeMinimo && tipoPreco === "a_partir" ? "nunca" : "se_perguntar",
      proximo_passo: requer ? "avaliacao" : "agendar",
      ativo: true,
      precos_por_profissional: null,
    };
    linha.observacoes = obs.length ? obs.join("\n") : null;
    servicos.push(linha);
    falado[id] = precoFalado(linha);
  }
  const repetidos = servicos.map((s) => s.nome.toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i);
  for (const n of new Set(repetidos)) erros.push(`Dois serviços com o mesmo nome "${n}": a base exige nomes diferentes. Renomear um na revisão.`);

  // Retoque cobrado à parte (24/11): o texto vai inteiro para a info; o preço/dias só com regra segura.
  const retoque = texto(L.v("retoque_cobrado", ti("retoque cobrado à parte")));
  I("retoque cobrado à parte", retoque, "retoque_cobrado");
  if (retoque && !/^(n[ãa]o|nenhum|no\b|none)/i.test(retoque)) {
    const citados = servicos.filter((s) => retoque.toLowerCase().includes(s.nome.toLowerCase()));
    const valores = [...retoque.matchAll(/(?:US\$|\$)\s?(\d[\d.,]*)/gi)].map((m) => numero(m[1]));
    const dias = [...retoque.matchAll(/(\d+)\s*(?:dias|days)/gi)].map((m) => Number(m[1]));
    if (citados.length === 1 && valores.length === 1 && valores[0] !== null && dias.length <= 1) {
      citados[0].preco_retoque = valores[0];
      citados[0].dias_retoque = dias[0] ?? null;
    } else {
      avisos.push("Retoque cobrado à parte: o texto foi guardado na info, mas não deu para tirar preço e prazo com segurança — preencher preco_retoque/dias_retoque à mão se for preciso.");
    }
  }

  // ---------------------------------------------------------------- profissionais
  const tp = `profissionais_${cliente.sufixo}`;
  const horarioDoNegocio = L.v("horario_por_dia", `${ti("horário de funcionamento")} + ${tc("horario_por_dia")}`) as Horario | undefined;
  const diasDoNegocio = lista(L.v("dias_de_funcionamento", `${ti("horário de funcionamento")} + ${tc("dias_de_funcionamento")}`));
  const profissionais: LinhaProfissional[] = [];
  for (const p of profs) {
    const nome = nomeDoProf.get(p.id);
    if (!nome) {
      avisos.push(`Profissional nº ${p.ordem + 1} sem nome confirmado: não entra.`);
      continue;
    }
    const proprio = L.v("horario_do_profissional", `${tp}.horario`, p.id) as Horario | undefined;
    const horario = proprio ?? (profs.length === 1 && horarioDoNegocio ? horarioDoNegocio : undefined);
    profissionais.push({
      origem_item_id: p.id,
      nome,
      especialidade: texto(L.v("especialidade", `${tp}.especialidade`, p.id)),
      horario: horario ? horarioNumerado(horario) : null,
      servicos: servicos.filter((s) => (quemFaz.get(s.origem_item_id) ?? (unicaProf ? [unicaProf] : [])).includes(nome)).map((s) => s.nome),
      ativo: true,
    });
  }

  // ---------------------------------------------------------------- promoções
  const tpr = `promocoes_${cliente.sufixo}`;
  const promocoes: LinhaPromocao[] = [];
  const PUBLICO: Record<string, LinhaPromocao["publico"]> = { "Só para clientes novas": "novos", "Só para quem já é cliente": "atuais", "Para todas": "todos" };
  for (const p of ativos("promocoes")) {
    const nomeBruto = texto(L.v("nome", `${tpr}.nome`, p.id));
    if (!nomeBruto) {
      avisos.push(`Promoção nº ${p.ordem + 1} sem nome confirmado: não entra.`);
      continue;
    }
    const nome = semEmojis(nomeBruto);
    const condicao = texto(L.v("condicao", `${tpr}.condicao (+ preço, desconto)`, p.id));
    const obs: string[] = [];
    const m = condicao?.match(/(?:pacote por|por apenas|por|for just|for only|for|just|only)\s*(?:US\$|\$)\s?(\d[\d.,]*)/i);
    const preco = m ? numero(m[1]) : null;
    if (preco !== null && condicao && /\/\s?unit|por unidade|per unit/i.test(condicao)) obs.push("Preço promocional por unidade.");
    const pct = preco === null ? condicao?.match(/(\d{1,2}(?:[.,]\d+)?)\s?%\s?(?:off|de desconto|desconto)/i) : null;
    const desconto = pct ? numero(pct[1]) : null;
    const tipoValidade = texto(L.v("tipo_de_validade", `${tpr}.fim/ate_acabar`, p.id));
    const validade = texto(L.v("validade", `${tpr}.fim`, p.id));
    const fim = tipoValidade === "Data" && validade && /^\d{4}-\d{2}-\d{2}/.test(validade) ? validade.slice(0, 10) : null;
    const ateAcabar = tipoValidade === "Até acabar";
    if (tipoValidade === "Data" && !fim) erros.push(`Promoção "${nome}": validade "${validade ?? ""}" não é uma data (AAAA-MM-DD).`);
    if (!fim && !ateAcabar) erros.push(`Promoção "${nome}": sem data de fim nem "até acabar" (a base exige um dos dois).`);
    const publico = PUBLICO[texto(L.v("para_quem_vale", `${tpr}.publico`, p.id)) ?? ""];
    if (!publico) avisos.push(`Promoção "${nome}": sem "para quem vale" — gravada como "todos".`);
    promocoes.push({
      origem_item_id: p.id,
      nome,
      servicos_origem: [],
      preco_promocional: preco,
      desconto_percentual: desconto !== null && desconto > 0 && desconto < 100 ? desconto : null,
      profissional: null,
      condicao,
      inicio: entrada.hoje,
      fim,
      ate_acabar: ateAcabar,
      publico: publico ?? "todos",
      observacoes: obs.length ? obs.join("\n") : null,
      ativo: ateAcabar || (fim !== null && fim >= entrada.hoje),
    });
  }

  // ---------------------------------------------------------------- info (cada linha entra inteira no prompt do agente)
  I("nome do negócio", texto(L.v("nome_do_negocio", ti("nome do negócio"))), "nome_do_negocio");
  I("nome da assistente", texto(L.v("nome_do_agente", ti("nome da assistente"))), "nome_do_agente");
  I("responsável", texto(L.v("nome_do_responsavel", ti("responsável"))), "nome_do_responsavel");
  I("endereço", texto(L.v("endereco_completo", ti("endereço"))), "endereco_completo");
  I("estacionamento e acesso", texto(L.v("estacionamento_ou_acesso", ti("estacionamento e acesso"))), "estacionamento_ou_acesso");
  const site = texto(L.v("website", ti("site")));
  I("site", site ? siteLimpo(site) : null, "website");
  I("instagram", texto(L.v("instagram", ti("instagram"))), "instagram");
  const fuso = texto(L.v("fuso_horario", `${ti("fuso horário")} + ${tc("fuso_horario")}`));
  I("fuso horário", fuso, "fuso_horario");
  const idiomas = lista(L.v("idiomas", `${ti("idiomas")} + ${tc("idiomas")}`));
  const idiomaPadrao = texto(L.v("idioma_padrao", `${ti("idiomas")} + ${tc("idioma_padrao")}`));
  I("idiomas", idiomas.length || idiomaPadrao ? `${idiomas.join(", ")}${idiomaPadrao ? `. Padrão: ${idiomaPadrao}` : ""}` : null, "idiomas+idioma_padrao");
  I("horário de funcionamento", horarioDoNegocio || diasDoNegocio.length ? horarioPorExtenso(horarioDoNegocio ?? null, diasDoNegocio) : null, "dias_de_funcionamento+horario_por_dia");
  I("só com horário marcado", texto(L.v("somente_horario_marcado", ti("só com horário marcado"))), "somente_horario_marcado");
  const fechamentos = texto(L.v("fechamentos_programados", `${ti("fechamentos programados")} + ${tc("fechamentos_programados")}`));
  I("fechamentos programados", fechamentos, "fechamentos_programados");
  const pagamentos = L.listaComOutro("formas_de_pagamento", "outro_pagamento", ti("formas de pagamento"));
  I("formas de pagamento", pagamentos?.join(", "), "formas_de_pagamento");
  I("chaves de pagamento", texto(L.v("chaves_e_links_de_pagamento", ti("chaves de pagamento"))), "chaves_e_links_de_pagamento");
  const parcelamento = texto(L.v("parcelamento", ti("parcelamento")));
  const condParc = texto(L.v("condicoes_de_parcelamento", ti("parcelamento")));
  I("parcelamento", parcelamento ? `${parcelamento}${condParc ? `. ${condParc}` : ""}` : condParc, "parcelamento+condicoes_de_parcelamento");
  const sinal = texto(L.v("sinal_antecipado", ti("sinal antecipado")));
  const sinalDet = texto(L.v("sinal_detalhes", ti("sinal antecipado")));
  I("sinal antecipado", sinal ? `${sinal}${sinalDet ? `: ${sinalDet}` : ""}` : sinalDet, "sinal_antecipado+sinal_detalhes");
  I("política de cancelamento", texto(L.v("politica_de_cancelamento", ti("política de cancelamento"))), "politica_de_cancelamento");

  const porServico = texto(L.v("avaliacao_por_servico", ti("avaliação")));
  const viraCredito = texto(L.v("avaliacao_vira_credito", ti("avaliação")));
  if (avaliacaoPaga || porServico || valorAvaliacao !== null || duracaoAvaliacao !== undefined || viraCredito) {
    const partes = [
      avaliacaoPaga === "Paga" && valorAvaliacao !== null ? `Paga: ${dinheiro(valorAvaliacao)}` : avaliacaoPaga,
      porServico ? `por serviço: ${porServico}` : null,
      avaliacaoPaga !== "Paga" && valorAvaliacao !== null ? `valor: ${dinheiro(valorAvaliacao)}` : null,
      duracaoAvaliacao !== undefined ? String(duracaoAvaliacao) : null,
      viraCredito === "Sim" ? "o valor vira crédito no procedimento" : viraCredito === "Não" ? "o valor não vira crédito" : null,
    ].filter(Boolean);
    I("avaliação", partes.join(", "), "avaliacao_paga+avaliacao_por_servico+valor_da_avaliacao+duracao_da_avaliacao+avaliacao_vira_credito");
  }
  // A única chave lida pelo código da Lexie: só o número.
  I("valor_avaliacao", avaliacaoPaga === "Gratuita" ? "0" : valorAvaliacao !== null ? String(valorAvaliacao) : null, "valor_da_avaliacao");

  I("serviço porta de entrada", texto(L.v("servico_porta_de_entrada", ti("serviço porta de entrada"))), "servico_porta_de_entrada");
  I("sempre fazer", texto(L.v("sempre_fazer", ti("sempre fazer"))), "sempre_fazer");
  I("nunca fazer", texto(L.v("nunca_fazer", ti("nunca fazer"))), "nunca_fazer");
  I("público", texto(L.v("cliente_ideal", ti("público"))), "cliente_ideal");
  I("posicionamento", L.comOutro("posicionamento", "outro_posicionamento", ti("posicionamento")), "posicionamento");
  I("perfil de venda", L.comOutro("perfil_de_venda", "outro_perfil_de_venda", ti("perfil de venda")), "perfil_de_venda");
  I("serviços prioritários", texto(L.v("servicos_prioritarios", ti("serviços prioritários"))), "servicos_prioritarios");
  for (const n of [1, 2, 3]) I(`diferencial ${n}`, texto(L.v(`diferencial_${n}`, ti(`diferencial ${n}`))), `diferencial_${n}`);
  I("resposta ao preço", L.comOutro("resposta_ao_preco", "outro_resposta_ao_preco", ti("resposta ao preço")), "resposta_ao_preco");
  const podeMinimo = texto(L.v("pode_informar_preco_minimo", ti("pode informar preço mínimo")));
  I("pode informar preço mínimo", podeMinimo, "pode_informar_preco_minimo");
  const desconto = L.comOutro("pedidos_de_desconto", "outro_pedidos_de_desconto", ti("pedidos de desconto"));
  const descontoPct = texto(L.v("desconto_percentual", ti("pedidos de desconto")));
  I("pedidos de desconto", desconto ? (descontoPct ? desconto.replace("___", descontoPct) : desconto) : null, "pedidos_de_desconto+desconto_percentual");
  I("se acharem caro", texto(L.v("se_acharem_caro", ti("se acharem caro"))), "se_acharem_caro");
  const concorrentes = texto(L.v("comparacao_concorrentes", ti("comparação com concorrentes")));
  const textoConc = texto(L.v("texto_concorrentes", ti("comparação com concorrentes")));
  I("comparação com concorrentes", concorrentes === "Texto próprio" && textoConc ? textoConc : concorrentes, "comparacao_concorrentes+texto_concorrentes");
  I("perfis a filtrar", texto(L.v("perfis_a_filtrar", ti("perfis a filtrar"))), "perfis_a_filtrar");
  I("saúde e gravidez", L.comOutro("saude_e_gravidez", "outro_saude_e_gravidez", ti("saúde e gravidez")), "saude_e_gravidez");
  const sobreIa = texto(L.v("resposta_sobre_ia", ti("se perguntarem se é IA")));
  const textoIa = texto(L.v("texto_sobre_ia", ti("se perguntarem se é IA")));
  I("se perguntarem se é IA", sobreIa === "Texto próprio" && textoIa ? textoIa : sobreIa, "resposta_sobre_ia+texto_sobre_ia");
  I("mencionar promoções", L.comOutro("mencionar_promocoes", "outro_mencionar_promocoes", ti("mencionar promoções")), "mencionar_promocoes");
  const tom = [
    L.listaComOutro("tom_das_mensagens", "outro_tom_das_mensagens", ti("tom"))?.join(", "),
    L.comOutro("forma_de_tratamento", "outro_forma_de_tratamento", ti("tom")),
    L.comOutro("emojis", "outro_emojis", ti("tom")),
    L.comOutro("tamanho_das_mensagens", "outro_tamanho_das_mensagens", ti("tom")),
  ];
  const rotulos = ["Tom", "Tratamento", "Emojis", "Mensagens"];
  I("tom", tom.map((t, i) => (t ? `${rotulos[i]}: ${t}` : null)).filter(Boolean).join(". "), "tom_das_mensagens+forma_de_tratamento+emojis+tamanho_das_mensagens");
  I("expressões do negócio", texto(L.v("expressoes_do_negocio", ti("expressões do negócio"))), "expressoes_do_negocio");
  I("a evitar", texto(L.v("expressoes_proibidas", ti("a evitar"))), "expressoes_proibidas");
  I("mensagem de boas-vindas", texto(L.v("mensagem_de_boas_vindas", ti("mensagem de boas-vindas"))), "mensagem_de_boas_vindas");
  const handoff = texto(L.v("mensagem_de_handoff", ti("mensagem ao passar para a equipe")));
  const textoHandoff = texto(L.v("texto_de_handoff", ti("mensagem ao passar para a equipe")));
  I("mensagem ao passar para a equipe", handoff === "Texto próprio" && textoHandoff ? textoHandoff : handoff, "mensagem_de_handoff+texto_de_handoff");
  I("passar para a equipe quando", L.listaComOutro("situacoes_de_handoff", "outra_situacao", ti("passar para a equipe quando"))?.join(", "), "situacoes_de_handoff");
  I("agenda cheia e pressa", L.comOutro("agenda_cheia_e_pressa", "outro_agenda_cheia_e_pressa", ti("agenda cheia e pressa")), "agenda_cheia_e_pressa");
  I("fora do horário", L.comOutro("atendimento_fora_do_horario", "outro_atendimento_fora_do_horario", ti("fora do horário")), "atendimento_fora_do_horario");
  I("informações adicionais", texto(L.v("informacoes_adicionais", ti("informações adicionais"))), "informacoes_adicionais");
  const semFollow = texto(L.v("clientes_sem_follow_up", `${ti("clientes sem follow-up")} + ${tc("clientes_sem_follow_up")}`));
  I("clientes sem follow-up", semFollow, "clientes_sem_follow_up");

  const faqs = ativos("faqs");
  let nf = 0;
  for (const f of faqs) {
    const pergunta = texto(L.v("pergunta", ti("FAQ"), f.id));
    const resposta = texto(L.v("resposta", ti("FAQ"), f.id));
    if (!pergunta || !resposta) continue;
    I(`FAQ ${String(++nf).padStart(2, "0")}: ${semEmojis(pergunta)}`, resposta, `faqs:${f.id}`);
  }
  let no = 0;
  for (const o of ativos("objecoes")) {
    const objecao = texto(L.v("objecao", ti("objeção"), o.id));
    const resposta = texto(L.v("como_responder", ti("objeção"), o.id));
    if (!objecao || !resposta) continue;
    I(`objeção ${String(++no).padStart(2, "0")}: ${semEmojis(objecao)}`, resposta, `objecoes:${o.id}`);
  }

  // ---------------------------------------------------------------- config (o valor como respondido; listas em JSON)
  C("whatsapp_do_responsavel", texto(L.v("whatsapp_do_responsavel", tc("whatsapp_do_responsavel"))), "whatsapp_do_responsavel");
  C("whatsapp_do_agente", texto(L.v("whatsapp_do_agente", tc("whatsapp_do_agente"))), "whatsapp_do_agente");
  C("whatsapp_de_handoff", texto(L.v("whatsapp_de_handoff", tc("whatsapp_de_handoff"))), "whatsapp_de_handoff");
  C("tempo_do_numero", texto(L.v("tempo_do_numero", tc("tempo_do_numero"))), "tempo_do_numero");
  C("equipe_responde_no_numero", texto(L.v("equipe_responde_no_numero", tc("equipe_responde_no_numero"))), "equipe_responde_no_numero");
  C("cidade", texto(L.v("cidade", tc("cidade"))), "cidade");
  C("tamanho_da_equipe", L.comOutro("tamanho_da_equipe", "outro_tamanho_da_equipe", tc("tamanho_da_equipe")), "tamanho_da_equipe");
  C("tempo_do_negocio", texto(L.v("tempo_do_negocio", tc("tempo_do_negocio"))), "tempo_do_negocio");
  C("fuso_horario", fuso, "fuso_horario");
  C("objetivos", json(L.listaComOutro("objetivos", "outro_objetivo", tc("objetivos"))), "objetivos");
  C("objetivo_principal", L.comOutro("objetivo_principal", "outro_objetivo", tc("objetivo_principal")), "objetivo_principal");
  C("conduzir_ao_agendamento", texto(L.v("conduzir_ao_agendamento", tc("conduzir_ao_agendamento"))), "conduzir_ao_agendamento");
  C("dias_de_funcionamento", diasDoNegocio.length ? json(diasDoNegocio) : null, "dias_de_funcionamento");
  C("horario_por_dia", json(horarioDoNegocio), "horario_por_dia");
  C("fechamentos_programados", fechamentos, "fechamentos_programados");
  C("idiomas", idiomas.length ? json(idiomas) : null, "idiomas");
  C("idioma_padrao", idiomaPadrao ? (IDIOMA[idiomaPadrao.toLowerCase()] ?? idiomaPadrao) : null, "idioma_padrao");
  C("duracao_avaliacao_min", minAvaliacao ? String(minAvaliacao) : null, "duracao_da_avaliacao");
  C("modo_de_agendamento", L.comOutro("modo_de_agendamento", "outro_modo_de_agendamento", tc("modo_de_agendamento")), "modo_de_agendamento");
  C("antecedencia_minima", L.comOutro("antecedencia_minima", "outro_antecedencia_minima", tc("antecedencia_minima")), "antecedencia_minima");
  C("antecedencia_maxima", L.comOutro("antecedencia_maxima", "outro_antecedencia_maxima", tc("antecedencia_maxima")), "antecedencia_maxima");
  C("intervalo_entre_atendimentos", L.comOutro("intervalo_entre_atendimentos", "outro_intervalo_entre_atendimentos", tc("intervalo_entre_atendimentos")), "intervalo_entre_atendimentos");
  C("agente_cancela_e_remarca", texto(L.v("agente_cancela_e_remarca", tc("agente_cancela_e_remarca"))), "agente_cancela_e_remarca");
  const quemLembra = texto(L.v("quem_manda_lembretes", tc("lembretes_quem_manda")));
  C("lembretes_quem_manda", quemLembra, "quem_manda_lembretes");
  C("lembretes_assistente_manda", quemLembra ? (quemLembra.startsWith("Sim, e basta") ? "nao" : "sim") : null, "quem_manda_lembretes");
  C("lembretes", json(L.listaComOutro("lembretes", "outro_lembretes", tc("lembretes"))), "lembretes");
  C("ativar_follow_up", texto(L.v("ativar_follow_up", tc("ativar_follow_up"))), "ativar_follow_up");
  C("tempo_primeira_tentativa", L.comOutro("tempo_primeira_tentativa", "outro_tempo_primeira_tentativa", tc("tempo_primeira_tentativa")), "tempo_primeira_tentativa");
  C("respeitar_dia_combinado", texto(L.v("respeitar_dia_combinado", tc("respeitar_dia_combinado"))), "respeitar_dia_combinado");
  C("tom_do_follow_up", L.comOutro("tom_do_follow_up", "outro_tom_do_follow_up", tc("tom_do_follow_up")), "tom_do_follow_up");
  C("clientes_sem_follow_up", semFollow, "clientes_sem_follow_up");
  C("prazo_de_resposta", L.comOutro("prazo_de_resposta", "outro_prazo_de_resposta", tc("prazo_de_resposta")), "prazo_de_resposta");
  const retomada = L.comOutro("retomada_apos_humano", "outro_retomada_apos_humano", tc("retomada_apos_humano"));
  C("retomada_apos_humano", retomada, "retomada_apos_humano");
  if (retomada && !/1 hora/.test(retomada)) avisos.push(`Pausa quando a equipe escreve: ela respondeu "${retomada}", mas a decisão do Arthur é 1 h (gravado pausa_quando_equipe_escreve_min=60). Conferir.`);

  // Decisões do Arthur (não perguntadas) para o agente desta cliente.
  C("preco_so_se_perguntar", "sim", "decisao_arthur");
  C("oferecer_horarios_depois_do_preco", "sim", "decisao_arthur");
  C("pausa_quando_equipe_escreve_min", "60", "decisao_arthur");
  const moxie = `${entrada.etapa1?.notas ?? ""} ${entrada.etapa1?.site ?? ""}`.match(/https?:\/\/app\.joinmoxie\.com\/booking\/[\w-]+/i)?.[0];
  C("link_reserva_moxie", moxie ?? null, "etapa1");

  // Arquivos (logotipo, fotos, tabela de preços…): ficam no onboarding (lexia_onboarding_arquivos).
  for (const s of esquema) for (const c of s.campos) if (c.tipo === "upload") L.v(c.chave, "lexia_onboarding_arquivos (fica no onboarding)");

  // ---------------------------------------------------------------- a ficha completa (rede de segurança)
  const nomeDoItem = (id: string | null) => {
    if (!id) return null;
    const it = itens.find((i) => i.id === id);
    const campoNome = it?.grupo === "faqs" ? "pergunta" : it?.grupo === "objecoes" ? "objecao" : "nome";
    return texto(linhas.find((l) => l.item_id === id && l.campo === campoNome)?.valor);
  };
  C(
    "ficha_onboarding_completa",
    JSON.stringify({
      gerado_em: entrada.agora ?? new Date().toISOString(),
      cliente_slug: cliente.slug,
      itens: itens.map((i) => ({ id: i.id, grupo: i.grupo, ordem: i.ordem, removido: i.removido, nome: nomeDoItem(i.id) })),
      linhas: linhas.map((l) => ({ campo: l.campo, item_id: l.item_id, valor: l.valor, estado: l.estado, fonte: l.fonte, perguntas: l.perguntas, evidencia: l.evidencia ?? null })),
    }),
    "ficha",
  );
  C("ficha_onboarding_completa_em", entrada.agora ?? new Date().toISOString(), "ficha");

  // ---------------------------------------------------------------- a contagem anti-perda
  const doEsquema = new Set<string>();
  for (const s of esquema) {
    for (const c of s.campos) doEsquema.add(`|${c.chave}`);
    for (const g of s.grupos) for (const c of g.campos) doEsquema.add(`${g.chave}|${c.chave}`);
  }
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const semDestino: Pendencia[] = [];
  const foraDeUso: Pendencia[] = [];
  const pendencias: Pendencia[] = [];
  const contagem = { linhas: linhas.length, resolvidas: 0, comDestino: 0, rascunho: 0, naoSeAplica: 0, deItensRemovidos: 0 };
  for (const l of linhas) {
    const p: Pendencia = { campo: l.campo, itemId: l.item_id, item: nomeDoItem(l.item_id), estado: l.estado, valor: l.valor };
    const item = l.item_id ? itemPorId.get(l.item_id) : null;
    if (l.item_id && !item) {
      if (RESOLVIDAS.has(l.estado)) semDestino.push({ ...p, item: "(item desconhecido)" });
      continue;
    }
    if (item?.removido) {
      contagem.deItensRemovidos++;
      continue;
    }
    if (l.estado === "rascunho") contagem.rascunho++;
    else if (l.estado === "nao_se_aplica") contagem.naoSeAplica++;
    else if (l.estado === "pulado" || l.estado === "vago") pendencias.push(p);
    if (!RESOLVIDAS.has(l.estado) || vazio(l.valor)) continue;
    contagem.resolvidas++;
    const k = chave(l.campo, l.item_id);
    if (L.destinos[k]?.length) {
      contagem.comDestino++;
      continue;
    }
    if (doEsquema.has(`${item?.grupo ?? ""}|${l.campo}`) && !aplicaveis.has(k)) foraDeUso.push(p);
    else semDestino.push(p);
  }
  if (semDestino.length) erros.unshift(`${semDestino.length} resposta(s) sem destino na base do agente: ${semDestino.map((p) => (p.item ? `${p.item} · ${p.campo}` : p.campo)).join("; ")}. Nada é gravado enquanto isto não tiver destino.`);
  if (pendencias.length) avisos.push(`${pendencias.length} resposta(s) pulada(s) ou vaga(s) ficaram para a equipe: ${pendencias.map((p) => (p.item ? `${p.item} · ${p.campo}` : p.campo)).join("; ")}.`);

  const resumo = resumir(caderno, itens, esquema);
  const faltamObrigatorios: Pendencia[] = resumo.bloqueiam.map((c) => ({ campo: c.campo.chave, itemId: c.itemId, item: nomeDoItem(c.itemId), estado: c.linha?.estado ?? "sem resposta", valor: c.linha?.valor ?? null }));
  if (faltamObrigatorios.length) erros.push(`A entrevista ainda tem ${faltamObrigatorios.length} resposta(s) obrigatória(s) por resolver (rascunho por confirmar, sem resposta ou pendência).`);
  for (const g of resumo.gruposSemItem) erros.push(`Nenhum item em "${g}".`);

  return {
    cliente,
    tabelas: tabelasDo(cliente),
    hoje: entrada.hoje,
    servicos,
    info,
    config,
    profissionais,
    promocoes,
    removidos: { servicos: removidosDe("servicos"), profissionais: removidosDe("profissionais"), promocoes: removidosDe("promocoes") },
    precoFalado: falado,
    destinos: L.destinos,
    semDestino,
    foraDeUso,
    pendencias,
    faltamObrigatorios,
    contagem,
    erros,
    avisos,
    ia: { usada: false },
  };
}

// ------------------------------------------------------------------ a IA, conferida em código

const curto = (v: unknown, max = 2000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const listaCurta = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const l = [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, 20);
  return l.length ? l : null;
};

async function enriquecerComIa(ex: Exportacao, ia: IaDaExportacao) {
  const erros: string[] = [];
  try {
    const pedido = ex.servicos.map((s) => ({ id: s.origem_item_id, nome: s.nome, descricao: s.descricao, preparo_e_cuidados: s.preparo_e_cuidados }));
    const resposta = pedido.length ? await ia.servicos(pedido) : [];
    const porId = new Map(resposta.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r]));
    for (const s of ex.servicos) {
      const r = porId.get(s.origem_item_id);
      if (!r) continue;
      const es = curto(r.nome_es, 200);
      if (es) s.nome_es = semEmojis(es);
      const al = listaCurta(r.aliases);
      if (al) s.aliases = al;
      if (!s.categoria && typeof r.categoria === "string" && CATEGORIAS[r.categoria]) s.categoria = CATEGORIAS[r.categoria];
      // Separar só quando há texto: a resposta inteira continua em preparo_e_cuidados.
      if (s.preparo_e_cuidados) {
        const pre = curto(r.preparo_pre, 4000);
        const pos = curto(r.cuidados_pos, 4000);
        if (pre || pos) {
          s.preparo_pre = pre;
          s.cuidados_pos = pos;
        }
      }
    }
  } catch (e) {
    erros.push(`serviços: ${e instanceof Error ? e.message : "erro"}`);
  }
  try {
    const catalogo = ex.servicos.map((s) => ({ id: s.origem_item_id, nome: s.nome }));
    const validos = new Set(catalogo.map((c) => c.id));
    const pedido = ex.promocoes.map((p) => ({ id: p.origem_item_id, nome: p.nome, condicao: p.condicao }));
    const resposta = pedido.length ? await ia.promocoes({ promocoes: pedido, catalogo }) : [];
    const porId = new Map(resposta.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r]));
    for (const p of ex.promocoes) {
      const r = porId.get(p.origem_item_id);
      if (!r) continue;
      const campanha = curto(r.campanha, 80);
      if (campanha) p.campanha = campanha;
      p.servicos_origem = [...new Set((r.servico_ids ?? []).filter((id) => validos.has(id)))];
      for (const k of ["brinde_pt", "brinde_en", "brinde_es"] as const) {
        const b = curto(r[k], 500);
        if (b) p[k] = b;
      }
      const ap = listaCurta(r.apelidos);
      if (ap) p.apelidos = ap;
    }
  } catch (e) {
    erros.push(`promoções: ${e instanceof Error ? e.message : "erro"}`);
  }
  if (erros.length) {
    ex.ia.erro = erros.join(" · ");
    ex.avisos.push(`A IA falhou (${ex.ia.erro}): a conversão seguiu sem os campos de IA.`);
  }
  const semServico = ex.promocoes.filter((p) => p.ativo && !p.servicos_origem.length);
  if (semServico.length) ex.avisos.push(`Promoções sem serviço ligado (o agente atual DESCARTA promoção sem serviço): ${semServico.map((p) => p.nome).join("; ")}.`);
}

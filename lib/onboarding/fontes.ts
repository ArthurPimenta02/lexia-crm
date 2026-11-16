/**
 * Etapa 1: ler as fontes do negócio e montar o RASCUNHO do caderno.
 *
 * O que sai daqui nunca é resposta: é "rascunho", que a cliente confirma na
 * conversa. A IA não inventa — cada valor traz a fonte e o trecho de onde
 * saiu, e o código deita fora o que não bate com o esquema (uma opção que não
 * existe, um campo desconhecido).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ESQUEMA_ONBOARDING, type CampoOnboarding } from "@/lib/onboarding/esquema";
import { BUCKET_ONBOARDING, type ArquivoOnboarding, type Etapa1, type NovaLinha } from "@/lib/onboarding/dados";
import { perguntar, type Bloco, type ChaveDeIa, type Uso } from "@/lib/onboarding/ia";

// ------------------------------------------------------------------ site

const SO_TEXTO = /<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi;
export function textoDoHtml(html: string): string {
  return html
    .replace(SO_TEXTO, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n\s*/g, "\n")
    .trim();
}

/** Só endereços públicos http(s): o servidor não vai buscar nada à rede interna. */
export function enderecoPublico(bruto: string): URL | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(bruto.trim()) ? bruto.trim() : `https://${bruto.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(":")) return null;
  return u;
}

const PAGINAS_QUE_INTERESSAM = /servi|trata|procedim|pre[cç]o|price|valor|sobre|about|contat|contact|faq|pergunt|agend|book|equipe|team|promo|pacote|menu/i;
const MAXIMO_DE_PAGINAS = 8;
const MAXIMO_POR_PAGINA = 14_000;

async function baixar(u: URL): Promise<string | null> {
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; LexiaOnboarding/1.0)", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!r.ok || !/text\/html|application\/xhtml/i.test(r.headers.get("content-type") ?? "")) return null;
    return (await r.text()).slice(0, 1_500_000);
  } catch {
    return null;
  }
}

/** Lê a página inicial e até 8 páginas internas que falam de serviços, preços, contato… */
export async function lerSite(bruto: string): Promise<{ ok: boolean; texto: string; paginas: string[] }> {
  const inicio = enderecoPublico(bruto);
  if (!inicio) return { ok: false, texto: "", paginas: [] };
  const html = await baixar(inicio);
  if (!html) return { ok: false, texto: "", paginas: [] };
  const partes = [`## ${inicio.href}\n${textoDoHtml(html).slice(0, MAXIMO_POR_PAGINA)}`];
  const paginas = [inicio.href];
  const vistos = new Set([inicio.pathname.replace(/\/$/, "")]);
  const links: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], inicio);
    } catch {
      continue;
    }
    const caminho = u.pathname.replace(/\/$/, "");
    if (u.hostname !== inicio.hostname || vistos.has(caminho) || /\.(pdf|jpe?g|png|webp|zip|mp4)$/i.test(caminho)) continue;
    if (!PAGINAS_QUE_INTERESSAM.test(`${caminho} ${textoDoHtml(m[2])}`)) continue;
    vistos.add(caminho);
    links.push(u);
  }
  const outras = await Promise.all(links.slice(0, MAXIMO_DE_PAGINAS).map(async (u) => ({ u, html: await baixar(u) })));
  for (const { u, html: h } of outras) {
    if (!h) continue;
    partes.push(`## ${u.href}\n${textoDoHtml(h).slice(0, MAXIMO_POR_PAGINA)}`);
    paginas.push(u.href);
  }
  return { ok: true, texto: partes.join("\n\n").slice(0, 90_000), paginas };
}

// ------------------------------------------------------------------ arquivos

const LER_ARQUIVO = `Você lê um arquivo que um negócio enviou no onboarding do seu agente de atendimento (tabela de preços, cardápio de serviços, print do Instagram, folheto, PDF).
Transcreva TUDO o que está escrito, na ordem em que aparece, sem resumir e sem corrigir: nomes de serviços, preços, durações, horários, endereços, telefones, regras, promoções.
Se for uma foto sem texto, descreva em uma ou duas frases o que ela mostra.
Não acrescente nada que não esteja no arquivo. Responda só com a transcrição.`;

/** O que está escrito num arquivo (imagem, PDF ou texto). Áudio fica para a conversa. */
export async function lerArquivo(admin: SupabaseClient, ia: ChaveDeIa, arquivo: ArquivoOnboarding): Promise<{ texto: string; uso: Uso | null }> {
  const mime = (arquivo.mime ?? "").toLowerCase().split(";")[0];
  const { data, error } = await admin.storage.from(BUCKET_ONBOARDING).download(arquivo.caminho);
  if (error || !data) throw new Error(`não consegui abrir o arquivo ${arquivo.nome ?? ""}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (/^text\/|application\/json|csv/.test(mime)) return { texto: bytes.toString("utf8").slice(0, 60_000), uso: null };
  let bloco: Bloco;
  if (mime === "application/pdf") bloco = { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } };
  else if (/^image\/(png|jpeg|webp|gif)$/.test(mime)) bloco = { type: "image", source: { type: "base64", media_type: mime, data: bytes.toString("base64") } };
  else throw new Error(`tipo de arquivo ainda não lido na Etapa 1: ${mime || "desconhecido"}`);
  const r = await perguntar(ia, { sistema: LER_ARQUIVO, conteudo: [bloco, { type: "text", text: `Arquivo: ${arquivo.nome ?? "sem nome"}` }], maxTokens: 6000 });
  return { texto: r.texto.trim(), uso: r.uso };
}

// ------------------------------------------------------------------ rascunho

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const FONTES = ["site", "instagram", "google", "arquivo", "lexia"] as const;
type Fonte = (typeof FONTES)[number];

/**
 * O que a IA NÃO tira das fontes, mesmo que lá esteja: é a dona que diz com as palavras dela.
 * Um prêmio no site não é necessariamente o diferencial que ela quer que a assistente use (Arthur, 16/11/2026).
 */
const SO_A_DONA_RESPONDE = new Set(["diferencial_1", "diferencial_2", "diferencial_3", "informacoes_adicionais"]);
const camposDaRaiz = () => ESQUEMA_ONBOARDING.flatMap((s) => s.campos).filter((c) => c.tipo !== "upload" && c.tipo !== "horarios" && !c.quando && !SO_A_DONA_RESPONDE.has(c.chave));
const grupo = (chave: string) => ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).find((g) => g.chave === chave)!;

const texto = { type: "string" };
const evidencia = { fonte: { type: "string", enum: [...FONTES] }, trecho: { type: "string" } };
const objeto = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export function esquemaDoRascunho() {
  return objeto({
    resumo: texto,
    campos: { type: "array", items: objeto({ chave: { type: "string", enum: camposDaRaiz().map((c) => c.chave) }, valor: texto, lista: { type: "array", items: texto }, ...evidencia }) },
    horarios: { type: "array", items: objeto({ dia: { type: "string", enum: [...DIAS] }, abre: texto, fecha: texto, ...evidencia }) },
    servicos: { type: "array", items: objeto({ nome: texto, tipo_de_preco: texto, valor: texto, duracao_media: texto, descricao_e_indicacao: texto, preparo_e_cuidados: texto, contraindicacoes: texto, numero_de_sessoes: texto, ...evidencia }) },
    profissionais: { type: "array", items: objeto({ nome: texto, especialidade: texto, ...evidencia }) },
    faqs: { type: "array", items: objeto({ pergunta: texto, resposta: texto, ...evidencia }) },
    objecoes: { type: "array", items: objeto({ objecao: texto, como_responder: texto, ...evidencia }) },
    promocoes: { type: "array", items: objeto({ nome: texto, condicao: texto, ...evidencia }) },
  });
}

function instrucoes(): string {
  const linhas = camposDaRaiz().map((c) => `- ${c.chave}: ${c.pergunta}${c.opcoes?.length ? ` [${c.tipo === "multi" ? "escolha várias, em lista" : "escolha UMA, em valor"}: ${c.opcoes.join(" | ")}]` : ""}`);
  return `Você prepara o rascunho do onboarding de um negócio que vai ter um agente de atendimento com IA.
Recebe o que foi lido das fontes do negócio (site, arquivos, textos colados, anotações da equipe da Lexia) e preenche SÓ o que as fontes dizem.

REGRAS
- Nunca invente nem deduza por achar provável. Se a fonte não diz, o campo fica de fora: ele será perguntado ao dono na entrevista.
- Cada item traz "fonte" (de onde saiu) e "trecho" (até 12 palavras copiadas da fonte, só o bastante para achar o lugar).
- Nunca escolha a opção "Outro": se nenhuma opção serve, o campo fica de fora.
- Escolhas e preferências do dono (posicionamento, tom, emojis, regras de atendimento, como responder) só entram quando estão escritas nas anotações da equipe da Lexia. Nunca as deduza do site, de prêmios, de avaliações ou do estilo dos textos. Anotações da equipe da Lexia têm fonte "lexia".
- Copie preços, durações e nomes exatamente como estão. Não some, não converta moeda, não arredonde.
- Campos com opções: use exatamente o texto de uma das opções (em "valor"; se for de escolher várias, em "lista"). Se nenhuma opção corresponder ao que a fonte diz, deixe o campo de fora.
- Campos de texto: "valor" com a informação, "lista" vazia.
- Serviços: um item por serviço realmente oferecido. Campos que a fonte não traz ficam com texto vazio. "tipo_de_preco" é um de: ${grupo("servicos").campos.find((c) => c.chave === "tipo_de_preco")!.opcoes!.join(" | ")} (ou vazio se a fonte não deixa claro).
- Perguntas frequentes e objeções: só as que aparecem de fato nas fontes (seção de FAQ, comentários, avaliações, anotações), com a resposta que a fonte dá. Sem resposta na fonte, deixe a resposta vazia.
- Horários: uma linha por dia em que abre, no formato HH:MM.
- "resumo": duas frases para a equipe da Lexia sobre o que foi encontrado e o que mais faltou.
- Escreva em português do Brasil. Não traduza nomes próprios nem nomes de serviços.

CAMPOS DA RAIZ (use a chave exata)
${linhas.join("\n")}`;
}

export type RascunhoBruto = {
  resumo: string;
  campos: { chave: string; valor: string; lista: string[]; fonte: Fonte; trecho: string }[];
  horarios: { dia: string; abre: string; fecha: string; fonte: Fonte; trecho: string }[];
  servicos: (Record<string, string> & { fonte: Fonte; trecho: string })[];
  profissionais: (Record<string, string> & { fonte: Fonte; trecho: string })[];
  faqs: (Record<string, string> & { fonte: Fonte; trecho: string })[];
  objecoes: (Record<string, string> & { fonte: Fonte; trecho: string })[];
  promocoes: (Record<string, string> & { fonte: Fonte; trecho: string })[];
};

export type FontesLidas = { etapa1: Etapa1; site: string; arquivos: { nome: string; texto: string }[] };

export function textoDasFontes(f: FontesLidas): string {
  const partes: string[] = [];
  const e = f.etapa1;
  partes.push(`# ANOTAÇÕES DA EQUIPE DA LEXIA (fonte: lexia)\nTipo de negócio: ${e.tipo_de_negocio ?? ""}\nIdiomas do atendimento: ${(e.idiomas ?? []).join(", ")}\nInstagram: ${e.instagram ?? ""}\nSite: ${e.site ?? ""}\nPerfil no Google: ${e.google ?? ""}\n\n${e.notas ?? ""}`);
  if (e.texto_colado?.trim()) partes.push(`# TEXTO COLADO PELA EQUIPE (bio, posts, avaliações; fonte: instagram ou google conforme o que for dito no texto)\n${e.texto_colado.trim()}`);
  if (f.site.trim()) partes.push(`# SITE (fonte: site)\n${f.site}`);
  for (const a of f.arquivos) partes.push(`# ARQUIVO "${a.nome}" (fonte: arquivo)\n${a.texto}`);
  return partes.join("\n\n").slice(0, 160_000);
}

export async function pedirRascunho(ia: ChaveDeIa, fontes: FontesLidas): Promise<{ rascunho: RascunhoBruto; uso: Uso }> {
  const r = await perguntar(ia, { sistema: instrucoes(), conteudo: [{ type: "text", text: textoDasFontes(fontes) }], esquema: esquemaDoRascunho(), maxTokens: 16000 });
  return { rascunho: JSON.parse(r.texto) as RascunhoBruto, uso: r.uso };
}

// ------------------------------------------------------------------ do rascunho para o caderno

const limpo = (v: unknown) => String(v ?? "").trim();
const ev = (x: { fonte: Fonte; trecho: string }) => ({ trecho: limpo(x.trecho).slice(0, 400) });

/** Só passa o que bate com o esquema: opção que não existe ou campo vazio ficam de fora. */
export function valorValido(campo: CampoOnboarding, valor: string, lista: string[]): unknown | undefined {
  if (campo.tipo === "multi") {
    const boas = [...new Set((lista.length ? lista : valor.split(/[;,]/)).map(limpo))].filter((x) => campo.opcoes?.includes(x) && !/^outro/i.test(x));
    return boas.length ? boas : undefined;
  }
  const v = limpo(valor) || limpo(lista[0]);
  if (!v) return undefined;
  // "Outro" sem dizer qual não é informação: fica para a conversa.
  if (campo.opcoes?.length) return campo.opcoes.includes(v) && !/^outro/i.test(v) ? v : undefined;
  if (campo.tipo === "number") return /\d/.test(v) ? v : undefined;
  return v;
}

export type ItemNovo = { grupo: "servicos" | "profissionais" | "faqs" | "objecoes" | "promocoes"; nome: string; linhas: Omit<NovaLinha, "itemId">[] };

/** Transforma a resposta da IA em linhas "rascunho" (raiz) e itens novos (com as suas linhas). */
export function rascunhoParaCaderno(r: RascunhoBruto): { linhas: NovaLinha[]; itens: ItemNovo[] } {
  const raiz = new Map(camposDaRaiz().map((c) => [c.chave, c]));
  const linhas: NovaLinha[] = [];
  const vistos = new Set<string>();
  for (const c of r.campos ?? []) {
    const campo = raiz.get(c.chave);
    if (!campo || vistos.has(c.chave)) continue;
    // Escolhas do dono (posicionamento, tom, regras) não se deduzem de um site: só entram se a equipe as anotou.
    if (campo.modo === "cartao" && c.fonte !== "lexia") continue;
    const valor = valorValido(campo, c.valor, c.lista ?? []);
    if (valor === undefined) continue;
    vistos.add(c.chave);
    linhas.push({ campo: c.chave, valor, estado: "rascunho", fonte: c.fonte, evidencia: ev(c) });
  }
  const hora = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const horarios = (r.horarios ?? []).filter((h) => (DIAS as readonly string[]).includes(h.dia) && hora.test(limpo(h.abre)) && hora.test(limpo(h.fecha)));
  if (horarios.length) {
    const porDia = Object.fromEntries(horarios.map((h) => [h.dia, [limpo(h.abre).padStart(5, "0"), limpo(h.fecha).padStart(5, "0")]]));
    linhas.push({ campo: "horario_por_dia", valor: porDia, estado: "rascunho", fonte: horarios[0].fonte, evidencia: ev(horarios[0]) });
    if (!vistos.has("dias_de_funcionamento")) linhas.push({ campo: "dias_de_funcionamento", valor: DIAS.filter((d) => porDia[d]), estado: "rascunho", fonte: horarios[0].fonte, evidencia: ev(horarios[0]) });
  }
  const itens: ItemNovo[] = [];
  const doGrupo = (chave: ItemNovo["grupo"], lista: (Record<string, string> & { fonte: Fonte; trecho: string })[] | undefined, nomeDe: string) => {
    const campos = new Map(grupo(chave).campos.map((c) => [c.chave, c]));
    const nomes = new Set<string>();
    for (const x of lista ?? []) {
      const nome = limpo(x[nomeDe]);
      const k = nome.toLowerCase();
      if (!nome || nomes.has(k)) continue;
      nomes.add(k);
      const ls: Omit<NovaLinha, "itemId">[] = [];
      for (const [k2, campo] of campos) {
        if (!(k2 in x)) continue;
        if (campo.modo === "cartao" && x.fonte !== "lexia") continue;
        const valor = valorValido(campo, x[k2], []);
        if (valor !== undefined) ls.push({ campo: k2, valor, estado: "rascunho", fonte: x.fonte, evidencia: ev(x) });
      }
      if (ls.length) itens.push({ grupo: chave, nome, linhas: ls });
    }
  };
  doGrupo("servicos", r.servicos, "nome");
  doGrupo("profissionais", r.profissionais, "nome");
  doGrupo("faqs", r.faqs, "pergunta");
  doGrupo("objecoes", r.objecoes, "objecao");
  doGrupo("promocoes", r.promocoes, "nome");
  return { linhas, itens };
}

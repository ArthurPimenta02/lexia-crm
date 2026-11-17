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
import { seAplica } from "@/lib/onboarding/caderno";
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
/**
 * Campos que dependem de outro ficam de fora do rascunho (quase todos são o "qual?" de um "Outro"), menos estes:
 * a equipe costuma saber e a dona só precisa conferir. Só ficam se o rascunho trouxer também a resposta que os pede.
 */
const CONDICIONAIS_QUE_ENTRAM = new Set(["valor_da_avaliacao"]);
const camposDaRaiz = () => ESQUEMA_ONBOARDING.flatMap((s) => s.campos).filter((c) => c.tipo !== "upload" && c.tipo !== "horarios" && (!c.quando || CONDICIONAIS_QUE_ENTRAM.has(c.chave)) && !SO_A_DONA_RESPONDE.has(c.chave));
const grupo = (chave: string) => ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).find((g) => g.chave === chave)!;

const texto = { type: "string" };
const evidencia = { fonte: { type: "string", enum: [...FONTES] }, trecho: { type: "string" }, incerto: { type: "boolean" } };
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
- Só vale o que a fonte diz COM TODAS AS LETRAS sobre aquele campo. Exemplos reais de dedução proibida: "em menos de cinco anos construiu uma clientela" fala de crescimento, não diz há quanto tempo o negócio existe (o campo fica de fora, ou usa-se a frase que diz desde quando ela atua); "fui recebida pela Milena" numa avaliação dá o nome de uma pessoa, não a função dela (o nome entra, a especialidade fica vazia). Função, cargo e especialidade de uma pessoa só entram quando a fonte os escreve.
- "incerto": true quando a própria fonte mostra dúvida sobre aquela informação ("a confirmar", "acho que", "não tenho certeza", "por volta de", "ordem de grandeza", "pode ter mudado", ou uma seção de coisas a confirmar). A informação entra mesmo assim, com o valor que a fonte acredita, e o dono é avisado para conferir. Caso contrário, false.
- Quando duas fontes se contradizem, valem as anotações da equipe da Lexia (fonte "lexia"): é quem conhece o negócio de perto. Entre as outras, vale a mais específica.
- Cada item traz "fonte" (de onde saiu) e "trecho" (até 12 palavras copiadas da fonte, só o bastante para achar o lugar).
- Nunca escolha a opção "Outro": se nenhuma opção serve, o campo fica de fora.
- Escolhas e preferências do dono (posicionamento, tom, emojis, regras de atendimento, como responder) só entram quando estão escritas nas anotações da equipe da Lexia. Nunca as deduza do site, de prêmios, de avaliações ou do estilo dos textos. Anotações da equipe da Lexia têm fonte "lexia".
- Copie preços, durações e nomes exatamente como estão. Não some, não converta moeda, não arredonde. "duracao_media" é só o tempo do atendimento ("45 minutos"): tempo de recuperação, de cicatrização ou de duração do resultado não entram nesse campo.
- Campos que dependem de outro (ex.: o valor da avaliação só existe se a avaliação é paga) só entram quando a fonte os diz; em campos de número, só o número ("30").
- Campos com opções: use exatamente o texto de uma das opções (em "valor"; se for de escolher várias, em "lista"). Se nenhuma opção corresponder ao que a fonte diz, deixe o campo de fora.
- Campos de texto: "valor" com a informação, "lista" vazia.
- Serviços: um item por serviço realmente oferecido. Cada técnica ou procedimento que a fonte cita pelo nome é um serviço separado (se a fonte diz que a sobrancelha pode ser feita em microblading, shadow ou hybrid, são três serviços; "também fazemos tintura, laminação e design" são mais três). O nome de uma categoria ou de uma seção do site ("Sobrancelhas", "Lábios", "Estética avançada") não é um serviço: liste o que está dentro dela. O que a fonte diz da categoria (duração, descrição) vale para cada serviço dela. O mesmo serviço citado em fontes diferentes, ou com nomes parecidos ("Hybrid" e "Hybrid Brows", "Lamination" e "Brow Lamination"), é UM item só: use o nome mais completo e junte o que cada fonte diz. Uma descrição genérica das anotações ("procedimentos de ticket mais baixo", "os injetáveis") não é um serviço, e uma faixa de preço dita por alto para vários serviços não é o preço de nenhum deles. Campos que a fonte não traz ficam com texto vazio. "tipo_de_preco" é um de: ${grupo("servicos").campos.find((c) => c.chave === "tipo_de_preco")!.opcoes!.join(" | ")} (ou vazio se a fonte não deixa claro).
- Perguntas frequentes e objeções: só as que aparecem de fato nas fontes (seção de FAQ, comentários, avaliações, anotações), com a resposta que a fonte dá. Sem resposta na fonte, deixe a resposta vazia.
- Horários: uma linha por dia em que abre, no formato HH:MM.
- "resumo": duas frases para a equipe da Lexia sobre o que foi encontrado e o que mais faltou.
- Escreva em português do Brasil, UM idioma só: se a fonte está em inglês ou espanhol, escreva em português o que ela diz (descrições, cuidados, perguntas frequentes e respostas), sem misturar frases em dois idiomas e sem repetir a mesma pergunta em duas línguas. Só nomes próprios e nomes de serviços ficam como o negócio usa, sem tradução entre parênteses ("Lip and Facial Fillers", não "Lip and Facial Fillers (preenchimento labial e facial)"). Quando duas fontes dão nomes diferentes ao mesmo serviço, o outro nome pode ir entre parênteses ("Powder Brows (Shadow)").

CAMPOS DA RAIZ (use a chave exata)
${linhas.join("\n")}`;
}

export type RascunhoBruto = {
  resumo: string;
  campos: { chave: string; valor: string; lista: string[]; fonte: Fonte; trecho: string; incerto?: boolean }[];
  horarios: { dia: string; abre: string; fecha: string; fonte: Fonte; trecho: string; incerto?: boolean }[];
  servicos: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[];
  profissionais: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[];
  faqs: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[];
  objecoes: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[];
  promocoes: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[];
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

/**
 * O teto da resposta do rascunho. Conta também o raciocínio do modelo, não só o texto: com muitas fontes
 * (anotações longas e vários prints) 16 mil não chegaram e a geração falhou com "a resposta ficou cortada"
 * (17/11/2026, primeira cliente). O custo é pelo que se usa, não pelo teto.
 * Também por isso o rascunho responde sem a etapa de raciocínio: medido com as mesmas fontes, 141 s e 15,8 mil
 * tokens com raciocínio contra 50 s e 6,3 mil sem, com uma lista de serviços igual ou melhor. A rota tem 300 s
 * para o rascunho inteiro (arquivos, rascunho, textos dos serviços e sugestões).
 */
const LIMITE_DO_RASCUNHO = 48000;

export async function pedirRascunho(ia: ChaveDeIa, fontes: FontesLidas): Promise<{ rascunho: RascunhoBruto; uso: Uso }> {
  const r = await perguntar(ia, { sistema: instrucoes(), conteudo: [{ type: "text", text: textoDasFontes(fontes) }], esquema: esquemaDoRascunho(), maxTokens: LIMITE_DO_RASCUNHO, semPensar: true });
  return { rascunho: JSON.parse(r.texto) as RascunhoBruto, uso: r.uso };
}

// ------------------------------------------------------------------ os textos de cada serviço, escritos pela Lexia

/**
 * O que a Lexia ESCREVE para cada serviço quando as fontes não trazem (Arthur, 17/11/2026: a dona não pode
 * gastar horas a explicar quinze serviços; ler e corrigir é muito mais rápido do que explicar do zero).
 * Entra como rascunho com a fonte "recomendacao": nunca conta como resposta até ela confirmar.
 * Preço e duração ficam de fora de propósito: ou vêm de um arquivo dela, ou ela preenche.
 */
export const TEXTOS_DO_SERVICO = ["descricao_e_indicacao", "para_quem_indicar", "preparo_e_cuidados", "contraindicacoes", "numero_de_sessoes"] as const;
export type TextosDeUmServico = { n: number } & Record<(typeof TEXTOS_DO_SERVICO)[number], string>;

const esquemaDosTextos = () => objeto({ servicos: { type: "array", items: objeto({ n: { type: "integer" }, ...Object.fromEntries(TEXTOS_DO_SERVICO.map((k) => [k, texto])) }) } });

function instrucoesDosTextos(): string {
  return `Você escreve o rascunho dos textos de cada serviço de um negócio que vai ter uma assistente de atendimento com IA. A dona do negócio vai ler cada texto e corrigir o que for diferente no negócio dela: o seu rascunho poupa o tempo dela, não substitui a palavra dela.

Você recebe o tipo de negócio e a lista de serviços, cada um com um número "n" e com o que as fontes do negócio já disseram sobre ele.

O QUE ESCREVER, POR SERVIÇO
- descricao_e_indicacao: o que é o serviço e como é feito, em 2 ou 3 frases, do jeito que uma atendente explicaria para uma cliente.
- para_quem_indicar: para quem costuma ser indicado, em 1 ou 2 frases.
- preparo_e_cuidados: o preparo antes e os cuidados depois que são prática comum neste procedimento, em frases curtas.
- contraindicacoes: as contraindicações amplamente reconhecidas para este procedimento, em uma frase ou lista curta.
- numero_de_sessoes: o número típico de sessões (ex.: "1 sessão e um retoque", "sessão única").

REGRAS
- Se o serviço já traz um desses campos preenchido pelas fontes, devolva esse campo VAZIO: o texto da fonte vale mais do que o seu.
- O NOME BASTA quando é um procedimento conhecido do ramo (ex.: "Eyebrow Lamination", "Nanoblading", "Laser Tattoo Removal", "Limpeza de pele"): escreva os cinco campos mesmo que as fontes só tragam o nome. Quando as fontes disserem algo sobre o serviço, use isso como base.
- Complete só com o que é prática comum e amplamente aceita para aquele procedimento.
- Só devolva TODOS os campos vazios quando você não sabe o que é o serviço: nome próprio criado pelo negócio, pacote, combinação ou nome ambíguo. Nesse caso a dona será perguntada, e um campo vazio é melhor do que um texto errado.
- "numero_de_sessoes" também vale para procedimentos que se repetem: diga o habitual (ex.: "1 sessão, com manutenção a cada 4 a 6 meses").
- Nunca escreva preço, duração do atendimento, desconto, garantia ou promessa de resultado. Nunca cite marca, produto, aparelho ou técnica que as fontes não citaram.
- Um campo que não faz sentido para o serviço (ex.: contraindicações de uma consultoria) fica vazio.
- Devolva um item para cada serviço recebido, com o mesmo "n".
- Português do Brasil, simples e direto, sem linguagem de propaganda. Não traduza o nome dos serviços.`;
}

export async function pedirTextosDosServicos(ia: ChaveDeIa, pedido: { tipoDeNegocio: string; servicos: { n: number; nome: string; dasFontes: Record<string, string> }[] }): Promise<{ textos: TextosDeUmServico[]; uso: Uso }> {
  const r = await perguntar(ia, { sistema: instrucoesDosTextos(), conteudo: [{ type: "text", text: JSON.stringify({ tipo_de_negocio: pedido.tipoDeNegocio, servicos: pedido.servicos }) }], esquema: esquemaDosTextos(), maxTokens: 16000, semPensar: true });
  return { textos: (JSON.parse(r.texto) as { servicos: TextosDeUmServico[] }).servicos ?? [], uso: r.uso };
}

/** Os serviços do rascunho, no formato que se manda a quem escreve os textos (o "n" é a posição na lista). */
export function servicosParaEscrever(itens: ItemNovo[]): { n: number; nome: string; dasFontes: Record<string, string> }[] {
  return itens
    .map((item, n) => ({ item, n }))
    .filter(({ item }) => item.grupo === "servicos")
    .map(({ item, n }) => ({ n, nome: item.nome, dasFontes: Object.fromEntries(item.linhas.filter((l) => l.campo !== "nome" && typeof l.valor === "string").map((l) => [l.campo, l.valor as string])) }));
}

/** Junta os textos escritos pela Lexia aos serviços do rascunho, sem nunca passar por cima do que veio de uma fonte. */
export function juntarTextos(itens: ItemNovo[], textos: TextosDeUmServico[]): ItemNovo[] {
  const porN = new Map(textos.map((x) => [x.n, x]));
  return itens.map((item, n) => {
    const escrito = item.grupo === "servicos" ? porN.get(n) : undefined;
    if (!escrito) return item;
    const ja = new Set(item.linhas.map((l) => l.campo));
    const novas = TEXTOS_DO_SERVICO.filter((k) => !ja.has(k) && limpo(escrito[k])).map((k) => ({ campo: k as string, valor: limpo(escrito[k]).slice(0, 2000), estado: "rascunho" as const, fonte: "recomendacao" as const, evidencia: { escrito_pela_lexia: true } }));
    return novas.length ? { ...item, linhas: [...item.linhas, ...novas] } : item;
  });
}

// ------------------------------------------------------------------ perguntas frequentes e objeções sugeridas pela Lexia

/** Poucas e boas: a dona acrescenta as dela (Arthur, 17/11/2026). O teto conta com as que as fontes já trouxeram. */
export const MAXIMO_DE_FAQS = 6;
export const MAXIMO_DE_OBJECOES = 4;
export type Sugestoes = { faqs: { pergunta: string; resposta: string }[]; objecoes: { objecao: string; como_responder: string }[] };

function instrucoesDasSugestoes(): string {
  return `Você prepara sugestões para o onboarding de um negócio que vai ter uma assistente de atendimento com IA. A dona vai ler cada sugestão, corrigir a resposta, apagar as que não valem e acrescentar as dela: o seu rascunho poupa o tempo dela, não substitui a palavra dela.

Você recebe o tipo de negócio, os serviços, as perguntas frequentes e objeções que as fontes já trouxeram, e o texto das fontes do negócio.

O QUE ESCREVER
- "faqs": as perguntas que clientes deste tipo de negócio mais fazem pelo WhatsApp antes de marcar (dói? quanto tempo dura o resultado? como é a recuperação? posso fazer se...? quantas sessões?), cada uma com a resposta que uma boa atendente daria, em 1 a 3 frases.
- "objecoes": as objeções que mais aparecem neste tipo de negócio (está caro, vou pensar, tenho medo de dor, tenho medo de ficar artificial, já tive uma experiência ruim), cada uma com uma sugestão de como responder, em 1 a 3 frases, acolhendo primeiro e sem pressionar.

REGRAS
- No máximo ${MAXIMO_DE_FAQS} perguntas frequentes e ${MAXIMO_DE_OBJECOES} objeções. Menos, se não houver tantas que façam sentido.
- Não repita o que já está em "ja_existem".
- As respostas só podem usar o que as fontes dizem e o que é conhecimento comum e amplamente aceito sobre os procedimentos. NUNCA invente um fato do negócio: preço, desconto, parcelamento, forma de pagamento, horário, endereço, estacionamento, prazo, garantia, política de cancelamento. Se a resposta a uma pergunta depende de um fato desses que as fontes não trazem, não inclua essa pergunta: ela é feita à dona em outro momento.
- Nunca prometa resultado. Nunca cite marca, produto ou aparelho que as fontes não citaram.
- Na resposta a "está caro", não invente desconto nem condição: sugira explicar o que está incluído e o valor do resultado, e deixe o resto para a dona completar.
- Escreva como a atendente falaria com a cliente: português do Brasil, simples, caloroso, sem linguagem de propaganda. Não traduza o nome dos serviços.`;
}

const esquemaDasSugestoes = () => objeto({ faqs: { type: "array", items: objeto({ pergunta: texto, resposta: texto }) }, objecoes: { type: "array", items: objeto({ objecao: texto, como_responder: texto }) } });

export async function pedirSugestoes(ia: ChaveDeIa, pedido: { tipoDeNegocio: string; servicos: string[]; jaExistem: { faqs: string[]; objecoes: string[] }; fontes: string }): Promise<{ sugestoes: Sugestoes; uso: Uso }> {
  const r = await perguntar(ia, {
    sistema: instrucoesDasSugestoes(),
    conteudo: [{ type: "text", text: `${JSON.stringify({ tipo_de_negocio: pedido.tipoDeNegocio, servicos: pedido.servicos, ja_existem: pedido.jaExistem })}

# FONTES DO NEGÓCIO
${pedido.fontes.slice(0, 60_000)}` }],
    esquema: esquemaDasSugestoes(),
    maxTokens: 8000,
    semPensar: true,
  });
  return { sugestoes: JSON.parse(r.texto) as Sugestoes, uso: r.uso };
}

/** Junta as sugestões aos itens do rascunho: sem repetir o que as fontes já trouxeram, e dentro do teto. */
export function juntarSugestoes(itens: ItemNovo[], s: Sugestoes): ItemNovo[] {
  const norma = (x: string) => limpo(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const ja = new Set(itens.map((i) => `${i.grupo}|${norma(i.nome)}`));
  const linha = (campo: string, valor: string) => ({ campo, valor: limpo(valor).slice(0, 2000), estado: "rascunho" as const, fonte: "recomendacao" as const, evidencia: { escrito_pela_lexia: true } });
  const novos: ItemNovo[] = [];
  const entra = (grupo: "faqs" | "objecoes", nome: string, campoDoNome: string, campoDaResposta: string, resposta: string, teto: number) => {
    const k = `${grupo}|${norma(nome)}`;
    if (!limpo(nome) || !limpo(resposta) || ja.has(k) || itens.filter((n) => n.grupo === grupo).length + novos.filter((n) => n.grupo === grupo).length >= teto) return;
    ja.add(k);
    novos.push({ grupo, nome: limpo(nome).slice(0, 300), linhas: [linha(campoDoNome, limpo(nome).slice(0, 300)), linha(campoDaResposta, resposta)] });
  };
  for (const f of s.faqs ?? []) entra("faqs", f.pergunta, "pergunta", "resposta", f.resposta, MAXIMO_DE_FAQS);
  for (const o of s.objecoes ?? []) entra("objecoes", o.objecao, "objecao", "como_responder", o.como_responder, MAXIMO_DE_OBJECOES);
  return [...itens, ...novos];
}

// ------------------------------------------------------------------ do rascunho para o caderno

const limpo = (v: unknown) => String(v ?? "").trim();
/** "a_confirmar" é a dúvida que a própria fonte mostrou: a tela avisa a dona para conferir (Arthur, 17/11/2026). */
const ev = (x: { fonte: Fonte; trecho: string; incerto?: boolean }) => ({ trecho: limpo(x.trecho).slice(0, 400), ...(x.incerto === true ? { a_confirmar: true } : {}) });

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
  // Campo de número guarda só o número ("30 dólares" vira "30"); com mais de um número no texto, fica como veio.
  if (campo.tipo === "number") {
    const numeros = v.match(/\d+(?:[.,]\d+)*/g) ?? [];
    return numeros.length === 1 ? numeros[0] : numeros.length ? v : undefined;
  }
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
  // Um campo que depende de outro só fica se o rascunho também trouxe a resposta que o pede.
  const valores = Object.fromEntries(linhas.map((l) => [l.campo, l.valor]));
  for (let i = linhas.length - 1; i >= 0; i--) if (!seAplica(raiz.get(linhas[i].campo)?.quando, valores)) linhas.splice(i, 1);
  const hora = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const horarios = (r.horarios ?? []).filter((h) => (DIAS as readonly string[]).includes(h.dia) && hora.test(limpo(h.abre)) && hora.test(limpo(h.fecha)));
  if (horarios.length) {
    const porDia = Object.fromEntries(horarios.map((h) => [h.dia, [limpo(h.abre).padStart(5, "0"), limpo(h.fecha).padStart(5, "0")]]));
    linhas.push({ campo: "horario_por_dia", valor: porDia, estado: "rascunho", fonte: horarios[0].fonte, evidencia: ev(horarios[0]) });
    if (!vistos.has("dias_de_funcionamento")) linhas.push({ campo: "dias_de_funcionamento", valor: DIAS.filter((d) => porDia[d]), estado: "rascunho", fonte: horarios[0].fonte, evidencia: ev(horarios[0]) });
  }
  const itens: ItemNovo[] = [];
  const doGrupo = (chave: ItemNovo["grupo"], lista: (Record<string, string> & { fonte: Fonte; trecho: string; incerto?: boolean })[] | undefined, nomeDe: string) => {
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

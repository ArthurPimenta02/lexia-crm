/**
 * O MOTOR DA CONVERSA (Etapa 2). Um turno = uma resposta da cliente.
 *
 * Quem manda é o código:
 *   1. a mensagem dela é GRAVADA antes de qualquer outra coisa (nunca se perde);
 *   2. o que veio em cartões (confirmações, escolhas, lista) é anotado pelo código;
 *   3. o que veio em texto ou áudio vai à IA só para EXTRAIR — e o código confere
 *      cada valor contra o esquema antes de anotar;
 *   4. o que foi perguntado e não foi respondido conta uma pergunta (teto de duas);
 *   5. o caderno decide o próximo passo; a IA só escreve a fala.
 *
 * Este ficheiro não fala com a base nem com a IA diretamente: recebe um
 * `Repositorio` e uma `Inteligencia`. Em produção são o Supabase e o Claude;
 * nos testes são duplos em memória.
 */
import {
  seAplica,
  ANDAMENTO_VAZIO,
  SECAO_DAS_RECOMENDADAS,
  campoDoEsquema,
  montarCaderno,
  perguntadosNoPasso,
  proximoPasso,
  resumir,
  type Andamento,
  type CampoNoCaderno,
  type ItemDoCaderno,
  type LinhaDoCaderno,
  type Passo,
} from "@/lib/onboarding/caderno";
import type { NovaLinha } from "@/lib/onboarding/dados";
import { ESQUEMA_ONBOARDING, type CampoOnboarding, type GrupoQueRepete } from "@/lib/onboarding/esquema";

// ------------------------------------------------------------------ o que vai para a tela

export type CampoDoCartao = {
  campo: string;
  itemId: string | null;
  pergunta: string;
  tipo: string;
  opcoes?: string[];
  /** As opções são os itens de um grupo (preenchidas em `cartaoDoPasso`). */
  opcoesDe?: string;
  recomendado?: string | string[];
  ajuda?: string;
  /** Informação de saúde: a tela pede para conferir com atenção. */
  atencao?: boolean;
  /** A fonte de onde o rascunho saiu não tinha certeza: a tela pede para conferir. */
  aConfirmar?: boolean;
  /** O que o rascunho achou (só nos campos por confirmar). */
  valor?: unknown;
  fonte?: string;
};

/** O passo, no formato que a tela desenha (vai dentro da mensagem da entrevistadora). */
export type Cartao =
  | { tipo: "confirmar"; campos: CampoDoCartao[] }
  | { tipo: "lista"; grupo: GrupoQueRepete; itens: { id: string; nome: string; campos?: CampoDoCartao[] }[] }
  | { tipo: "itens"; grupo: GrupoQueRepete; obrigatorio: boolean }
  | { tipo: "tabela"; grupo: GrupoQueRepete; linhas: { itemId: string; nome: string; campos: CampoDoCartao[] }[] }
  | { tipo: "item"; grupo: GrupoQueRepete; itemId: string; nome: string; confirmar: CampoDoCartao[]; cartoes: CampoDoCartao[]; faltam: CampoDoCartao[] }
  | { tipo: "cartoes"; secao: string; titulo: string; campos: CampoDoCartao[] }
  | { tipo: "pergunta"; secao: string; titulo: string; campos: CampoDoCartao[] }
  | { tipo: "fim" };

export type MensagemDaConversa = {
  id: string;
  autor: "cliente" | "entrevistadora" | "sistema" | "lexia";
  tipo: "texto" | "audio" | "arquivo" | "cartao";
  conteudo: string;
  dados: Record<string, unknown>;
  criado_em: string;
  processada_em: string | null;
};

/** O que a cliente manda num turno. Tudo opcional, mas alguma coisa tem de vir. */
export type Resposta = {
  /** Gerado no aparelho: reenviar a mesma mensagem não a duplica. */
  idDoAparelho: string;
  texto?: string;
  /** Áudio ou arquivo já enviado; `textoDoArquivo` é a transcrição ou a leitura dele. */
  arquivoId?: string;
  tipoDoArquivo?: "audio" | "arquivo";
  textoDoArquivo?: string;
  /** Confirmações (com o valor, corrigido ou não) e escolhas dos cartões. `valor: null` = "não é isso". */
  valores?: { campo: string; itemId: string | null; valor: unknown }[];
  /** Resposta ao cartão da lista: que itens ficam e que nomes entram. */
  lista?: { manter: string[]; novos: string[] };
  /** "Não sei agora": o que este passo perguntava vai para as pendências. */
  pular?: boolean;
  /** No passo de um grupo vazio: "não tenho". */
  nenhum?: boolean;
};

// ------------------------------------------------------------------ as dependências

export type Extracao = {
  campos: { chave: string; item: string; valor: string; lista: string[]; estado: "respondido" | "vago" | "nao_se_aplica" }[];
  horarios: { dia: string; abre: string; fecha: string }[];
  novos_itens: { grupo: string; nome: string; campos: { chave: string; valor: string }[] }[];
  /** Pergunta que a cliente fez à entrevistadora, se fez. */
  duvida: string;
};

export type ContextoDaExtracao = {
  passo: Cartao;
  /** Itens ativos, com a referência que a IA usa para dizer de qual está a falar (ex.: "servicos#2"). */
  itens: { ref: string; grupo: GrupoQueRepete; nome: string }[];
  /** Chaves da raiz ainda sem resposta (as únicas da raiz que a IA pode preencher, além das do passo). */
  raizEmAberto: string[];
  ultimas: { autor: string; texto: string }[];
  texto: string;
};

/**
 * O andamento, como está guardado no banco. TODOS os campos têm de voltar: a 17/11/2026 a leitura deixava
 * "tabelas" de fora e, depois da tabela dos serviços, o servidor achava que o passo ainda era a tabela
 * enquanto a tela mostrava o serviço: a resposta dela era conferida contra o passo errado e não mudava nada.
 */
export function andamentoDoCursor(c: Partial<Andamento> | null | undefined): Andamento {
  return { listas: [...(c?.listas ?? [])], gruposPerguntados: [...(c?.gruposPerguntados ?? [])], tabelas: [...(c?.tabelas ?? [])], ...(c?.semResposta ? { semResposta: c.semResposta } : {}) };
}

export type ContextoDaFala = {
  nomeDaCliente: string;
  passo: Cartao;
  /** Segunda vez neste passo: só falta um complemento. */
  complemento: boolean;
  anotado: string[];
  /** Rascunhos que ela corrigiu por texto ou áudio: a fala mostra como ficou, para ela ver que valeu. */
  atualizado?: { rotulo: string; valor: string }[];
  paraALexia: string[];
  duvida: string;
  ultimas: { autor: string; texto: string }[];
};

export type Inteligencia = {
  extrair(c: ContextoDaExtracao): Promise<Extracao>;
  falar(c: ContextoDaFala): Promise<string>;
};

/** Como a entrevista estava ANTES de um turno: é para aqui que o "voltar" regressa. */
export type PontoDeRetorno = { mensagem: string; andamento: Andamento; itens: { id: string; removido: boolean }[] };

export type Repositorio = {
  linhas(): Promise<LinhaDoCaderno[]>;
  itens(): Promise<ItemDoCaderno[]>;
  andamento(): Promise<Andamento>;
  gravarAndamento(a: Andamento): Promise<void>;
  acrescentarLinhas(linhas: NovaLinha[]): Promise<void>;
  criarItem(grupo: GrupoQueRepete, ordem: number): Promise<string>;
  removerItens(ids: string[]): Promise<void>;
  /** Grava a mensagem da cliente. Se o `idDoAparelho` já existe, devolve a que lá está. */
  gravarDaCliente(r: Resposta): Promise<MensagemDaConversa>;
  marcarProcessada(id: string): Promise<void>;
  /** `volta` é o ponto de retorno do turno que esta fala fecha (para o "voltar à pergunta anterior"). */
  gravarDaEntrevistadora(texto: string, cartao: Cartao, volta?: PontoDeRetorno): Promise<MensagemDaConversa>;
  /**
   * Desfaz um turno SEM APAGAR NADA dela (19/11/2026: a Jessica perdeu respostas ao "voltar"). As linhas que o turno
   * escreveu saem do caderno, mas ficam copiadas, inteiras, no histórico da mensagem dela; os itens que o turno criou
   * ficam marcados como tirados (não são apagados); os que tirou voltam; as duas mensagens (a dela e a fala seguinte)
   * ficam marcadas como desfeitas (`dados.desfeita`) e saem da conversa, mas continuam no banco.
   */
  desfazer(d: { dela: MensagemDaConversa; fala: MensagemDaConversa; tirarItens: string[]; restaurarItens: string[] }): Promise<void>;
  /** As mensagens da conversa, sem as desfeitas pelo "corrigir a resposta anterior". */
  mensagens(): Promise<MensagemDaConversa[]>;
  terminar(): Promise<void>;
};

// ------------------------------------------------------------------ do caderno para a tela

const SECOES = new Map(ESQUEMA_ONBOARDING.map((s) => [s.chave, s.titulo]));
const NOME_DO_ITEM: Record<GrupoQueRepete, string> = { servicos: "nome", profissionais: "nome", faqs: "pergunta", objecoes: "objecao", promocoes: "nome" };

const paraCartao = (c: CampoNoCaderno): CampoDoCartao => ({
  campo: c.campo.chave,
  itemId: c.itemId,
  pergunta: c.campo.pergunta,
  tipo: c.campo.tipo,
  ...(c.campo.opcoes ? { opcoes: c.campo.opcoes } : {}),
  ...(c.campo.opcoesDe ? { opcoesDe: c.campo.opcoesDe } : {}),
  ...(c.campo.recomendado !== undefined ? { recomendado: c.campo.recomendado } : {}),
  ...(c.campo.ajuda ? { ajuda: c.campo.ajuda } : {}),
  ...(c.campo.atencao ? { atencao: true } : {}),
  ...(c.situacao === "por_confirmar" && c.linha ? { valor: c.linha.valor, fonte: c.linha.fonte, ...(c.linha.evidencia?.a_confirmar === true ? { aConfirmar: true } : {}) } : {}),
});

export function nomeDoItem(itemId: string, grupo: GrupoQueRepete, linhas: LinhaDoCaderno[]): string {
  const l = linhas.find((x) => x.item_id === itemId && x.campo === NOME_DO_ITEM[grupo]);
  return typeof l?.valor === "string" ? l.valor : "";
}

/**
 * O cartão do passo. Os campos cujas opções vêm de um grupo (os serviços que cada profissional faz) recebem
 * aqui as opções: os nomes dos itens ativos desse grupo.
 */
export function cartaoDoPasso(passo: Passo, linhas: LinhaDoCaderno[], itens: ItemDoCaderno[] = []): Cartao {
  const cartao = cartaoSemOpcoes(passo, linhas);
  const nomes = (g: GrupoQueRepete) => [...new Set(itens.filter((i) => i.grupo === g && !i.removido).map((i) => nomeDoItem(i.id, g, linhas)).filter(Boolean))];
  const completar = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(completar);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (typeof o.campo === "string" && typeof o.opcoesDe === "string") o.opcoes = nomes(o.opcoesDe as GrupoQueRepete);
    else Object.values(o).forEach(completar);
  };
  completar(cartao);
  return cartao;
}

function cartaoSemOpcoes(passo: Passo, linhas: LinhaDoCaderno[]): Cartao {
  switch (passo.tipo) {
    case "confirmar":
      return { tipo: "confirmar", campos: passo.campos.map(paraCartao) };
    case "lista":
      return {
        tipo: "lista",
        grupo: passo.grupo,
        itens: passo.itens.map((i) => {
          const campos = passo.detalhes.find((d) => d.itemId === i.id)?.campos.map(paraCartao);
          return { id: i.id, nome: nomeDoItem(i.id, passo.grupo, linhas), ...(campos?.length ? { campos } : {}) };
        }),
      };
    case "itens":
      return { tipo: "itens", grupo: passo.grupo, obrigatorio: passo.obrigatorio };
    case "tabela":
      return { tipo: "tabela", grupo: passo.grupo, linhas: passo.linhas.map((l) => ({ itemId: l.itemId, nome: nomeDoItem(l.itemId, passo.grupo, linhas), campos: l.campos.map(paraCartao) })) };
    case "item": {
      // O nome do item é o título do cartão: não se confirma à parte (a lista já o confirmou).
      const semNome = (cs: CampoNoCaderno[]) => cs.filter((c) => c.campo.chave !== NOME_DO_ITEM[passo.grupo]);
      return { tipo: "item", grupo: passo.grupo, itemId: passo.itemId, nome: nomeDoItem(passo.itemId, passo.grupo, linhas), confirmar: semNome(passo.confirmar).map(paraCartao), cartoes: passo.cartoes.map(paraCartao), faltam: semNome(passo.faltam).map(paraCartao) };
    }
    case "cartoes":
      return { tipo: "cartoes", secao: passo.secao, titulo: passo.secao === SECAO_DAS_RECOMENDADAS ? "Recomendações da Lexia" : (SECOES.get(passo.secao) ?? ""), campos: passo.campos.map(paraCartao) };
    case "pergunta":
      return { tipo: "pergunta", secao: passo.secao, titulo: SECOES.get(passo.secao) ?? "", campos: passo.campos.map(paraCartao) };
    default:
      return { tipo: "fim" };
  }
}

/** Todos os campos que um passo põe à frente da cliente. */
function camposDoPasso(passo: Passo): CampoNoCaderno[] {
  if (passo.tipo === "confirmar" || passo.tipo === "cartoes" || passo.tipo === "pergunta") return passo.campos;
  if (passo.tipo === "item") return [...passo.confirmar, ...passo.cartoes, ...passo.faltam];
  if (passo.tipo === "tabela") return passo.linhas.flatMap((l) => l.campos);
  if (passo.tipo === "lista") return passo.detalhes.flatMap((d) => d.campos);
  return [];
}

// ------------------------------------------------------------------ conferir valores

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const limpo = (v: unknown) => String(v ?? "").trim();

/** Um valor só entra no caderno se couber no campo. `undefined` = não entra. */
export function conferir(campo: CampoOnboarding, valor: unknown): unknown | undefined {
  if (campo.tipo === "horarios") {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
    const bons = Object.entries(valor as Record<string, unknown>).filter(([d, h]) => DIAS.includes(d) && Array.isArray(h) && h.length === 2 && h.every((x) => HORA.test(limpo(x))));
    return bons.length ? Object.fromEntries(bons.map(([d, h]) => [d, (h as string[]).map((x) => limpo(x).padStart(5, "0"))])) : undefined;
  }
  if (campo.tipo === "multi") {
    const lista = (Array.isArray(valor) ? valor : limpo(valor).split(/[;,]/)).map(limpo).filter(Boolean);
    // Opções que vêm de um grupo (os serviços): valem os nomes que a tela mandou, sem lista fixa.
    const boas = [...new Set(lista)].filter((x) => (campo.opcoesDe ? x.length <= 300 : campo.opcoes?.includes(x))).slice(0, 80);
    return boas.length ? boas : undefined;
  }
  const v = limpo(Array.isArray(valor) ? valor[0] : valor).slice(0, 6000);
  if (!v) return undefined;
  if (campo.opcoes?.length) return campo.opcoes.includes(v) ? v : undefined;
  return v;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Um campo que só existe depois de outro ser respondido (o preço só aparece depois do "tipo de preço")
 * ainda não está no caderno quando ela responde aos dois na mesma fala. Aceita-se, se ninguém o respondeu ainda.
 */
function condicional(chave: string, item: ItemDoCaderno | null, linhas: LinhaDoCaderno[]): CampoNoCaderno | null {
  const campo = campoDoEsquema(chave, item?.grupo ?? null);
  if (!campo?.quando || campo.tipo === "upload") return null;
  const linha = linhas.find((l) => l.campo === chave && l.item_id === (item?.id ?? null)) ?? null;
  if (linha && ["confirmado", "respondido", "nao_se_aplica"].includes(linha.estado)) return null;
  return { secao: "", grupo: item?.grupo ?? null, itemId: item?.id ?? null, campo, linha, situacao: "falta" };
}

// ------------------------------------------------------------------ o turno

export type ResultadoDoTurno = { mensagens: MensagemDaConversa[]; progresso: Progresso };
export type Progresso = { percentual: number; resolvidos: number; total: number; pendencias: number; terminou: boolean };

function progressoDe(linhas: LinhaDoCaderno[], itens: ItemDoCaderno[], terminou: boolean): Progresso {
  const r = resumir(montarCaderno(linhas, itens), itens);
  return { percentual: r.percentual, resolvidos: r.resolvidos, total: r.total, pendencias: r.pendencias, terminou };
}

const ultimasDe = (ms: MensagemDaConversa[]) => ms.slice(-6).map((m) => ({ autor: m.autor, texto: m.conteudo.slice(0, 700) }));

const LISTA_ACHADA: Record<GrupoQueRepete, string> = {
  servicos: "Estes são os serviços que eu encontrei.",
  profissionais: "Estes são os profissionais que eu encontrei.",
  faqs: "Estas são as perguntas frequentes que eu encontrei.",
  objecoes: "Estas são as objeções que eu encontrei.",
  promocoes: "Estas são as promoções que eu encontrei.",
};
const LISTA_SUGERIDA: Record<GrupoQueRepete, string> = {
  servicos: LISTA_ACHADA.servicos,
  profissionais: "Estes são os profissionais que eu encontrei, com o que cada um faz.",
  faqs: "Preparei as perguntas que clientes de negócios como o seu mais fazem, cada uma com uma resposta sugerida.",
  objecoes: "Preparei as objeções que mais aparecem em negócios como o seu, cada uma com uma sugestão de resposta.",
  promocoes: "Estas são as promoções que eu encontrei.",
};
const QUAIS_SAO: Record<GrupoQueRepete, string> = {
  servicos: "Quais serviços você oferece?",
  profissionais: "Quem atende aí com você, e o que cada pessoa faz?",
  faqs: "Quais são as perguntas que as clientes mais fazem, e o que você costuma responder?",
  objecoes: "Quais objeções você mais ouve (preço, medo, tempo) e como costuma responder?",
  promocoes: "Você tem alguma promoção ou pacote valendo agora?",
};
const PRINCIPAIS: Record<GrupoQueRepete, string> = { servicos: "os serviços principais", profissionais: "quem atende", faqs: "as perguntas mais comuns", objecoes: "as objeções mais comuns", promocoes: "as promoções principais" };

/** O nome curto de cada informação, para a fala da entrevistadora (a pergunta inteira fica no cartão). */
const ROTULO: Record<string, string> = {
  descricao_e_indicacao: "o que é e como é feito",
  para_quem_indicar: "para quem você indica",
  preparo_e_cuidados: "os cuidados antes e depois",
  contraindicacoes: "as contraindicações",
  numero_de_sessoes: "quantas sessões costuma levar",
  tipo_de_preco: "como é o preço",
  valor: "o preço",
  faixa_de_preco: "uma faixa de preço (mínimo e máximo), para dar uma noção a quem pergunta",
  duracao_media: "quanto tempo leva",
  variacao_de_preco: "como o preço varia",
  motivo_da_avaliacao: "por que o preço depende de avaliação",
  especialidade: "o que essa pessoa faz",
};
const rotuloCurto = (c: CampoDoCartao) => ROTULO[c.campo] ?? c.pergunta.replace(/[?.]$/, "").replace(/^./, (x) => x.toLowerCase());
const emLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

export const MAIS_CONFERENCIA = "Mais um pouco do que eu encontrei. Confere também?";

/** A fala de reserva, quando a IA não responde: seca, mas correta, e a conversa não para. */
export function falaPadrao(cartao: Cartao, complemento: boolean): string {
  switch (cartao.tipo) {
    case "confirmar":
      return "Olha o que eu já encontrei sobre o seu negócio. Confere pra mim? Se algo estiver errado, é só corrigir no próprio campo e tocar em continuar.";
    case "lista":
      if (cartao.itens.some((i) => i.campos?.length)) return `${LISTA_SUGERIDA[cartao.grupo]} Corrija o que for diferente aí, desmarque o que não vale e acrescente o que estiver faltando.`;
      return `${LISTA_ACHADA[cartao.grupo]} Desmarca o que não vale e acrescenta o que estiver faltando.`;
    case "itens":
      return complemento ? `Consegue me contar pelo menos ${PRINCIPAIS[cartao.grupo]}? Fala no microfone abaixo ou escreve.` : `${QUAIS_SAO[cartao.grupo]} Fala no microfone abaixo ou escreve.`;
    case "tabela":
      return "Agora o preço e a duração de cada serviço, tudo de uma vez. Em cada linha, digita o preço e toca no relógio para escolher o tempo. Se o preço de algum só sai depois de avaliar, toca em \"Só após avaliação\" na linha dele e, se puder, coloca um mínimo e um máximo.";
    case "item": {
      const nome = cartao.nome || "este item";
      const contar = cartao.faltam.filter((c) => !c.opcoes?.length && c.campo !== "valor").map(rotuloCurto);
      const tocar = cartao.faltam.filter((c) => c.opcoes?.length || c.campo === "valor").map(rotuloCurto);
      const sugestoes = cartao.confirmar.some((c) => c.fonte === "recomendacao");
      const achados = cartao.confirmar.some((c) => c.fonte !== "recomendacao");
      const partes = [complemento ? `Sobre ${nome}, ficou faltando só isto.` : `Agora ${nome}.`];
      if (contar.length) partes.push(`Me conta com detalhes, falando no microfone de cada pergunta abaixo ou escrevendo:\n${contar.map((x) => `• ${x}`).join("\n")}`);
      const fim = [
        tocar.length ? `Marca abaixo ${emLista(tocar)}.` : "",
        // O que já existe aparece sempre: ela confere, corrige no campo ou explica melhor por áudio.
        complemento || (!sugestoes && !achados) ? "" : sugestoes ? "Deixei abaixo uma sugestão para o resto: confere e, se quiser mudar, toca em Ver e editar para corrigir escrevendo ou falando." : "O que eu já achei está abaixo: confere e corrige se precisar.",
      ].filter(Boolean).join(" ");
      return [partes.join(" "), fim].filter(Boolean).join(contar.length ? "\n" : " ");
    }
    case "cartoes":
      if (cartao.secao === SECAO_DAS_RECOMENDADAS) return "Para estas escolhas, já deixei marcado o que costuma funcionar melhor. Dá uma olhada: o que você quiser diferente, é só tocar em Mudar. O que estiver bom fica como está.";
      return "Agora algumas escolhas rápidas, é só tocar. As que costumam funcionar melhor estão sinalizadas como recomendadas: você pode marcar todas de uma vez e mudar o que quiser.";
    case "pergunta":
      return cartao.campos.map((c) => c.pergunta).join(" ");
    default:
      return "Terminamos a conversa! Agora é só revisar tudo na próxima etapa.";
  }
}

async function falar(ia: Inteligencia, c: ContextoDaFala): Promise<string> {
  // Cartões de toque não precisam de IA para serem apresentados (resposta na hora), salvo se ela perguntou algo.
  // Também o serviço em que só há rascunho para conferir: nada a perguntar, é só apresentar.
  // O passo de um item (serviço, profissional) é sempre apresentado pelo código: curto, igual de um para o outro
  // e dizendo exatamente o que contar (a IA enumerava tudo o que estava no cartão e a fala virava um parágrafo).
  const simples = (c.passo.tipo === "confirmar" || c.passo.tipo === "cartoes" || c.passo.tipo === "lista" || c.passo.tipo === "tabela" || c.passo.tipo === "item") && !c.duvida;
  // Quando ela corrigiu um rascunho por áudio ou texto, a fala começa mostrando como ficou: ela vê que valeu.
  const curto = (x: string) => (x.length > 260 ? `${x.slice(0, 257).trimEnd()}…` : x);
  const mudou = (c.atualizado ?? []).slice(0, 3).map((a) => `Atualizei ${a.rotulo} com o que você falou. Ficou assim: "${curto(a.valor)}"`).join("\n");
  const comMudanca = (fala: string) => (mudou ? `${mudou}\n\n${fala}` : fala);
  if (simples) {
    const antes = c.passo.tipo === "item" ? [!mudou && c.anotado.length ? "Anotei." : "", c.paraALexia.length ? "O que ficou em aberto eu deixo para a equipe da Lexia ver com você." : ""].filter(Boolean).join(" ") : "";
    return comMudanca([antes, falaPadrao(c.passo, c.complemento)].filter(Boolean).join(" "));
  }
  try {
    const texto = (await ia.falar(c)).trim();
    if (texto) return comMudanca(texto);
  } catch {
    // cai para a fala de reserva
  }
  return comMudanca(falaPadrao(c.passo, c.complemento));
}

/** Abre a conversa (uma vez só): a apresentação e o primeiro passo. */
export async function abrirConversa(repo: Repositorio, ia: Inteligencia, nomeDaCliente: string): Promise<ResultadoDoTurno> {
  const existentes = await repo.mensagens();
  const [linhas, itens, andamento] = await Promise.all([repo.linhas(), repo.itens(), repo.andamento()]);
  if (existentes.length) return { mensagens: existentes, progresso: progressoDe(linhas, itens, proximoPasso(montarCaderno(linhas, itens), itens, andamento).tipo === "fim") };
  const passo = proximoPasso(montarCaderno(linhas, itens), itens, andamento);
  const cartao = cartaoDoPasso(passo, linhas, itens);
  const ola = `Oi${nomeDaCliente ? `, ${nomeDaCliente.split(" ")[0]}` : ""}! Eu sou a Lia, da Lexia. Vou montar a sua assistente com você. Dá para parar e voltar quando quiser: fica tudo salvo.`;
  const fala = await falar(ia, { nomeDaCliente, passo: cartao, complemento: false, anotado: [], paraALexia: [], duvida: "", ultimas: [] });
  const m = await repo.gravarDaEntrevistadora(`${ola}\n\n${fala}`, cartao);
  return { mensagens: [m], progresso: progressoDe(linhas, itens, passo.tipo === "fim") };
}

export async function turno(repo: Repositorio, ia: Inteligencia, resposta: Resposta, nomeDaCliente: string): Promise<ResultadoDoTurno> {
  // 1) gravar primeiro
  const recebida = await repo.gravarDaCliente(resposta);
  if (recebida.processada_em) {
    // Reenvio de uma mensagem já tratada: devolve-se a conversa como está, sem anotar de novo.
    const [linhas, itens, andamento, todas] = await Promise.all([repo.linhas(), repo.itens(), repo.andamento(), repo.mensagens()]);
    return { mensagens: todas, progresso: progressoDe(linhas, itens, proximoPasso(montarCaderno(linhas, itens), itens, andamento).tipo === "fim") };
  }

  let [linhas, itens] = await Promise.all([repo.linhas(), repo.itens()]);
  const andamento: Andamento = { ...ANDAMENTO_VAZIO, ...(await repo.andamento()) };
  andamento.listas = [...andamento.listas];
  andamento.gruposPerguntados = [...andamento.gruposPerguntados];
  andamento.tabelas = [...(andamento.tabelas ?? [])];
  const volta: PontoDeRetorno = { mensagem: recebida.id, andamento: JSON.parse(JSON.stringify(andamento)) as Andamento, itens: itens.map((i) => ({ id: i.id, removido: i.removido })) };
  const caderno = montarCaderno(linhas, itens);
  const passo = proximoPasso(caderno, itens, andamento);
  const doPasso = camposDoPasso(passo);
  const chave = (campo: string, item: string | null) => `${item ?? ""}|${campo}`;
  const noPasso = new Map(doPasso.map((c) => [chave(c.campo.chave, c.itemId), c]));
  const novas: NovaLinha[] = [];
  const resolvidas = new Set<string>();
  const anotado: string[] = [];
  const paraALexia: string[] = [];
  const anotar = (c: { campo: CampoOnboarding; itemId: string | null }, valor: unknown, estado: NovaLinha["estado"]) => {
    novas.push({ campo: c.campo.chave, itemId: c.itemId, valor, estado, fonte: "cliente", evidencia: { mensagem: recebida.id } });
    if (estado !== "vago") {
      resolvidas.add(chave(c.campo.chave, c.itemId));
      anotado.push(c.campo.pergunta);
    }
  };

  // 2) entender o texto ou o áudio ANTES de escrever seja o que for: se a IA falhar aqui, nada ficou a meio
  //    e reenviar a mesma mensagem recomeça do princípio.
  const texto = [resposta.texto, resposta.textoDoArquivo].map(limpo).filter(Boolean).join("\n\n");
  let duvida = "";
  const anteriores = await repo.mensagens();
  const refs = new Map<string, ItemDoCaderno>();
  const porGrupo: Record<string, number> = {};
  const listaDeItens = itens.filter((i) => !i.removido).map((i) => {
    const ref = `${i.grupo}#${(porGrupo[i.grupo] = (porGrupo[i.grupo] ?? 0) + 1)}`;
    refs.set(ref, i);
    return { ref, grupo: i.grupo, nome: nomeDoItem(i.id, i.grupo, linhas) };
  });
  const extraido = texto
    ? await ia.extrair({ passo: cartaoDoPasso(passo, linhas, itens), itens: listaDeItens, raizEmAberto: caderno.filter((c) => !c.grupo && (c.situacao === "falta" || c.situacao === "por_confirmar")).map((c) => c.campo.chave), ultimas: ultimasDe(anteriores.filter((m) => m.id !== recebida.id)), texto })
    : null;

  // 3) o que veio nos cartões
  // O cartão manda junto os rascunhos em que ela não mexeu. Se ela falou desse mesmo campo no áudio ou no texto,
  // vale o que ela disse: o rascunho intacto não passa por cima.
  const ditos = new Set((extraido?.campos ?? []).filter((e) => e.estado === "respondido").map((e) => chave(e.chave, e.item ? (refs.get(e.item)?.id ?? "?") : null)));
  const atualizado: { rotulo: string; valor: string }[] = [];
  const mandados = new Map((resposta.valores ?? []).map((v) => [chave(String(v.campo), v.itemId ?? null), v.valor]));
  for (const v of resposta.valores ?? []) {
    let c = noPasso.get(chave(String(v.campo), v.itemId ?? null));
    // Um campo que depende de outro e vem no MESMO cartão (o preço junto do tipo de preço, o texto que abre ao
    // escolher "Outro"): ainda não está no passo, mas vale, desde que a resposta de que depende venha junto e o peça.
    if (!c) {
      const idDoItem = v.itemId ?? null;
      const candidato = condicional(String(v.campo), idDoItem ? (itens.find((i) => i.id === idDoItem) ?? null) : null, linhas);
      const q = candidato?.campo.quando;
      const pais = q ? ("algum" in q ? q.algum : [q]).map((x) => x.campo) : [];
      const juntos = Object.fromEntries(pais.map((p) => [p, mandados.get(chave(p, idDoItem))]));
      if (candidato && q && (!idDoItem || itens.some((i) => i.id === idDoItem)) && pais.some((p) => noPasso.has(chave(p, idDoItem)) && mandados.has(chave(p, idDoItem))) && seAplica(q, juntos)) c = candidato;
    }
    if (!c || resolvidas.has(chave(c.campo.chave, c.itemId))) continue;
    if (v.valor === null) continue; // "não é isso": fica por responder e segue para a conversa
    const valor = conferir(c.campo, v.valor);
    if (valor === undefined) continue;
    if (c.situacao === "por_confirmar" && igual(valor, c.linha?.valor) && ditos.has(chave(c.campo.chave, c.itemId))) continue;
    anotar(c, valor, c.situacao === "por_confirmar" && igual(valor, c.linha?.valor) ? "confirmado" : "respondido");
  }
  // Lista sem resposta no cartão (ela escreveu ou falou em vez de tocar): ficam todos, e o que ela
  // tiver dito a mais entra pelos "novos_itens". A lista mostra-se uma vez só.
  const soDuvidaNaLista = passo.tipo === "lista" && !resposta.lista && !!limpo(extraido?.duvida) && !(extraido?.novos_itens ?? []).length;
  if (passo.tipo === "lista" && !soDuvidaNaLista) {
    const escolha = resposta.lista ?? { manter: passo.itens.map((i) => i.id), novos: [] };
    const manter = new Set(escolha.manter.map(String));
    const sair = passo.itens.filter((i) => !manter.has(i.id)).map((i) => i.id);
    if (sair.length) await repo.removerItens(sair);
    let ordem = Math.max(-1, ...itens.filter((i) => i.grupo === passo.grupo).map((i) => i.ordem));
    for (const nome of [...new Set(escolha.novos.map(limpo).filter(Boolean))].slice(0, 40)) {
      const id = await repo.criarItem(passo.grupo, ++ordem);
      novas.push({ campo: NOME_DO_ITEM[passo.grupo], itemId: id, valor: nome.slice(0, 300), estado: "respondido", fonte: "cliente", evidencia: { mensagem: recebida.id } });
    }
    // Os nomes que ficaram estão confirmados por ela.
    for (const i of passo.itens.filter((x) => manter.has(x.id))) {
      const l = linhas.find((x) => x.item_id === i.id && x.campo === NOME_DO_ITEM[passo.grupo]);
      if (l?.estado === "rascunho") novas.push({ campo: l.campo, itemId: i.id, valor: l.valor, estado: "confirmado", fonte: "cliente", evidencia: { mensagem: recebida.id } });
    }
    andamento.listas.push(passo.grupo);
  }

  // 4) o que veio em texto ou áudio: o código confere cada valor
  if (extraido) {
    duvida = limpo(extraido.duvida).slice(0, 500);

    const horarios = Object.fromEntries((extraido.horarios ?? []).filter((h) => DIAS.includes(h.dia) && HORA.test(limpo(h.abre)) && HORA.test(limpo(h.fecha))).map((h) => [h.dia, [limpo(h.abre), limpo(h.fecha)]]));
    const todos = [...(extraido.campos ?? []).map((c) => ({ ...c, bruto: c.lista?.length ? c.lista : c.valor })), ...(Object.keys(horarios).length ? [{ chave: "horario_por_dia", item: "", bruto: horarios as unknown, estado: "respondido" as const }] : [])];
    for (const e of todos) {
      const item = e.item ? refs.get(e.item) : undefined;
      if (e.item && !item) continue;
      // Só se anota num campo que está em aberto no caderno (ou que este passo perguntou): a IA não reescreve o que já foi respondido.
      const alvo = caderno.find((c) => c.campo.chave === e.chave && c.itemId === (item?.id ?? null)) ?? condicional(e.chave, item ?? null, linhas);
      if (!alvo) continue;
      const k = chave(alvo.campo.chave, alvo.itemId);
      if (resolvidas.has(k) || (alvo.situacao === "resolvido" && !noPasso.has(k))) continue;
      if (e.estado === "nao_se_aplica") {
        anotar(alvo, null, "nao_se_aplica");
        continue;
      }
      const valor = conferir(alvo.campo, e.bruto);
      if (valor === undefined || e.estado === "vago") continue;
      if (alvo.situacao === "por_confirmar" && typeof valor === "string") atualizado.push({ rotulo: ROTULO[alvo.campo.chave] ?? alvo.campo.pergunta.replace(/[?.]$/, ""), valor });
      anotar(alvo, valor, "respondido");
    }

    // Itens novos de que ela falou (um serviço que não estava na lista, uma pergunta frequente…)
    const grupos = new Map(ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).map((g) => [g.chave as string, g]));
    for (const n of (extraido.novos_itens ?? []).slice(0, 40)) {
      const g = grupos.get(n.grupo);
      const nome = limpo(n.nome).slice(0, 300);
      if (!g || !nome) continue;
      const jaExiste = listaDeItens.some((i) => i.grupo === g.chave && i.nome.toLowerCase() === nome.toLowerCase());
      if (jaExiste) continue;
      const ordem = Math.max(-1, ...itens.filter((i) => i.grupo === g.chave).map((i) => i.ordem)) + 1;
      const id = await repo.criarItem(g.chave, ordem);
      itens = [...itens, { id, grupo: g.chave, ordem, removido: false }];
      listaDeItens.push({ ref: "", grupo: g.chave, nome });
      novas.push({ campo: NOME_DO_ITEM[g.chave], itemId: id, valor: nome, estado: "respondido", fonte: "cliente", evidencia: { mensagem: recebida.id } });
      for (const c of n.campos ?? []) {
        const campo = g.campos.find((x) => x.chave === c.chave && x.chave !== NOME_DO_ITEM[g.chave]);
        const valor = campo ? conferir(campo, c.valor) : undefined;
        if (campo && valor !== undefined) novas.push({ campo: campo.chave, itemId: id, valor, estado: "respondido", fonte: "cliente", evidencia: { mensagem: recebida.id } });
      }
      // Ela acabou de os dizer: a lista deste grupo não precisa de ser conferida outra vez.
      if (passo.tipo === "itens" && passo.grupo === g.chave && !andamento.listas.includes(g.chave)) andamento.listas.push(g.chave);
    }
  }

  // 5) o que este passo pôs à frente dela e ficou sem resposta
  if (passo.tipo === "itens") andamento.gruposPerguntados.push(passo.grupo);
  const perguntados = new Set(perguntadosNoPasso(passo).map((c) => chave(c.campo.chave, c.itemId)));
  // Se ela só fez uma pergunta (ou só mandou um arquivo) e não respondeu a nada, o passo repete-se sem gastar uma tentativa.
  const semResposta = resolvidas.size === 0 && !resposta.pular && !resposta.nenhum && !(resposta.valores ?? []).length && !resposta.lista;
  // Também não gasta tentativa a PRIMEIRA resposta que não toca em nenhuma das perguntas do passo
  // ("está tudo certo", ao conferir o cartão). À segunda vez seguida no mesmo passo, conta: a conversa não fica presa.
  const idDoPasso = passo.tipo === "item" ? `item:${passo.itemId}` : passo.tipo === "pergunta" ? `pergunta:${passo.campos.map((c) => c.campo.chave).join(",")}` : passo.tipo === "itens" ? `itens:${passo.grupo}` : "";
  const nenhumaDasPerguntas = !!idDoPasso && !resposta.pular && !resposta.nenhum && ![...perguntados].some((x) => resolvidas.has(x)) && !(passo.tipo === "itens" && itens.some((i) => i.grupo === passo.grupo && !i.removido));
  // Só na primeira vez que o passo aparece (nenhuma das perguntas dele foi contada ainda).
  const nuncaContado = perguntadosNoPasso(passo).every((c) => c.linha?.estado !== "vago");
  const segundaVezSemResposta = nenhumaDasPerguntas && andamento.semResposta === idDoPasso;
  const primeiraVezSemResposta = nenhumaDasPerguntas && !segundaVezSemResposta && nuncaContado;
  andamento.semResposta = nenhumaDasPerguntas ? idDoPasso : undefined;
  const naoConta = primeiraVezSemResposta || (semResposta && (!!duvida || (!limpo(resposta.texto) && resposta.tipoDoArquivo === "arquivo")));
  if (passo.tipo === "itens" && naoConta) andamento.gruposPerguntados.pop();
  // A tabela mostra-se uma vez: o que ficar em branco é perguntado depois, no serviço a que pertence.
  if (passo.tipo === "tabela" && !naoConta) andamento.tabelas.push(passo.grupo);
  for (const c of naoConta ? [] : doPasso) {
    const k = chave(c.campo.chave, c.itemId);
    if (resolvidas.has(k)) continue;
    if (resposta.pular) {
      novas.push({ campo: c.campo.chave, itemId: c.itemId, valor: c.linha?.valor ?? null, estado: "pulado", fonte: "cliente", evidencia: { mensagem: recebida.id }, perguntas: (c.linha?.perguntas ?? 0) + 1 });
      paraALexia.push(c.campo.pergunta);
      continue;
    }
    // Conta uma pergunta. À segunda sem resposta, o caderno passa-o a pendência (nunca uma terceira).
    // Duas respostas seguidas sem tocar em nenhuma pergunta do passo: a primeira foi de graça, esta fecha o assunto
    // (o passo já lhe apareceu duas vezes; não aparece uma terceira).
    const perguntas = segundaVezSemResposta && perguntados.has(k) ? 2 : (c.linha?.estado === "vago" ? c.linha.perguntas : 0) + 1;
    // O valor que já lá estava (do Moxie, do site, de uma resposta anterior) NUNCA se apaga: "vago" só diz que ela não
    // confirmou. Caso K-Glow, 25/11: o preço e a duração do Moxie de dois serviços ficaram em branco por isto.
    // A passagem ao agente só leva confirmado/respondido, por isso guardar o valor não o faz passar por resposta dela.
    novas.push({ campo: c.campo.chave, itemId: c.itemId, valor: c.linha?.valor ?? null, estado: "vago", fonte: "cliente", evidencia: { mensagem: recebida.id }, perguntas });
    if (perguntas >= 2) paraALexia.push(c.campo.pergunta);
  }

  // 6) gravar e decidir o que vem a seguir
  await repo.acrescentarLinhas(novas);
  await repo.gravarAndamento(andamento);
  await repo.marcarProcessada(recebida.id);
  [linhas, itens] = await Promise.all([repo.linhas(), repo.itens()]);
  const seguinte = proximoPasso(montarCaderno(linhas, itens), itens, andamento);
  const cartao = cartaoDoPasso(seguinte, linhas, itens);
  const mesmoPasso = (seguinte.tipo === "item" && passo.tipo === "item" && seguinte.itemId === passo.itemId) || (seguinte.tipo === "itens" && passo.tipo === "itens" && seguinte.grupo === passo.grupo) || (seguinte.tipo === "pergunta" && passo.tipo === "pergunta" && seguinte.campos.some((c) => perguntados.has(chave(c.campo.chave, c.itemId))));
  // Vários cartões de conferência seguidos: a segunda fala não repete a primeira.
  const maisConferencia = passo.tipo === "confirmar" && seguinte.tipo === "confirmar" && !duvida;
  const fala = maisConferencia ? MAIS_CONFERENCIA : await falar(ia, { nomeDaCliente, passo: cartao, complemento: mesmoPasso, anotado, atualizado, paraALexia, duvida, ultimas: ultimasDe([...anteriores, recebida]) });
  await repo.gravarDaEntrevistadora(fala, cartao, volta);
  if (seguinte.tipo === "fim") await repo.terminar();
  return { mensagens: await repo.mensagens(), progresso: progressoDe(linhas, itens, seguinte.tipo === "fim") };
}

/** O que ela tinha respondido no turno desfeito: a tela reabre o cartão PREENCHIDO com isto, nunca com a sugestão. */
export type RespostaDesfeita = {
  /** A fala da Lia cujo cartão reabre (a última da conversa depois de voltar). */
  falaId: string;
  texto: string;
  tipo: MensagemDaConversa["tipo"];
  valores: { campo: string; itemId: string | null; valor: unknown }[];
  lista: { manter: string[]; novos: string[] } | null;
  pular: boolean;
  nenhum: boolean;
};

/** Mensagem desfeita pelo "corrigir a resposta anterior": fica no banco, mas fora da conversa. */
export const desfeita = (m: MensagemDaConversa) => !!(m.dados as { desfeita?: unknown } | null)?.desfeita;

/**
 * Corrigir a resposta anterior: desfaz o ÚLTIMO turno (o que ela respondeu e a fala que veio a seguir) e a tela
 * mostra de novo o passo anterior, PREENCHIDO com o que ela tinha respondido, para ela mudar o que quiser. Nada é
 * apagado: ver `Repositorio.desfazer`. Só o último turno, e só os feitos desde que o ponto de retorno passou a ser
 * guardado. Os áudios e arquivos enviados continuam guardados.
 */
export async function voltar(repo: Repositorio): Promise<(ResultadoDoTurno & { desfeita: RespostaDesfeita }) | null> {
  const msgs = (await repo.mensagens()).filter((m) => !desfeita(m));
  const fala = msgs.at(-1);
  const dela = msgs.at(-2);
  const volta = fala?.autor === "entrevistadora" ? (fala.dados as { volta?: PontoDeRetorno }).volta : undefined;
  if (!fala || !dela || !volta || dela.autor !== "cliente" || volta.mensagem !== dela.id) return null;
  const agora = await repo.itens();
  const antes = new Map(volta.itens.map((i) => [i.id, i]));
  await repo.desfazer({
    dela,
    fala,
    tirarItens: agora.filter((i) => !antes.has(i.id) && !i.removido).map((i) => i.id),
    restaurarItens: agora.filter((i) => i.removido && antes.get(i.id)?.removido === false).map((i) => i.id),
  });
  await repo.gravarAndamento(andamentoDoCursor(volta.andamento));
  const [linhas, itens, andamento] = await Promise.all([repo.linhas(), repo.itens(), repo.andamento()]);
  const mensagens = (await repo.mensagens()).filter((m) => !desfeita(m));
  const d = (dela.dados ?? {}) as { valores?: RespostaDesfeita["valores"]; lista?: RespostaDesfeita["lista"]; pular?: boolean; nenhum?: boolean };
  const reaberta = [...mensagens].reverse().find((m) => m.autor === "entrevistadora");
  return {
    mensagens,
    progresso: progressoDe(linhas, itens, proximoPasso(montarCaderno(linhas, itens), itens, andamento).tipo === "fim"),
    desfeita: {
      falaId: reaberta?.id ?? "",
      // Um arquivo não volta para a caixa de texto (continua guardado); o texto e a transcrição do áudio voltam.
      texto: dela.tipo === "arquivo" ? "" : dela.conteudo,
      tipo: dela.tipo,
      valores: Array.isArray(d.valores) ? d.valores : [],
      lista: d.lista ?? null,
      pular: !!d.pular,
      nenhum: !!d.nenhum,
    },
  };
}

/** A última fala pode ser desfeita? (a tela mostra o "corrigir" só nesse caso) */
export const podeVoltar = (msgs: MensagemDaConversa[]) => {
  const ativas = msgs.filter((m) => !desfeita(m));
  const fala = ativas.at(-1);
  return !!fala && fala.autor === "entrevistadora" && !!(fala.dados as { volta?: PontoDeRetorno }).volta && ativas.at(-2)?.autor === "cliente";
};

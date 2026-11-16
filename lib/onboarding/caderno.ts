/**
 * O CADERNO DE RESPOSTAS do onboarding (só lógica, sem base de dados nem IA).
 *
 * Quem decide o que falta perguntar é este ficheiro, não a IA. É isso que
 * garante as três regras do Arthur (16/11/2026):
 *
 *  1. NADA FICA DE FORA — cada campo do esquema é uma linha; a aprovação só
 *     abre quando todos os obrigatórios que se aplicam estão resolvidos.
 *  2. NENHUMA PERGUNTA SE REPETE — um campo resolvido nunca volta a "falta";
 *     um campo já perguntado duas vezes (pergunta + um complemento) vai para
 *     as pendências da Lexia em vez de ser perguntado uma terceira vez.
 *  3. NADA ENTRA SEM A CLIENTE VER — o que a IA achou nas fontes é "rascunho"
 *     e não conta como resposta até ela confirmar.
 *
 * O diário (tabela lexia_onboarding_campos) só cresce; aqui trabalha-se com a
 * linha mais recente de cada campo (view lexia_onboarding_campos_atual).
 */
import {
  ESQUEMA_ONBOARDING,
  type CampoOnboarding,
  type Condicao,
  type CondicaoSimples,
  type GrupoQueRepete,
  type SecaoOnboarding,
} from "./esquema";

export type EstadoDaLinha = "rascunho" | "confirmado" | "respondido" | "nao_se_aplica" | "vago" | "pulado";

/** A linha mais recente do diário para um campo (de um item, quando é de um grupo que se repete). */
export type LinhaDoCaderno = {
  campo: string;
  item_id: string | null;
  valor: unknown;
  estado: EstadoDaLinha;
  fonte: string;
  perguntas: number;
};

export type ItemDoCaderno = { id: string; grupo: GrupoQueRepete; ordem: number; removido: boolean };

/** Como um campo está, visto de quem conduz a entrevista. */
export type Situacao =
  | "falta" // ninguém respondeu
  | "por_confirmar" // a IA ou a Lexia preencheram; a cliente ainda não viu
  | "resolvido" // respondido, confirmado ou "não se aplica"
  | "pendencia"; // respondido de forma vaga duas vezes, ou pulado: fica para a Lexia

export type CampoNoCaderno = {
  secao: string;
  grupo: GrupoQueRepete | null;
  itemId: string | null;
  campo: CampoOnboarding;
  linha: LinhaDoCaderno | null;
  situacao: Situacao;
};

/** Teto de vezes que um campo é perguntado: a pergunta e um complemento. */
export const MAXIMO_DE_PERGUNTAS = 2;

const RESOLVIDO: EstadoDaLinha[] = ["confirmado", "respondido", "nao_se_aplica"];

function vale(c: CondicaoSimples, valores: Record<string, unknown>): boolean {
  const v = valores[c.campo];
  if (c.diferenteDe !== undefined) return v !== undefined && v !== null && v !== c.diferenteDe;
  return Array.isArray(v) ? v.includes(c.valor) : v === c.valor;
}

/** Um campo com "quando" só existe se a resposta de que depende o pedir. */
export function seAplica(quando: Condicao | undefined, valores: Record<string, unknown>): boolean {
  if (!quando) return true;
  return "algum" in quando ? quando.algum.some((c) => vale(c, valores)) : vale(quando, valores);
}

function situacaoDe(linha: LinhaDoCaderno | null): Situacao {
  if (!linha) return "falta";
  if (RESOLVIDO.includes(linha.estado)) return "resolvido";
  if (linha.estado === "rascunho") return "por_confirmar";
  if (linha.estado === "pulado") return "pendencia";
  // vago: ainda cabe UM complemento; depois disso é pendência (nunca uma terceira pergunta).
  return linha.perguntas >= MAXIMO_DE_PERGUNTAS ? "pendencia" : "falta";
}

/**
 * O caderno inteiro: todos os campos que se aplicam, cada um com a sua
 * situação. Campos de grupo aparecem uma vez por item ainda ativo.
 */
export function montarCaderno(
  linhas: LinhaDoCaderno[],
  itens: ItemDoCaderno[],
  esquema: SecaoOnboarding[] = ESQUEMA_ONBOARDING,
): CampoNoCaderno[] {
  const chave = (campo: string, item: string | null) => `${item ?? ""}|${campo}`;
  const porChave = new Map(linhas.map((l) => [chave(l.campo, l.item_id), l]));
  // Um valor só conta para as condições depois de alguém o ter dado (rascunho também: a pergunta "Outro" aparece para confirmar).
  const valoresDe = (item: string | null) =>
    Object.fromEntries(linhas.filter((l) => l.item_id === item && l.estado !== "pulado").map((l) => [l.campo, l.valor]));
  const raiz = valoresDe(null);
  const out: CampoNoCaderno[] = [];

  for (const secao of esquema) {
    for (const campo of secao.campos) {
      if (!seAplica(campo.quando, raiz)) continue;
      const linha = porChave.get(chave(campo.chave, null)) ?? null;
      out.push({ secao: secao.chave, grupo: null, itemId: null, campo, linha, situacao: situacaoDe(linha) });
    }
    for (const grupo of secao.grupos) {
      const ativos = itens.filter((i) => i.grupo === grupo.chave && !i.removido).sort((a, b) => a.ordem - b.ordem);
      for (const item of ativos) {
        const valores = valoresDe(item.id);
        for (const campo of grupo.campos) {
          if (!seAplica(campo.quando, valores)) continue;
          const linha = porChave.get(chave(campo.chave, item.id)) ?? null;
          out.push({ secao: secao.chave, grupo: grupo.chave, itemId: item.id, campo, linha, situacao: situacaoDe(linha) });
        }
      }
    }
  }
  return out;
}

/** Grupos obrigatórios que ainda não têm nenhum item (ex.: nenhum serviço cadastrado). */
export function gruposVazios(itens: ItemDoCaderno[], esquema: SecaoOnboarding[] = ESQUEMA_ONBOARDING): GrupoQueRepete[] {
  return esquema
    .flatMap((s) => s.grupos)
    .filter((g) => g.obrigatorio && !itens.some((i) => i.grupo === g.chave && !i.removido))
    .map((g) => g.chave);
}

export type ResumoDoCaderno = {
  total: number;
  resolvidos: number;
  porConfirmar: number;
  faltam: number;
  pendencias: number;
  /** 0–100, sobre os campos que se aplicam. */
  percentual: number;
  /** Obrigatórios que impedem a aprovação (falta, por confirmar ou pendência). */
  bloqueiam: CampoNoCaderno[];
  gruposSemItem: GrupoQueRepete[];
  podeAprovar: boolean;
};

export function resumir(caderno: CampoNoCaderno[], itens: ItemDoCaderno[], esquema: SecaoOnboarding[] = ESQUEMA_ONBOARDING): ResumoDoCaderno {
  const conta = (s: Situacao) => caderno.filter((c) => c.situacao === s).length;
  const resolvidos = conta("resolvido");
  const bloqueiam = caderno.filter((c) => c.campo.obrigatorio && c.situacao !== "resolvido");
  const gruposSemItem = gruposVazios(itens, esquema);
  return {
    total: caderno.length,
    resolvidos,
    porConfirmar: conta("por_confirmar"),
    faltam: conta("falta"),
    pendencias: conta("pendencia"),
    percentual: caderno.length ? Math.round((resolvidos / caderno.length) * 100) : 0,
    bloqueiam,
    gruposSemItem,
    podeAprovar: bloqueiam.length === 0 && gruposSemItem.length === 0,
  };
}

/** O próximo passo da entrevista, decidido pelo caderno. */
export type Passo =
  | { tipo: "confirmar"; campos: CampoNoCaderno[] } // o que as fontes e a Lexia já preencheram
  | { tipo: "cartoes"; secao: string; campos: CampoNoCaderno[] } // escolhas rápidas de uma seção
  | { tipo: "itens"; grupo: GrupoQueRepete } // falta listar os serviços, as perguntas frequentes…
  | { tipo: "pergunta"; alvo: CampoNoCaderno; mesmoItem: CampoNoCaderno[] } // conversa
  | { tipo: "fim" };

/** Quantas confirmações ou cartões vão de cada vez (uma tela que se lê num relance). */
export const TAMANHO_DO_LOTE = 6;

/**
 * Ordem da entrevista:
 *   1. confirmar o que já se sabe (rápido e dá confiança);
 *   2. os serviços, um a um, começando pelos que ela mais quer vender (a ordem dos itens);
 *   3. o resto dos grupos (profissionais, perguntas frequentes, objeções, promoções);
 *   4. as escolhas rápidas, seção a seção;
 *   5. o que só ela sabe, seção a seção.
 * Dentro de cada parte, nunca aparece um campo que já esteja resolvido ou em pendência.
 */
export function proximoPasso(caderno: CampoNoCaderno[], itens: ItemDoCaderno[], esquema: SecaoOnboarding[] = ESQUEMA_ONBOARDING): Passo {
  const porConfirmar = caderno.filter((c) => c.situacao === "por_confirmar");
  if (porConfirmar.length) {
    // um item de cada vez (um serviço inteiro), ou o lote da raiz
    const primeiro = porConfirmar[0];
    const lote = porConfirmar.filter((c) => c.itemId === primeiro.itemId).slice(0, TAMANHO_DO_LOTE);
    return { tipo: "confirmar", campos: lote };
  }

  const semItem = gruposVazios(itens, esquema);
  if (semItem.includes("servicos")) return { tipo: "itens", grupo: "servicos" };

  const emFalta = caderno.filter((c) => c.situacao === "falta");
  const deGrupo = (g: GrupoQueRepete) => emFalta.filter((c) => c.grupo === g);
  for (const grupo of ["servicos", "profissionais", "faqs", "objecoes", "promocoes"] as GrupoQueRepete[]) {
    if (grupo !== "servicos" && semItem.includes(grupo)) return { tipo: "itens", grupo };
    const faltam = deGrupo(grupo);
    if (!faltam.length) continue;
    const alvo = faltam.find((c) => c.campo.modo !== "cartao") ?? faltam[0];
    if (alvo.campo.modo === "cartao") {
      return { tipo: "cartoes", secao: alvo.secao, campos: faltam.filter((c) => c.itemId === alvo.itemId && c.campo.modo === "cartao").slice(0, TAMANHO_DO_LOTE) };
    }
    return { tipo: "pergunta", alvo, mesmoItem: faltam.filter((c) => c.itemId === alvo.itemId && c !== alvo && c.campo.modo !== "cartao") };
  }

  const daRaiz = emFalta.filter((c) => !c.grupo);
  const cartoes = daRaiz.filter((c) => c.campo.modo === "cartao");
  if (cartoes.length) {
    const secao = cartoes[0].secao;
    return { tipo: "cartoes", secao, campos: cartoes.filter((c) => c.secao === secao).slice(0, TAMANHO_DO_LOTE) };
  }
  const alvo = daRaiz[0];
  if (alvo) return { tipo: "pergunta", alvo, mesmoItem: daRaiz.filter((c) => c.secao === alvo.secao && c !== alvo) };
  return { tipo: "fim" };
}

/** A que campo (e item) pertence uma chave, para gravar uma resposta sem errar de lugar. */
export function campoDoEsquema(chave: string, grupo: GrupoQueRepete | null, esquema: SecaoOnboarding[] = ESQUEMA_ONBOARDING): CampoOnboarding | null {
  for (const s of esquema) {
    if (!grupo) {
      const c = s.campos.find((x) => x.chave === chave);
      if (c) return c;
    } else {
      const c = s.grupos.find((g) => g.chave === grupo)?.campos.find((x) => x.chave === chave);
      if (c) return c;
    }
  }
  return null;
}

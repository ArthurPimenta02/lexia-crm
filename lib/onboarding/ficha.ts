/**
 * A FICHA: tudo o que a cliente ensinou à assistente, seção a seção, pronto para a tela de revisão
 * (Etapa 3) e para a equipe da Lexia consultar. É só leitura do caderno: não decide nada.
 */
import { montarCaderno, type ItemDoCaderno, type LinhaDoCaderno } from "@/lib/onboarding/caderno";
import { ESQUEMA_ONBOARDING, type GrupoQueRepete } from "@/lib/onboarding/esquema";

export type CampoDaFicha = {
  campo: string;
  itemId: string | null;
  pergunta: string;
  tipo: string;
  opcoes?: string[];
  opcoesDe?: string;
  atencao?: boolean;
  valor: unknown;
  /** Ficou sem resposta (a equipe da Lexia vê isso com ela). */
  aberto: boolean;
};
export type ItemDaFicha = { id: string; nome: string; campos: CampoDaFicha[] };
export type SecaoDaFicha = { chave: string; titulo: string; campos: CampoDaFicha[]; grupos: { chave: GrupoQueRepete; titulo: string; itens: ItemDaFicha[] }[] };

const NOME: Record<GrupoQueRepete, string> = { servicos: "nome", profissionais: "nome", faqs: "pergunta", objecoes: "objecao", promocoes: "nome" };
const TITULO: Record<GrupoQueRepete, string> = { servicos: "Serviços", profissionais: "Profissionais", faqs: "Perguntas frequentes", objecoes: "Objeções", promocoes: "Promoções" };
const vazio = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

export function montarFicha(linhas: LinhaDoCaderno[], itens: ItemDoCaderno[]): SecaoDaFicha[] {
  const caderno = montarCaderno(linhas, itens);
  const nomeDe = (id: string, g: GrupoQueRepete) => {
    const l = linhas.find((x) => x.item_id === id && x.campo === NOME[g]);
    return typeof l?.valor === "string" ? l.valor : "";
  };
  const ativos = (g: GrupoQueRepete) => itens.filter((i) => i.grupo === g && !i.removido).sort((a, b) => a.ordem - b.ordem);
  const opcoesDe = (g: string) => [...new Set(ativos(g as GrupoQueRepete).map((i) => nomeDe(i.id, g as GrupoQueRepete)).filter(Boolean))];
  const campo = (c: (typeof caderno)[number]): CampoDaFicha => ({
    campo: c.campo.chave,
    itemId: c.itemId,
    pergunta: c.campo.pergunta,
    tipo: c.campo.tipo,
    ...(c.campo.opcoesDe ? { opcoesDe: c.campo.opcoesDe, opcoes: opcoesDe(c.campo.opcoesDe) } : c.campo.opcoes ? { opcoes: c.campo.opcoes } : {}),
    ...(c.campo.atencao ? { atencao: true } : {}),
    valor: c.linha?.estado === "pulado" || c.linha?.estado === "nao_se_aplica" ? null : (c.linha?.valor ?? null),
    aberto: c.linha?.estado !== "nao_se_aplica" && vazio(c.linha?.valor),
  });
  return ESQUEMA_ONBOARDING.map((s) => ({
    chave: s.chave,
    titulo: s.titulo,
    campos: caderno.filter((c) => c.secao === s.chave && !c.grupo && c.campo.tipo !== "upload").map(campo),
    grupos: s.grupos.map((g) => ({
      chave: g.chave,
      titulo: TITULO[g.chave],
      itens: ativos(g.chave).map((i) => ({ id: i.id, nome: nomeDe(i.id, g.chave), campos: caderno.filter((c) => c.itemId === i.id && c.campo.chave !== NOME[g.chave] && c.campo.tipo !== "upload").map(campo) })),
    })),
  })).filter((s) => s.campos.length || s.grupos.some((g) => g.itens.length));
}

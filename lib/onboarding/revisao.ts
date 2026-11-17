import "server-only";

import { revalidatePath } from "next/cache";

import type { AcessoAoOnboarding } from "@/lib/onboarding/acesso";
import { campoDoEsquema } from "@/lib/onboarding/caderno";
import { conferir } from "@/lib/onboarding/conversa";
import { acrescentarLinhas, lerItens, lerLinhas, lerOnboarding } from "@/lib/onboarding/dados";
import { montarFicha, type SecaoDaFicha } from "@/lib/onboarding/ficha";

export type ResultadoDaRevisao = { ok: boolean; erro?: string };

function revalidar(slug: string) {
  revalidatePath(`/admin/clientes/${slug}/onboarding`);
  revalidatePath("/app/onboarding");
}

/** A ficha de uma empresa (para a revisão, para a tela depois do envio e para a equipe da Lexia). */
export async function fichaDe(acesso: Pick<AcessoAoOnboarding, "admin" | "clienteSlug">): Promise<SecaoDaFicha[]> {
  const onb = await lerOnboarding(acesso.admin, acesso.clienteSlug);
  if (!onb) return [];
  const [linhas, itens] = await Promise.all([lerLinhas(acesso.admin, acesso.clienteSlug, onb.id), lerItens(acesso.admin, acesso.clienteSlug, onb.id)]);
  return montarFicha(linhas, itens);
}

/**
 * Corrigir um campo na revisão. Só enquanto a ficha não foi enviada: depois de "enviar para a equipe" nada muda
 * por aqui (a cliente pede a alteração à equipe). Entra no diário como resposta dela, como qualquer outra.
 */
export async function salvarNaRevisao(acesso: AcessoAoOnboarding | null, pedido: { campo: string; itemId: string | null; valor: unknown }): Promise<ResultadoDaRevisao> {
  if (!acesso) return { ok: false, erro: "Acesso não autorizado." };
  const onb = await lerOnboarding(acesso.admin, acesso.clienteSlug);
  if (!onb || onb.estado !== "revisao") return { ok: false, erro: "A ficha já foi enviada: para mudar algo, fale com a equipe." };
  const itens = await lerItens(acesso.admin, acesso.clienteSlug, onb.id);
  const item = pedido.itemId ? itens.find((i) => i.id === pedido.itemId && !i.removido) : null;
  if (pedido.itemId && !item) return { ok: false, erro: "Item não encontrado." };
  const campo = campoDoEsquema(pedido.campo, item?.grupo ?? null);
  if (!campo || campo.tipo === "upload") return { ok: false, erro: "Campo desconhecido." };
  const valor = conferir(campo, pedido.valor);
  if (valor === undefined) return { ok: false, erro: "Não consegui guardar esse valor. Confira e tente de novo." };
  await acrescentarLinhas(acesso.admin, acesso.clienteSlug, onb.id, [{ campo: campo.chave, itemId: item?.id ?? null, valor, estado: "respondido", fonte: "cliente", evidencia: { revisao: true } }], acesso.userId);
  revalidar(acesso.clienteSlug);
  return { ok: true };
}

/** "Enviar para a equipe": a ficha fecha (estado `aprovado`) e a tela passa a "seu agente está sendo treinado". */
export async function enviarParaAEquipe(acesso: AcessoAoOnboarding | null): Promise<ResultadoDaRevisao> {
  if (!acesso) return { ok: false, erro: "Acesso não autorizado." };
  const { data, error } = await acesso.admin
    .from("lexia_onboardings")
    .update({ estado: "aprovado", aprovado_em: new Date().toISOString(), aprovado_por: acesso.userId, atualizado_em: new Date().toISOString() })
    .eq("cliente_slug", acesso.clienteSlug)
    .eq("estado", "revisao")
    .select("id");
  if (error) return { ok: false, erro: "Não foi possível enviar agora. Tente de novo." };
  if (!data?.length) return { ok: false, erro: "A ficha ainda não está pronta para enviar." };
  revalidar(acesso.clienteSlug);
  return { ok: true };
}

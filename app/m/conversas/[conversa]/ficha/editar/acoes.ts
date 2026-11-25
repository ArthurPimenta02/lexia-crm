"use server";

import { canalQuePedeNota, isCanalDeAquisicao } from "@/lib/clientes/ficha";
import { contextoMovel } from "@/lib/movel/contexto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Editar "de onde veio" e as notas de uma ficha pelo app. Só estes campos:
 * o resto da ficha (email, morada, idade…) fica como está — gravar a ficha
 * inteira com campos em branco apagava o que o painel lá tinha.
 */
export async function gravarFichaMovel(contactoId: string, origem: string, origemNota: string, notas: string) {
  const c = await contextoMovel();
  if (!c) return { erro: "Sessão inválida.", ok: false };
  const o = origem.trim();
  if (o && !isCanalDeAquisicao(o)) return { erro: c.t("Essa origem não existe."), ok: false };
  const nota = o === canalQuePedeNota ? origemNota.trim().slice(0, 200) : "";
  if (o === canalQuePedeNota && !nota) return { erro: c.t("Escreva de onde o cliente veio."), ok: false };
  if (notas.length > 4000) return { erro: c.t("As notas são compridas demais."), ok: false };

  const base = createAdminClient();
  const { data: atual } = await base.from("lexia_contactos").select("id, origem_manual, origem_manual_nota").eq("cliente_slug", c.clienteSlug).eq("id", contactoId).maybeSingle();
  if (!atual) return { erro: c.t("Cliente não encontrado na base."), ok: false };

  const agora = new Date().toISOString();
  const mudouOrigem = (atual.origem_manual ?? "") !== o || (atual.origem_manual_nota ?? "") !== nota;
  const { error } = await base
    .from("lexia_contactos")
    .update({
      actualizado_por: c.userId,
      atualizado_em: agora,
      notas: notas.trim() || null,
      ...(mudouOrigem ? { origem_manual: o || null, origem_manual_em: o ? agora : null, origem_manual_nota: nota || null, origem_manual_por: o ? c.userId : null } : {}),
    })
    .eq("cliente_slug", c.clienteSlug)
    .eq("id", contactoId);
  if (error) {
    console.error("[ficha] gravar pelo app", error);
    return { erro: c.t("Não foi possível guardar."), ok: false };
  }
  return { erro: null, ok: true };
}

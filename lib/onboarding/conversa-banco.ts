import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Andamento } from "@/lib/onboarding/caderno";
import { andamentoDoCursor, type Cartao, type MensagemDaConversa, type PontoDeRetorno, type Repositorio, type Resposta } from "@/lib/onboarding/conversa";
import { acrescentarLinhas, criarItem, lerItens, lerLinhas } from "@/lib/onboarding/dados";

const COLUNAS = "id, autor, tipo, conteudo, dados, criado_em, processada_em";

/**
 * A conversa guardada no Supabase central. Cada consulta leva o `cliente_slug`
 * e o `onboarding_id`. Mensagens e linhas do diário só recebem INSERT; a única
 * coisa que se altera numa mensagem é a marca de "já tratada".
 */
export function repositorioDoBanco(admin: SupabaseClient, clienteSlug: string, onboardingId: string, userId: string | null): Repositorio {
  const mensagens = () => admin.from("lexia_onboarding_mensagens");
  const falhar = (onde: string, e: { message: string } | null) => {
    if (e) throw new Error(`${onde}: ${e.message}`);
  };

  return {
    linhas: () => lerLinhas(admin, clienteSlug, onboardingId),
    itens: () => lerItens(admin, clienteSlug, onboardingId),
    async andamento() {
      const { data, error } = await admin.from("lexia_onboardings").select("cursor").eq("cliente_slug", clienteSlug).eq("id", onboardingId).maybeSingle();
      falhar("andamento", error);
      const c = ((data as { cursor: Partial<Andamento> | null } | null)?.cursor ?? {}) as Partial<Andamento>;
      return andamentoDoCursor(c);
    },
    async gravarAndamento(a: Andamento) {
      const { error } = await admin.from("lexia_onboardings").update({ cursor: a, atualizado_em: new Date().toISOString() }).eq("cliente_slug", clienteSlug).eq("id", onboardingId);
      falhar("andamento", error);
    },
    acrescentarLinhas: (linhas) => acrescentarLinhas(admin, clienteSlug, onboardingId, linhas, userId),
    criarItem: (grupo, ordem) => criarItem(admin, clienteSlug, onboardingId, grupo, ordem),
    async removerItens(ids) {
      if (!ids.length) return;
      const { error } = await admin.from("lexia_onboarding_itens").update({ removido_em: new Date().toISOString() }).eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId).in("id", ids);
      falhar("itens", error);
    },
    async gravarDaCliente(r: Resposta): Promise<MensagemDaConversa> {
      const existente = async () => {
        const { data } = await mensagens().select(COLUNAS).eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId).eq("id_do_aparelho", r.idDoAparelho).maybeSingle();
        return data as MensagemDaConversa | null;
      };
      const ja = await existente();
      if (ja) return ja;
      const tipo = r.arquivoId ? (r.tipoDoArquivo ?? "arquivo") : r.valores?.length || r.lista || r.pular || r.nenhum ? "cartao" : "texto";
      const conteudo = [r.texto, r.textoDoArquivo].map((x) => String(x ?? "").trim()).filter(Boolean).join("\n\n");
      const { data, error } = await mensagens()
        .insert({
          onboarding_id: onboardingId,
          cliente_slug: clienteSlug,
          autor: "cliente",
          tipo: !r.arquivoId && conteudo && tipo === "cartao" ? "texto" : tipo,
          conteudo,
          arquivo_id: r.arquivoId ?? null,
          dados: { valores: r.valores ?? [], lista: r.lista ?? null, pular: !!r.pular, nenhum: !!r.nenhum },
          id_do_aparelho: r.idDoAparelho,
          enviado_por: userId,
        })
        .select(COLUNAS)
        .single();
      if (error?.code === "23505") {
        const outra = await existente();
        if (outra) return outra;
      }
      if (error || !data) throw new Error(`mensagem: ${error?.message ?? "não gravada"}`);
      return data as MensagemDaConversa;
    },
    async marcarProcessada(id) {
      const { error } = await mensagens().update({ processada_em: new Date().toISOString() }).eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId).eq("id", id);
      falhar("mensagem", error);
    },
    async desfazer(d) {
      const base = <T extends { eq(c: string, v: string): T }>(q: T) => q.eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId);
      {
        const { error } = await base(admin.from("lexia_onboarding_campos").delete()).eq("evidencia->>mensagem", d.linhasDaMensagem);
        falhar("voltar (linhas)", error);
      }
      if (d.apagarItens.length) {
        const a = await base(admin.from("lexia_onboarding_campos").delete()).in("item_id", d.apagarItens);
        falhar("voltar (linhas dos itens)", a.error);
        const b = await base(admin.from("lexia_onboarding_itens").delete()).in("id", d.apagarItens);
        falhar("voltar (itens)", b.error);
      }
      if (d.restaurarItens.length) {
        const { error } = await base(admin.from("lexia_onboarding_itens").update({ removido_em: null })).in("id", d.restaurarItens);
        falhar("voltar (itens tirados)", error);
      }
      const { error } = await mensagens().delete().eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId).in("id", d.apagarMensagens);
      falhar("voltar (mensagens)", error);
    },
    async gravarDaEntrevistadora(texto: string, cartao: Cartao, volta?: PontoDeRetorno) {
      const { data, error } = await mensagens()
        .insert({ onboarding_id: onboardingId, cliente_slug: clienteSlug, autor: "entrevistadora", tipo: "texto", conteudo: texto, dados: { passo: cartao, ...(volta ? { volta } : {}) }, processada_em: new Date().toISOString() })
        .select(COLUNAS)
        .single();
      if (error || !data) throw new Error(`mensagem: ${error?.message ?? "não gravada"}`);
      return data as MensagemDaConversa;
    },
    async mensagens() {
      const { data, error } = await mensagens().select(COLUNAS).eq("cliente_slug", clienteSlug).eq("onboarding_id", onboardingId).order("criado_em").limit(2000);
      falhar("mensagens", error);
      return (data ?? []) as MensagemDaConversa[];
    },
    async terminar() {
      const { error } = await admin.from("lexia_onboardings").update({ estado: "revisao", atualizado_em: new Date().toISOString() }).eq("cliente_slug", clienteSlug).eq("id", onboardingId).eq("estado", "conversa");
      falhar("onboarding", error);
    },
  };
}

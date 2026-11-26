import "server-only";

import { confirmacaoClaudia, confirmacaoDetail, confirmacaoMiranda, type Idioma } from "@/lib/agenda/confirmacao-textos";
import { chamarPlataforma } from "@/lib/movel/plataforma";
import { createServicosClient, getServicosAgendaveisConfig } from "@/lib/servicos/config";

/**
 * Confirmação pelo WhatsApp de uma marcação feita pela equipe no app/painel
 * (25/11/2026). O texto é o do agente de cada cliente (confirmacao-textos.ts);
 * o envio é o "automático" da plataforma: não pausa o agente (a Miranda pausa,
 * como o lembrete dela), sai pelo número dos lembretes e nunca sai duas vezes
 * para a mesma marcação (chave = id do evento no Google).
 */

/** Clientes com texto de confirmação copiado do agente. Os outros não recebem (nada se inventa). */
export const CONFIRMA_PELO_WHATSAPP = new Set(["miranda_skin_experts", "claudia_leite_spa", "detail_by_cordeiro"]);
/** O Detail fala só português de Portugal; os outros escolhem o idioma da cliente. */
export const idiomasDe = (clienteSlug: string): Idioma[] => (clienteSlug === "detail_by_cordeiro" ? ["pt"] : ["pt", "en", "es"]);

export type DadosConfirmacao = {
  carro: string | null;
  clienteSlug: string;
  eventId: string;
  executorChave: string;
  executorNome: string;
  idioma: Idioma;
  inicioIso: string;
  nome: string;
  servicoId: string;
  servicoNome: string;
  telefone: string;
  valor: number | null;
};

async function linhaDoServico(clienteSlug: string, servicoId: string, colunas: string) {
  const config = getServicosAgendaveisConfig(clienteSlug);
  const base = config ? createServicosClient(config) : null;
  if (!config || !base) return null;
  const { data } = await base.from(config.tabela).select(colunas).eq("id", servicoId).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function textoDe(d: DadosConfirmacao): Promise<string | null> {
  if (d.clienteSlug === "miranda_skin_experts") {
    const s = await linhaDoServico(d.clienteSlug, d.servicoId, "nome, nome_en, nome_es").catch(() => null);
    return confirmacaoMiranda({ idioma: d.idioma, inicio: d.inicioIso, nome: d.nome, profissional: d.executorNome, servico: d.servicoNome, servicoEn: (s?.nome_en as string) ?? null, servicoEs: (s?.nome_es as string) ?? null });
  }
  if (d.clienteSlug === "claudia_leite_spa") {
    const s = await linhaDoServico(d.clienteSlug, d.servicoId, "nome, nome_en, nome_es, categoria").catch(() => null);
    return confirmacaoClaudia({
      avaliacao: false,
      idioma: d.idioma,
      inicio: d.inicioIso,
      nome: d.nome,
      profissional: d.executorChave,
      servico: { categoria: String(s?.categoria ?? ""), nome: String(s?.nome ?? d.servicoNome), nome_en: (s?.nome_en as string) ?? null, nome_es: (s?.nome_es as string) ?? null },
    });
  }
  if (d.clienteSlug === "detail_by_cordeiro") {
    const config = getServicosAgendaveisConfig(d.clienteSlug);
    const base = config ? createServicosClient(config) : null;
    const info: Record<string, string> = {};
    if (base) {
      const { data } = await base.from("info_estudio_detail_by_cordeiro").select("chave, valor");
      for (const l of (data ?? []) as { chave: string; valor: string | null }[]) if (l.valor) info[l.chave] = String(l.valor);
    }
    return confirmacaoDetail({ avaliacao: /avalia/i.test(d.servicoNome), carro: d.carro, info, inicio: d.inicioIso, nome: d.nome, servico: d.servicoNome, valor: d.valor });
  }
  return null;
}

export async function enviarConfirmacao(d: DadosConfirmacao): Promise<{ enviada: boolean; erro: string | null }> {
  if (!CONFIRMA_PELO_WHATSAPP.has(d.clienteSlug)) return { enviada: false, erro: null };
  const telefone = d.telefone.replace(/\D/g, "");
  if (telefone.length < 8) return { enviada: false, erro: "Sem telefone para mandar a confirmação." };
  try {
    const texto = await textoDe(d);
    if (!texto) return { enviada: false, erro: null };
    await chamarPlataforma("/lexia-plataforma/enviar-automatica", { chave: `confirmacao:${d.eventId}`, cliente_slug: d.clienteSlug, conversa: `whatsapp:${telefone}`, texto }, 30_000);
    return { enviada: true, erro: null };
  } catch (e) {
    console.error("[confirmacao] não saiu", e);
    return { enviada: false, erro: "A marcação ficou feita, mas a confirmação pelo WhatsApp não saiu." };
  }
}

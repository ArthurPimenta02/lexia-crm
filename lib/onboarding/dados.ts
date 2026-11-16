/**
 * Leitura e escrita do onboarding no Supabase central.
 *
 * Tudo passa pelo `createAdminClient()` (service_role, ignora o RLS), por isso
 * a ÚNICA coisa que separa uma empresa da outra é cada consulta levar o seu
 * `.eq("cliente_slug", …)`. Quem chama estas funções já decidiu de que empresa
 * se trata (a sessão, ou o lexia_admin que escolheu o cliente); aqui nenhuma
 * consulta sai sem o slug.
 *
 * NUNCA PERDER DADOS: o diário de campos e as mensagens só recebem INSERT.
 * Não há UPDATE nem DELETE de respostas neste ficheiro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EstadoDaLinha, ItemDoCaderno, LinhaDoCaderno } from "@/lib/onboarding/caderno";
import type { GrupoQueRepete } from "@/lib/onboarding/esquema";

export const BUCKET_ONBOARDING = "onboarding";
export const TAMANHO_MAXIMO_ARQUIVO = 50 * 1024 * 1024;

export type EstadoOnboarding = "etapa1" | "preparando" | "conversa" | "revisao" | "aprovado";

export type Etapa1 = {
  instagram?: string;
  site?: string;
  google?: string;
  tipo_de_negocio?: string;
  idiomas?: string[];
  notas?: string;
  /** Texto colado à mão (bio, posts, respostas): o plano B quando uma fonte não se deixa ler. */
  texto_colado?: string;
};

export type Onboarding = {
  id: string;
  cliente_slug: string;
  estado: EstadoOnboarding;
  etapa1: Etapa1;
  achados: Achados;
  cursor: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
  aprovado_em: string | null;
};

/** O que a leitura de cada fonte deu, para a tela "O que a IA encontrou". */
export type Achado = { fonte: string; titulo: string; ok: boolean; detalhe: string; em: string };
export type Achados = { fontes?: Achado[]; rascunho_em?: string; resumo?: string; custo_usd?: number };

export type ArquivoOnboarding = {
  id: string;
  origem: "etapa1" | "conversa";
  caminho: string;
  nome: string | null;
  mime: string | null;
  tamanho: number | null;
  texto: string | null;
  texto_em: string | null;
  criado_em: string;
};

type Admin = SupabaseClient;

const COLUNAS = "id, cliente_slug, estado, etapa1, achados, cursor, criado_em, atualizado_em, aprovado_em";

/** O onboarding do cliente, ou null se ainda não foi aberto. */
export async function lerOnboarding(admin: Admin, clienteSlug: string): Promise<Onboarding | null> {
  const { data, error } = await admin.from("lexia_onboardings").select(COLUNAS).eq("cliente_slug", clienteSlug).maybeSingle();
  if (error) throw new Error(`onboarding: ${error.message}`);
  return (data as Onboarding | null) ?? null;
}

/** Abre o onboarding do cliente (um por cliente; chamar duas vezes devolve o mesmo). */
export async function abrirOnboarding(admin: Admin, clienteSlug: string): Promise<Onboarding> {
  const atual = await lerOnboarding(admin, clienteSlug);
  if (atual) return atual;
  const { error } = await admin.from("lexia_onboardings").insert({ cliente_slug: clienteSlug });
  // 23505 = outro pedido criou-o no mesmo instante: lê-se o que ficou.
  if (error && error.code !== "23505") throw new Error(`onboarding: ${error.message}`);
  const criado = await lerOnboarding(admin, clienteSlug);
  if (!criado) throw new Error("onboarding: não foi possível abrir");
  return criado;
}

export async function gravarEtapa1(admin: Admin, clienteSlug: string, etapa1: Etapa1): Promise<void> {
  const { error } = await admin
    .from("lexia_onboardings")
    .update({ etapa1, atualizado_em: new Date().toISOString() })
    .eq("cliente_slug", clienteSlug);
  if (error) throw new Error(`onboarding: ${error.message}`);
}

export async function gravarEstado(admin: Admin, clienteSlug: string, mudanca: { estado?: EstadoOnboarding; achados?: Achados; cursor?: Record<string, unknown> }): Promise<void> {
  const { error } = await admin
    .from("lexia_onboardings")
    .update({ ...mudanca, atualizado_em: new Date().toISOString() })
    .eq("cliente_slug", clienteSlug);
  if (error) throw new Error(`onboarding: ${error.message}`);
}

export async function listarArquivos(admin: Admin, clienteSlug: string, onboardingId: string): Promise<ArquivoOnboarding[]> {
  const { data, error } = await admin
    .from("lexia_onboarding_arquivos")
    .select("id, origem, caminho, nome, mime, tamanho, texto, texto_em, criado_em")
    .eq("cliente_slug", clienteSlug)
    .eq("onboarding_id", onboardingId)
    .order("criado_em");
  if (error) throw new Error(`arquivos: ${error.message}`);
  return (data ?? []) as ArquivoOnboarding[];
}

/** A pasta do cliente no bucket: nenhum caminho de outro cliente é aceite. */
export const pastaDoCliente = (clienteSlug: string) => `${clienteSlug}/`;

export async function registarArquivo(
  admin: Admin,
  clienteSlug: string,
  onboardingId: string,
  arquivo: { origem: "etapa1" | "conversa"; caminho: string; nome: string; mime: string; tamanho: number; enviadoPor: string | null },
): Promise<string> {
  if (!arquivo.caminho.startsWith(pastaDoCliente(clienteSlug)) || arquivo.caminho.includes("..")) throw new Error("arquivo: caminho fora da pasta do cliente");
  const { data, error } = await admin
    .from("lexia_onboarding_arquivos")
    .insert({ onboarding_id: onboardingId, cliente_slug: clienteSlug, origem: arquivo.origem, caminho: arquivo.caminho, nome: arquivo.nome.slice(0, 200), mime: arquivo.mime, tamanho: arquivo.tamanho, enviado_por: arquivo.enviadoPor })
    .select("id")
    .single();
  if (error || !data) throw new Error(`arquivo: ${error?.message ?? "não gravado"}`);
  return (data as { id: string }).id;
}

/** Guarda o que a IA leu num arquivo (transcrição, texto do PDF, descrição da imagem). */
export async function gravarTextoDoArquivo(admin: Admin, clienteSlug: string, arquivoId: string, texto: string): Promise<void> {
  const { error } = await admin
    .from("lexia_onboarding_arquivos")
    .update({ texto, texto_em: new Date().toISOString() })
    .eq("cliente_slug", clienteSlug)
    .eq("id", arquivoId);
  if (error) throw new Error(`arquivo: ${error.message}`);
}

// ------------------------------------------------------------------ o caderno (diário)

export async function lerItens(admin: Admin, clienteSlug: string, onboardingId: string): Promise<ItemDoCaderno[]> {
  const { data, error } = await admin
    .from("lexia_onboarding_itens")
    .select("id, grupo, ordem, removido_em")
    .eq("cliente_slug", clienteSlug)
    .eq("onboarding_id", onboardingId)
    .order("ordem");
  if (error) throw new Error(`itens: ${error.message}`);
  return ((data ?? []) as { id: string; grupo: GrupoQueRepete; ordem: number; removido_em: string | null }[]).map((i) => ({ id: i.id, grupo: i.grupo, ordem: i.ordem, removido: !!i.removido_em }));
}

export async function criarItem(admin: Admin, clienteSlug: string, onboardingId: string, grupo: GrupoQueRepete, ordem: number): Promise<string> {
  const { data, error } = await admin
    .from("lexia_onboarding_itens")
    .insert({ onboarding_id: onboardingId, cliente_slug: clienteSlug, grupo, ordem })
    .select("id")
    .single();
  if (error || !data) throw new Error(`item: ${error?.message ?? "não criado"}`);
  return (data as { id: string }).id;
}

/** As linhas mais recentes de cada campo (o estado atual do caderno). */
export async function lerLinhas(admin: Admin, clienteSlug: string, onboardingId: string): Promise<LinhaDoCaderno[]> {
  const { data, error } = await admin
    .from("lexia_onboarding_campos_atual")
    .select("campo, item_id, valor, estado, fonte, perguntas")
    .eq("cliente_slug", clienteSlug)
    .eq("onboarding_id", onboardingId);
  if (error) throw new Error(`caderno: ${error.message}`);
  return (data ?? []) as LinhaDoCaderno[];
}

export type NovaLinha = {
  campo: string;
  itemId?: string | null;
  valor: unknown;
  estado: EstadoDaLinha;
  fonte: "site" | "instagram" | "google" | "arquivo" | "lexia" | "cliente" | "recomendacao";
  evidencia?: Record<string, unknown>;
  perguntas?: number;
};

/** Acrescenta linhas ao diário. Nunca altera nem apaga as que já lá estão. */
export async function acrescentarLinhas(admin: Admin, clienteSlug: string, onboardingId: string, linhas: NovaLinha[], criadoPor: string | null): Promise<void> {
  if (!linhas.length) return;
  const { error } = await admin.from("lexia_onboarding_campos").insert(
    linhas.map((l) => ({
      onboarding_id: onboardingId,
      cliente_slug: clienteSlug,
      campo: l.campo,
      item_id: l.itemId ?? null,
      valor: l.valor ?? null,
      estado: l.estado,
      fonte: l.fonte,
      evidencia: l.evidencia ?? {},
      perguntas: l.perguntas ?? 0,
      criado_por: criadoPor,
    })),
  );
  if (error) throw new Error(`caderno: ${error.message}`);
}

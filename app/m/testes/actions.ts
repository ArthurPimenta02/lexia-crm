"use server";

import { contextoMovel, type ContextoMovel } from "@/lib/movel/contexto";
import { createAdminClient } from "@/lib/supabase/admin";

import { COLUNAS_EXECUCAO, SEM_SESSAO, type ExecucaoTeste } from "./bolhas";

/**
 * Área de testes do app do iPhone (/m/testes). Reaproveita o contrato do
 * painel (app/app/area-testes e app/admin/area-testes), sem o mudar:
 *
 * - a sessão vive em `lexia_testes_sessoes`;
 * - a mensagem vai por POST ao `webhook_url` do workflow em `lexia_workflows`
 *   com `lexia_modo_teste: true` (o n8n não manda nada a ninguém);
 * - a resposta NÃO vem no HTTP: o n8n grava a linha em
 *   `lexia_testes_execucoes` com o mesmo `run_id`, e a tela faz polling.
 *
 * A empresa vem SEMPRE da sessão (`contextoMovel`), nunca do pedido. O dono
 * testa com a origem `painel_cliente` e a Lexia com `painel_admin`, as mesmas
 * do painel, para o n8n e o histórico do computador verem as mesmas conversas.
 */

type Resultado<T> = { dados: T; erro?: never } | { dados?: never; erro: string };

const origemDe = (c: ContextoMovel) => (c.admin ? "painel_admin" : "painel_cliente");
const ESPERA_WEBHOOK_MS = 15_000;

async function sessaoDaEmpresa(c: ContextoMovel, sessao: string) {
  if (!sessao || typeof sessao !== "string") return false;
  const { data, error } = await createAdminClient()
    .from("lexia_testes_sessoes")
    .select("session_id")
    .eq("cliente_slug", c.clienteSlug)
    .eq("origem", origemDe(c))
    .eq("session_id", sessao)
    .maybeSingle();
  return !error && Boolean(data);
}

async function criarSessao(c: ContextoMovel): Promise<string | null> {
  const sessao = crypto.randomUUID();
  const { error } = await createAdminClient().from("lexia_testes_sessoes").insert({
    cliente_slug: c.clienteSlug,
    nome: "Nova sessão",
    origem: origemDe(c),
    session_id: sessao,
    status: "activa",
  });
  return error ? null : sessao;
}

/** "Nova conversa de teste": abre uma sessão limpa. A antiga fica no histórico do painel. */
export async function novaConversaTeste(): Promise<Resultado<{ sessao: string }>> {
  const c = await contextoMovel();
  if (!c) return { erro: SEM_SESSAO };
  const sessao = await criarSessao(c);
  return sessao ? { dados: { sessao } } : { erro: c.t("Não foi possível criar a sessão de teste.") };
}

/** O que o agente já respondeu nesta sessão (a tela chama isto enquanto espera). */
export async function lerConversaTeste(sessao: string): Promise<Resultado<ExecucaoTeste[]>> {
  const c = await contextoMovel();
  if (!c) return { erro: SEM_SESSAO };
  if (!(await sessaoDaEmpresa(c, sessao))) return { erro: c.t("Sessão de teste não encontrada.") };
  const { data, error } = await createAdminClient()
    .from("lexia_testes_execucoes")
    .select(COLUNAS_EXECUCAO)
    .eq("cliente_slug", c.clienteSlug)
    .eq("origem", origemDe(c))
    .eq("session_id", sessao)
    .order("criado_em", { ascending: true });
  if (error) return { erro: c.t("Não foi possível buscar as mensagens da sessão.") };
  return { dados: (data ?? []) as ExecucaoTeste[] };
}

/**
 * Manda uma mensagem ao agente da empresa da sessão. Sem sessão de teste
 * ainda, abre uma. Devolve o `run_id` que a tela vai esperar ver gravado.
 */
export async function enviarTeste(
  sessao: string | null,
  texto: string,
  workflowId: string,
): Promise<Resultado<{ runId: string; sessao: string }>> {
  const c = await contextoMovel();
  if (!c) return { erro: SEM_SESSAO };

  const mensagem = typeof texto === "string" ? texto.trim() : "";
  if (!mensagem) return { erro: c.t("Escreva uma mensagem.") };
  if (mensagem.length > 4000) return { erro: c.t("A mensagem é longa demais.") };
  if (!workflowId || typeof workflowId !== "string") return { erro: c.t("Selecione um workflow para testar.") };

  const base = createAdminClient();
  const { data: wf, error: erroWf } = await base
    .from("lexia_workflows")
    .select("id, tipo, webhook_url")
    .eq("cliente_slug", c.clienteSlug)
    .eq("status", "ativo")
    .eq("id", workflowId)
    .maybeSingle();
  const workflow = wf as { id: string; tipo: string | null; webhook_url: string | null } | null;
  if (erroWf || !workflow?.webhook_url) return { erro: c.t("Nenhum workflow ativo configurado para este cliente.") };

  let id = sessao;
  if (id) {
    if (!(await sessaoDaEmpresa(c, id))) return { erro: c.t("Sessão de teste não encontrada.") };
  } else {
    id = await criarSessao(c);
    if (!id) return { erro: c.t("Não foi possível criar a sessão de teste.") };
  }

  const runId = crypto.randomUUID();
  try {
    const r = await fetch(workflow.webhook_url, {
      body: JSON.stringify({
        lexia_modo_teste: true,
        lexia_origem: origemDe(c),
        lexia_run_id: runId,
        lexia_session_id: id,
        lexia_teste_id: "",
        lexia_workflow_id: workflow.id,
        lexia_workflow_tipo: workflow.tipo ?? "",
        message: { text: mensagem, type: "text" },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(ESPERA_WEBHOOK_MS),
    });
    if (!r.ok) return { erro: c.t("Não foi possível enviar a mensagem ao workflow.") };
  } catch {
    return { erro: c.t("Não foi possível enviar a mensagem ao workflow.") };
  }

  return { dados: { runId, sessao: id } };
}

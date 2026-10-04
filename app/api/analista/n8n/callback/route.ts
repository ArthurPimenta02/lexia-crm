import { AnalystDataContext } from "@/lib/analyst/data";
import { createAnalystCallbackHandler } from "@/lib/analyst/callback-handler";
import {
  assertAnalystN8nRequest,
  getAnalystAnswerMessageId,
  isAnalystN8nToolName,
  resolveAnalystExecutionForCompletion,
} from "@/lib/analyst/n8n";
import type {
  AnalystScope,
  AnalystWorkflowSourceInput,
} from "@/lib/analyst/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const handleCallback = createAnalystCallbackHandler<AnalystScope>({
  assertAuthorized: assertAnalystN8nRequest,
  finalize: async (input) => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(
      "lexia_finalizar_execucao_analista",
      {
        p_duracao_ms: input.durationMs,
        p_erro: input.error,
        p_execucao_id: input.executionId,
        p_ferramentas: input.tools,
        p_fontes: input.sources,
        p_modelo: input.model,
        p_resposta: input.response,
        p_resposta_id: input.responseId,
        p_status: input.status,
        p_tokens_entrada: input.tokensInput,
        p_tokens_saida: input.tokensOutput,
        p_versao_prompt: input.promptVersion,
      },
    );

    if (error) {
      throw new Error("Não foi possível finalizar a execução da análise.");
    }

    return data;
  },
  getAnswerMessageId: getAnalystAnswerMessageId,
  isToolName: isAnalystN8nToolName,
  onInternalError: (error) => {
    console.error("Erro no callback do Analista Lexia via n8n", error);
  },
  resolveExecution: resolveAnalystExecutionForCompletion,
  resolveSources: (scope, sources) =>
    new AnalystDataContext(scope).resolveWorkflowSources(
      sources as AnalystWorkflowSourceInput[],
    ),
});

export async function POST(request: Request) {
  return handleCallback(request);
}

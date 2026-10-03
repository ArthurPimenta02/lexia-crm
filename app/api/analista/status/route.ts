import {
  AnalystRequestError,
  resolveAnalystScope,
} from "@/lib/analyst/scope";
import type { AnalystScopeInput, AnalystSource } from "@/lib/analyst/types";
import {
  expireAnalystExecutionIfNeeded,
  getAnalystAnswerMessageId,
} from "@/lib/analyst/n8n";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const executionId = url.searchParams.get("execucaoId")?.trim() ?? "";

    if (!executionId) {
      throw new AnalystRequestError("Execução não informada.", 400);
    }

    const input: AnalystScopeInput = {
      clienteSlug: url.searchParams.get("clienteSlug") ?? undefined,
      periodo: "hoje",
    };
    const scope = await resolveAnalystScope(input, { mode: "read" });
    const admin = createAdminClient();
    const { data: execution, error } = await admin
      .from("lexia_ai_execucoes")
      .select("id, sessao_id, status, erro, criado_em")
      .eq("id", executionId)
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId)
      .eq("tipo", "chat")
      .maybeSingle();

    if (error || !execution) {
      throw new AnalystRequestError("Execução de análise não encontrada.", 404);
    }

    const status = await expireAnalystExecutionIfNeeded({
      ...execution,
      canal: null,
      cliente_slug: scope.clienteSlug,
      concluido_em: null,
      criado_por: scope.userId,
      ferramentas: [],
      periodo_fim: null,
      periodo_inicio: null,
      tipo: "chat",
    });

    if (status === "iniciada") {
      return Response.json({
        executionId,
        sessionId: execution.sessao_id,
        status: "processing",
      });
    }

    if (status === "erro") {
      return Response.json({
        error:
          "A análise não pôde ser concluída. Tente novamente em alguns instantes.",
        executionId,
        sessionId: execution.sessao_id,
        status: "failed",
      });
    }

    const answerId = getAnalystAnswerMessageId(executionId);
    const { data: message, error: messageError } = await admin
      .from("lexia_ai_mensagens")
      .select("id, papel, conteudo, fontes")
      .eq("id", answerId)
      .eq("sessao_id", execution.sessao_id)
      .eq("cliente_slug", scope.clienteSlug)
      .maybeSingle();

    if (messageError) {
      throw new Error("Não foi possível carregar a resposta da análise.");
    }

    if (!message) {
      return Response.json({
        executionId,
        sessionId: execution.sessao_id,
        status: "processing",
      });
    }

    return Response.json({
      executionId,
      message: {
        content: message.conteudo,
        id: message.id,
        role: "assistant",
        sources: Array.isArray(message.fontes)
          ? (message.fontes as AnalystSource[])
          : [],
      },
      sessionId: execution.sessao_id,
      status: "completed",
    });
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível acompanhar a análise.";

    return Response.json({ error: message }, { status });
  }
}

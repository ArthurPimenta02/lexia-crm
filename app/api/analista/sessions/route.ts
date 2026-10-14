import {
  AnalystRequestError,
  resolveAnalystScope,
} from "@/lib/analyst/scope";
import type { AnalystScopeInput, AnalystSource } from "@/lib/analyst/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input: AnalystScopeInput = {
      clienteSlug: url.searchParams.get("clienteSlug") ?? undefined,
      periodo: "mes",
    };
    const scope = await resolveAnalystScope(input, { mode: "read" });
    const sessionId = url.searchParams.get("sessaoId");
    const admin = createAdminClient();

    const { data: sessions, error: sessionsError } = await admin
      .from("lexia_ai_sessoes")
      .select("id, titulo, contexto, criado_em, atualizado_em")
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId)
      .eq("status", "ativa")
      .order("atualizado_em", { ascending: false })
      .limit(12);

    if (sessionsError) {
      if (
        sessionsError.code === "42P01" ||
        sessionsError.code === "PGRST205"
      ) {
        throw new Error("A migration do Analista Lexia ainda não foi aplicada.");
      }
      throw new Error("Não foi possível carregar as análises recentes.");
    }

    if (!sessionId) {
      return Response.json({ sessions: sessions ?? [] });
    }

    const ownsSession = (sessions ?? []).some(
      (session) => session.id === sessionId,
    );
    if (!ownsSession) {
      throw new AnalystRequestError("Conversa não encontrada.", 404);
    }

    const { data: messages, error: messagesError } = await admin
      .from("lexia_ai_mensagens")
      .select("id, papel, conteudo, fontes, criado_em")
      .eq("sessao_id", sessionId)
      .eq("cliente_slug", scope.clienteSlug)
      .order("criado_em", { ascending: true });

    if (messagesError) {
      throw new Error("Não foi possível carregar as mensagens desta análise.");
    }

    const { data: pendingExecution, error: pendingExecutionError } = await admin
      .from("lexia_ai_execucoes")
      .select("id")
      .eq("sessao_id", sessionId)
      .eq("cliente_slug", scope.clienteSlug)
      .eq("criado_por", scope.userId)
      .eq("tipo", "chat")
      .eq("status", "iniciada")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingExecutionError) {
      throw new Error("Não foi possível verificar o andamento da análise.");
    }

    return Response.json({
      messages: (messages ?? []).map((message) => ({
        content: message.conteudo,
        id: message.id,
        role: message.papel === "assistente" ? "assistant" : "user",
        sources: Array.isArray(message.fontes)
          ? (message.fontes as AnalystSource[])
          : [],
      })),
      pendingExecutionId: pendingExecution?.id ?? null,
      sessions: sessions ?? [],
    });
  } catch (error) {
    const status = error instanceof AnalystRequestError ? error.status : 500;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar as análises recentes.";
    return Response.json({ error: message }, { status });
  }
}

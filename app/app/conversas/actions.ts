"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

type ConversationMessage = {
  id: string;
  cliente_slug: string;
  identificador_conversa: string;
  direccao: string | null;
  tipo: string | null;
  conteudo: string | null;
  criado_em: string | null;
};

type SaveConversationFeedbackResult = {
  ok: boolean;
  error?: string;
};

const validCategories = [
  "Resposta errada",
  "Contexto perdido",
  "Tom inadequado",
  "Preço/serviço errado",
  "Handoff em falta",
  "Handoff indevido",
  "Outro",
];

function getFeedbackRating(categoria: string) {
  return [
    "Resposta errada",
    "Preço/serviço errado",
    "Handoff em falta",
    "Handoff indevido",
  ].includes(categoria)
    ? "erro_grave"
    : "precisa_ajuste";
}

function buildComment(
  categoria: string,
  conversa: string,
  messageId: string,
  origem: string,
  observacao: string,
) {
  const trimmedObservation = observacao.trim();

  return [
    `Categoria: ${categoria}`,
    `Conversa: ${conversa}`,
    `Mensagem ID: ${messageId}`,
    `Origem: ${origem}`,
    `Observação: ${trimmedObservation || "Sem observação adicional."}`,
  ].join("\n");
}

export async function saveClientConversationFeedback(
  messageId: string,
  categoria: string,
  observacao: string,
): Promise<SaveConversationFeedbackResult> {
  const { profile, user } = await getLoggedInUserProfile();

  if (
    !user ||
    !profile ||
    !isClientRole(profile.role) ||
    !profile.cliente_slug ||
    profile.status !== "ativo"
  ) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const selectedCategory = categoria.trim();

  if (!messageId || !validCategories.includes(selectedCategory)) {
    return { ok: false, error: "Feedback inválido." };
  }

  const supabase = await createClient();
  const { data: messageData, error: messageError } = await supabase
    .from("lexia_mensagens")
    .select(
      "id, cliente_slug, identificador_conversa, direccao, tipo, conteudo, criado_em",
    )
    .eq("id", messageId)
    .eq("cliente_slug", profile.cliente_slug)
    .eq("direccao", "enviada")
    .not("identificador_conversa", "like", "teste:%")
    .maybeSingle();

  if (messageError) {
    console.error("Erro ao buscar mensagem para feedback de conversa", {
      error: messageError,
      messageId,
      clienteSlug: profile.cliente_slug,
    });
  }

  if (messageError || !messageData) {
    return { ok: false, error: "Mensagem não encontrada." };
  }

  const message = messageData as ConversationMessage;
  const { data: previousMessageData, error: previousMessageError } = await supabase
    .from("lexia_mensagens")
    .select("conteudo")
    .eq("cliente_slug", profile.cliente_slug)
    .eq("identificador_conversa", message.identificador_conversa)
    .eq("direccao", "recebida")
    .lte("criado_em", message.criado_em ?? new Date().toISOString())
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousMessageError) {
    console.error("Erro ao buscar mensagem anterior para feedback de conversa", {
      error: previousMessageError,
      messageId,
      clienteSlug: profile.cliente_slug,
    });
  }

  const previousClientMessage =
    typeof previousMessageData?.conteudo === "string"
      ? previousMessageData.conteudo
      : null;

  const { error: insertError } = await supabase.from("lexia_feedbacks").insert({
    cliente_slug: profile.cliente_slug,
    origem: "painel_cliente",
    avaliacao: getFeedbackRating(selectedCategory),
    comentario: buildComment(
      selectedCategory,
      message.identificador_conversa,
      message.id,
      "app_conversas",
      observacao,
    ),
    mensagem_cliente: previousClientMessage,
    resposta_agente: message.conteudo,
    status: "pendente",
    criado_por: user.id,
  });

  if (insertError) {
    console.error("Erro ao criar feedback de conversa", {
      error: insertError,
      messageId,
      clienteSlug: profile.cliente_slug,
      origem: "app_conversas",
    });

    return { ok: false, error: "Não foi possível registar o feedback." };
  }

  revalidatePath("/app/conversas");
  revalidatePath("/app/feedbacks");

  return { ok: true };
}

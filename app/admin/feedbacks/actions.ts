"use server";

import { revalidatePath } from "next/cache";

import { requireLexiaAdmin } from "@/lib/auth/access-context";
import { createClient } from "@/lib/supabase/server";

export type AdminFeedbackStatus = "pendente" | "analisado" | "resolvido";

const allowedStatuses: AdminFeedbackStatus[] = [
  "pendente",
  "analisado",
  "resolvido",
];

export async function updateAdminFeedbackStatus(
  feedbackId: string,
  status: AdminFeedbackStatus,
) {
  try {
    await requireLexiaAdmin();
  } catch {
    throw new Error("Não foi possível atualizar o feedback.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Não foi possível atualizar o feedback.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lexia_feedbacks")
    .update({ status })
    .eq("id", feedbackId);

  if (error) {
    throw new Error("Não foi possível atualizar o status do feedback.");
  }

  revalidatePath("/admin/feedbacks");
}

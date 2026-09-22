"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type AdminFeedbackStatus = "pendente" | "analisado" | "resolvido";

const allowedStatuses: AdminFeedbackStatus[] = [
  "pendente",
  "analisado",
  "resolvido",
];

async function isLexiaAdmin() {
  const { profile, user } = await getLoggedInUserProfile();

  return Boolean(user && profile?.role === "lexia_admin");
}

export async function updateAdminFeedbackStatus(
  feedbackId: string,
  status: AdminFeedbackStatus,
) {
  if (!(await isLexiaAdmin()) || !allowedStatuses.includes(status)) {
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

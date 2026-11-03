"use server";

import { redirect } from "next/navigation";

import {
  getLoggedInUserProfile,
  isClientRole,
  type LexiaUserRole,
} from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

/*
 * Entra-se no dashboard, não na área de testes.
 *
 * A área de testes era a primeira página por ter sido a primeira a existir, e
 * ficou. Mas quem abre o CRM abre-o para ver como está o atendimento, não para
 * simular uma conversa — e o dashboard é o único ecrã que responde a isso sem
 * ser preciso clicar em nada.
 */
function getRedirectPath(role: LexiaUserRole) {
  if (role === "lexia_admin") {
    return "/admin";
  }

  if (isClientRole(role)) {
    return "/app";
  }

  return null;
}

export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const t = await getT();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: t("Informe e-mail e senha.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: t("E-mail ou senha inválidos.") };
  }

  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: t("Usuário sem perfil vinculado na Lexia.") };
  }

  const redirectPath = getRedirectPath(profile.role);

  if (!redirectPath) {
    await supabase.auth.signOut();
    return { error: t("Perfil sem permissão de acesso.") };
  }

  redirect(redirectPath);
}

export async function logoutAction() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");
}

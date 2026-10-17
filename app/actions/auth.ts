"use server";

import { redirect } from "next/navigation";

import {
  getLoggedInUserProfile,
  isClientRole,
  type LexiaUserRole,
} from "@/lib/auth/profile";
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Usuário sem perfil vinculado na Lexia." };
  }

  const redirectPath = getRedirectPath(profile.role);

  if (!redirectPath) {
    await supabase.auth.signOut();
    return { error: "Perfil sem permissão de acesso." };
  }

  redirect(redirectPath);
}

export async function logoutAction() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");
}

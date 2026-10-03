"use server";

import { redirect } from "next/navigation";

import {
  getAccessErrorMessage,
  requireClientPanelAccess,
  requireLexiaAdmin,
} from "@/lib/auth/access-context";
import {
  getLoggedInUserProfile,
  isClientRole,
  type LexiaUserRole,
} from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

function getRedirectPath(role: LexiaUserRole) {
  if (role === "lexia_admin") {
    return "/admin/area-testes";
  }

  if (isClientRole(role)) {
    return "/app/area-testes";
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

  try {
    if (profile.role === "lexia_admin") {
      await requireLexiaAdmin();
    } else {
      await requireClientPanelAccess();
    }
  } catch (accessError) {
    await supabase.auth.signOut();
    return { error: getAccessErrorMessage(accessError) };
  }

  redirect(redirectPath);
}

export async function logoutAction() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/login");
}

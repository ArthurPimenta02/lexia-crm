import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type LexiaUserRole =
  | "lexia_admin"
  | "cliente_admin"
  | "cliente_operador";

export type LexiaUserProfile = {
  role: LexiaUserRole;
  cliente_slug: string | null;
  status: string | null;
};

type LoggedInUserProfile =
  | {
      user: User;
      profile: LexiaUserProfile | null;
    }
  | {
      user: null;
      profile: null;
    };

export async function getLoggedInUserProfile(): Promise<LoggedInUserProfile> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, profile: null };
  }

  const { data, error } = await supabase
    .from("lexia_usuarios_clientes")
    .select("role, cliente_slug, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível buscar o perfil do usuário.");
  }

  return {
    user,
    profile: data as LexiaUserProfile | null,
  };
}

export function isClientRole(role: LexiaUserRole) {
  return role === "cliente_admin" || role === "cliente_operador";
}

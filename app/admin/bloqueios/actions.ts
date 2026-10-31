"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import {
  bloqueioDaConversa,
  eCanalBloqueio,
  normalizarIdentificador,
} from "@/lib/bloqueios/identificador";
import { createAdminClient } from "@/lib/supabase/admin";

export type BloqueioState = {
  message: string | null;
  type: "success" | "error" | null;
};

type ActionResult = { ok: boolean; error?: string };

/**
 * Bloqueios (Fase 21). Todas as acções exigem `lexia_admin` ANTES de tocar na
 * tabela: ela é lida e escrita com a service_role, que ignora o RLS.
 */
async function adminId() {
  const { profile, user } = await getLoggedInUserProfile();
  return user && profile?.role === "lexia_admin" ? user.id : null;
}

function erroDaTabela(code: string | undefined) {
  if (code === "42P01" || code === "PGRST205") {
    return "Falta correr a migration da Fase 21 no Supabase central.";
  }
  if (code === "23505") return "Este contacto já está bloqueado.";
  return "Não foi possível gravar o bloqueio.";
}

async function clienteExiste(slug: string) {
  const { data } = await createAdminClient()
    .from("lexia_clientes")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  return Boolean(data);
}

async function gravar(
  linha: { cliente_slug: string; canal: string; identificador: string; nome: string | null; motivo: string | null },
  criadoPor: string,
) {
  const { error } = await createAdminClient()
    .from("lexia_bloqueios")
    .insert({ ...linha, criado_por: criadoPor });
  return error ? erroDaTabela(error.code) : null;
}

/** Formulário da tela: telefone (WhatsApp) ou IGSID/PSID (Instagram/Messenger). */
export async function adicionarBloqueio(
  clienteSlug: string,
  _state: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const criadoPor = await adminId();
  if (!criadoPor) return { message: "Acesso não autorizado.", type: "error" };
  if (!(await clienteExiste(clienteSlug))) return { message: "Cliente não encontrado.", type: "error" };

  const canal = String(formData.get("canal") ?? "");
  if (!eCanalBloqueio(canal)) return { message: "Canal inválido.", type: "error" };
  const identificador = normalizarIdentificador(canal, String(formData.get("identificador") ?? ""));
  if (!identificador) {
    return {
      message: canal === "whatsapp"
        ? "Telefone inválido: use o número com o código do país (ex.: 1 781 555 0000)."
        : "Identificador inválido: no Instagram e no Messenger é o número da conta, mais fácil de bloquear pelo botão da conversa.",
      type: "error",
    };
  }
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120) || null;
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 300) || null;

  const erro = await gravar({ cliente_slug: clienteSlug, canal, identificador, nome, motivo }, criadoPor);
  if (erro) return { message: erro, type: "error" };
  revalidatePath("/admin/bloqueios");
  return { message: "Bloqueado.", type: "success" };
}

/** Botão "Bloquear contacto" da conversa: o identificador sai da própria conversa. */
export async function bloquearConversa(
  clienteSlug: string,
  identificadorConversa: string,
  nome: string | null,
): Promise<ActionResult> {
  const criadoPor = await adminId();
  if (!criadoPor) return { ok: false, error: "Acesso não autorizado." };
  if (!(await clienteExiste(clienteSlug))) return { ok: false, error: "Cliente não encontrado." };

  const alvo = bloqueioDaConversa(identificadorConversa);
  if (!alvo) return { ok: false, error: "Esta conversa não tem um contacto que se possa bloquear." };

  const erro = await gravar(
    { cliente_slug: clienteSlug, ...alvo, nome: nome?.trim().slice(0, 120) || null, motivo: "bloqueado pela conversa" },
    criadoPor,
  );
  if (erro && erro !== "Este contacto já está bloqueado.") return { ok: false, error: erro };
  revalidatePath("/admin/bloqueios");
  revalidatePath("/admin/conversas");
  return { ok: true };
}

/** Desbloquear: apaga a linha (só deste cliente). */
export async function removerBloqueio(clienteSlug: string, id: string): Promise<ActionResult> {
  if (!(await adminId())) return { ok: false, error: "Acesso não autorizado." };
  const { error } = await createAdminClient()
    .from("lexia_bloqueios")
    .delete()
    .eq("id", id)
    .eq("cliente_slug", clienteSlug);
  if (error) return { ok: false, error: erroDaTabela(error.code) };
  revalidatePath("/admin/bloqueios");
  revalidatePath("/admin/conversas");
  return { ok: true };
}

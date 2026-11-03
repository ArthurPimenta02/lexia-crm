"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import type { FuncaoT } from "@/lib/i18n/traduzir";
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

function erroDaTabela(code: string | undefined, t: FuncaoT) {
  if (code === "42P01" || code === "PGRST205") {
    return t("Falta rodar a migration da Fase 21 no Supabase central.");
  }
  if (code === "23505") return t("Este contato já está bloqueado.");
  return t("Não foi possível salvar o bloqueio.");
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
  t: FuncaoT,
) {
  const { error } = await createAdminClient()
    .from("lexia_bloqueios")
    .insert({ ...linha, criado_por: criadoPor });
  return error ? erroDaTabela(error.code, t) : null;
}

/** Formulário da tela: telefone (WhatsApp) ou IGSID/PSID (Instagram/Messenger). */
export async function adicionarBloqueio(
  clienteSlug: string,
  _state: BloqueioState,
  formData: FormData,
): Promise<BloqueioState> {
  const t = await getT();
  const criadoPor = await adminId();
  if (!criadoPor) return { message: t("Acesso não autorizado."), type: "error" };
  if (!(await clienteExiste(clienteSlug))) return { message: t("Cliente não encontrado."), type: "error" };

  const canal = String(formData.get("canal") ?? "");
  if (!eCanalBloqueio(canal)) return { message: t("Canal inválido."), type: "error" };
  const identificador = normalizarIdentificador(canal, String(formData.get("identificador") ?? ""));
  if (!identificador) {
    return {
      message: canal === "whatsapp"
        ? t("Telefone inválido: use o número com o código do país (ex.: 1 781 555 0000).")
        : t("Identificador inválido: no Instagram e no Messenger é o número da conta, mais fácil de bloquear pelo botão da conversa."),
      type: "error",
    };
  }
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120) || null;
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 300) || null;

  const erro = await gravar({ cliente_slug: clienteSlug, canal, identificador, nome, motivo }, criadoPor, t);
  if (erro) return { message: erro, type: "error" };
  revalidatePath("/admin/bloqueios");
  return { message: t("Bloqueado."), type: "success" };
}

/** Botão "Bloquear contacto" da conversa: o identificador sai da própria conversa. */
export async function bloquearConversa(
  clienteSlug: string,
  identificadorConversa: string,
  nome: string | null,
): Promise<ActionResult> {
  const t = await getT();
  const criadoPor = await adminId();
  if (!criadoPor) return { ok: false, error: t("Acesso não autorizado.") };
  if (!(await clienteExiste(clienteSlug))) return { ok: false, error: t("Cliente não encontrado.") };

  const alvo = bloqueioDaConversa(identificadorConversa);
  if (!alvo) return { ok: false, error: t("Esta conversa não tem um contato que possa ser bloqueado.") };

  const erro = await gravar(
    { cliente_slug: clienteSlug, ...alvo, nome: nome?.trim().slice(0, 120) || null, motivo: "bloqueado pela conversa" },
    criadoPor,
    t,
  );
  if (erro && erro !== t("Este contato já está bloqueado.")) return { ok: false, error: erro };
  revalidatePath("/admin/bloqueios");
  revalidatePath("/admin/conversas");
  return { ok: true };
}

/** Desbloquear: apaga a linha (só deste cliente). */
export async function removerBloqueio(clienteSlug: string, id: string): Promise<ActionResult> {
  const t = await getT();
  if (!(await adminId())) return { ok: false, error: t("Acesso não autorizado.") };
  const { error } = await createAdminClient()
    .from("lexia_bloqueios")
    .delete()
    .eq("id", id)
    .eq("cliente_slug", clienteSlug);
  if (error) return { ok: false, error: erroDaTabela(error.code, t) };
  revalidatePath("/admin/bloqueios");
  revalidatePath("/admin/conversas");
  return { ok: true };
}

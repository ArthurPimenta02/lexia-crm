import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O app do iPhone: registar o aparelho e guardar as preferências de avisos.
 *
 * Quem manda os avisos é o serviço da plataforma na VPS (lexia-plataforma),
 * que lê estas tabelas. O painel só grava quem é quem.
 *
 * Autorização: o `user_id` sai SEMPRE da sessão (a rota passa-o), nunca do
 * pedido. A escrita é pela `service_role`; é o `.eq("user_id", …)` de cada
 * consulta que impede alguém de mexer no aparelho ou nas preferências de outro.
 */

export const TIPOS_DE_AVISO = [
  "a_espera",
  "agendamento_novo",
  "agendamento_remarcado",
  "agendamento_cancelado",
  "agenda_manual",
  "resumo_manha",
  "todos_os_clientes",
] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** Sem linha gravada, um tipo está ligado, menos estes. Igual ao serviço da VPS. */
const DESLIGADOS_POR_OMISSAO = new Set<TipoDeAviso>([
  "agenda_manual",
  "todos_os_clientes",
]);

/** O token que a Apple dá a um app num iPhone: hexadecimal, 64 caracteres hoje. */
export function tokenValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[0-9a-fA-F]{32,200}$/.test(valor);
}

export async function registarAparelho(
  userId: string,
  token: string,
  ambiente: "producao" | "sandbox",
) {
  // Upsert pelo token: se outra pessoa entrar no mesmo iPhone, o aparelho
  // passa a ser dela e a anterior deixa de receber ali.
  const { error } = await createAdminClient()
    .from("lexia_app_aparelhos")
    .upsert(
      {
        activo: true,
        ambiente,
        token: token.toLowerCase(),
        user_id: userId,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "token" },
    );

  if (error) {
    throw new Error("Não foi possível registar o aparelho.");
  }
}

/** Ao sair da conta no app: aquele iPhone deixa de receber avisos desta pessoa. */
export async function esquecerAparelho(userId: string, token: string) {
  const { error } = await createAdminClient()
    .from("lexia_app_aparelhos")
    .update({ activo: false })
    .eq("user_id", userId)
    .eq("token", token.toLowerCase());

  if (error) {
    throw new Error("Não foi possível desligar o aparelho.");
  }
}

export async function lerPreferencias(
  userId: string,
): Promise<Record<TipoDeAviso, boolean>> {
  const { data, error } = await createAdminClient()
    .from("lexia_app_preferencias")
    .select("tipo, ligado")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Não foi possível ler as preferências.");
  }

  const gravadas = new Map(
    (data ?? []).map((linha) => [linha.tipo as string, Boolean(linha.ligado)]),
  );

  return Object.fromEntries(
    TIPOS_DE_AVISO.map((tipo) => [
      tipo,
      gravadas.get(tipo) ?? !DESLIGADOS_POR_OMISSAO.has(tipo),
    ]),
  ) as Record<TipoDeAviso, boolean>;
}

export async function gravarPreferencia(
  userId: string,
  tipo: TipoDeAviso,
  ligado: boolean,
) {
  const { error } = await createAdminClient()
    .from("lexia_app_preferencias")
    .upsert(
      { actualizado_em: new Date().toISOString(), ligado, tipo, user_id: userId },
      { onConflict: "user_id,tipo" },
    );

  if (error) {
    throw new Error("Não foi possível gravar a preferência.");
  }
}

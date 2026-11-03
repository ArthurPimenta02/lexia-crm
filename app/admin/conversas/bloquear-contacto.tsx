import Link from "next/link";

import { bloquearConversa } from "@/app/admin/bloqueios/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { bloqueioDaConversa } from "@/lib/bloqueios/identificador";
import { getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Botão "Bloquear contacto" no cabeçalho da conversa do admin (Fase 21).
 *
 * É o caminho principal para o Instagram e o Messenger: o identificador da
 * pessoa (IGSID/PSID) sai da própria conversa, o Arthur não precisa de o saber.
 * Só aparece no admin (a página já confirmou lexia_admin); a acção volta a
 * confirmar antes de gravar.
 */
export async function BloquearContacto({
  clienteSlug,
  identificadorConversa,
  nome,
}: {
  clienteSlug: string;
  identificadorConversa: string;
  nome: string | null;
}) {
  const alvo = bloqueioDaConversa(identificadorConversa);
  if (!alvo) return null;
  const t = await getT();

  const { data, error } = await createAdminClient()
    .from("lexia_bloqueios")
    .select("id")
    .eq("cliente_slug", clienteSlug)
    .eq("canal", alvo.canal)
    .eq("identificador", alvo.identificador)
    .maybeSingle();
  // Sem a tabela (migration por correr) o botão não aparece, em vez de rebentar a conversa.
  if (error) return null;

  if (data) {
    return (
      <Link
        className="text-xs font-medium text-danger underline-offset-2 hover:underline"
        href={`/admin/bloqueios?cliente=${encodeURIComponent(clienteSlug)}`}
      >
        {t("Contato bloqueado")}
      </Link>
    );
  }

  return (
    <ConfirmActionButton
      action={bloquearConversa.bind(null, clienteSlug, identificadorConversa, nome)}
      className="ds-botao ds-botao-secundario ds-botao-p"
      confirmMessage={
        nome
          ? t("Bloquear {nome}? A agente em código deixa de responder a esta pessoa.", {
              nome,
            })
          : t("Bloquear este contato? A agente em código deixa de responder a esta pessoa.")
      }
      pendingLabel="..."
    >
      {t("Bloquear contato")}
    </ConfirmActionButton>
  );
}

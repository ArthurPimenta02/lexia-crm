"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { AtualizarCampanhasResultado } from "@/lib/campaigns/refresh";

/**
 * Botão "Atualizar dados" do painel de campanhas.
 *
 * A action entra por propriedade porque o ecrã do cliente e o do admin usam
 * duas diferentes: a do cliente ignora o formulário e tira o slug do perfil, a
 * do admin lê o slug do selector. O `clienteSlug` só é enviado no segundo caso.
 */
export function CampaignsRefreshButton({
  action,
  atualizadoEm,
  clienteSlug,
}: {
  action: (
    estado: AtualizarCampanhasResultado | null,
    formData: FormData,
  ) => Promise<AtualizarCampanhasResultado>;
  atualizadoEm: string | null;
  clienteSlug?: string;
}) {
  const [resultado, formAction] = useActionState<
    AtualizarCampanhasResultado | null,
    FormData
  >(action, null);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <form action={formAction}>
        {clienteSlug ? (
          <input name="cliente_slug" type="hidden" value={clienteSlug} />
        ) : null}
        <FormSubmitButton
          className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          pendingLabel="A puxar da Meta..."
        >
          Atualizar dados
        </FormSubmitButton>
      </form>

      {resultado ? (
        <p
          className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
          role="status"
        >
          {resultado.mensagem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {atualizadoEm
            ? `Última atualização: ${atualizadoEm}`
            : "Nunca atualizado."}
        </p>
      )}
    </div>
  );
}

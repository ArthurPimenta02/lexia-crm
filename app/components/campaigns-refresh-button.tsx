"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
import type { AtualizarCampanhasResultado } from "@/lib/campaigns/refresh";

/**
 * Botão "Atualizar dados" do painel de campanhas.
 *
 * A action entra por propriedade porque o ecrã do cliente e o do admin usam
 * duas diferentes: a do cliente ignora o formulário e tira o slug do perfil, a
 * do admin lê o slug do selector. O `clienteSlug` só é enviado no segundo caso.
 *
 * `compacto` é para o cabeçalho da faixa do dashboard, onde o botão é um
 * pormenor ao lado de um título e não a acção principal de uma página. Muda-se
 * o tamanho em vez de escrever um segundo botão porque o que aqui é delicado
 * não é o aspecto: é a janela de um minuto entre chamadas à Meta e a mensagem
 * que diz se correu bem, e isso tem de existir numa versão só.
 */
export function CampaignsRefreshButton({
  action,
  atualizadoEm,
  clienteSlug,
  compacto = false,
}: {
  action: (
    estado: AtualizarCampanhasResultado | null,
    formData: FormData,
  ) => Promise<AtualizarCampanhasResultado>;
  atualizadoEm: string | null;
  clienteSlug?: string;
  compacto?: boolean;
}) {
  const [resultado, formAction] = useActionState<
    AtualizarCampanhasResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();

  return (
    <div
      className={
        compacto
          ? "flex flex-col items-end gap-1"
          : "flex flex-col items-start gap-2 sm:items-end"
      }
    >
      <form action={formAction}>
        {clienteSlug ? (
          <input name="cliente_slug" type="hidden" value={clienteSlug} />
        ) : null}
        {compacto ? (
          <FormSubmitButton
            className="ds-botao ds-botao-secundario ds-botao-p"
            pendingLabel={t("Puxando...")}
          >
            {t("Atualizar")}
          </FormSubmitButton>
        ) : (
          <FormSubmitButton
            className="ds-botao ds-botao-primario"
            pendingLabel={t("Puxando da Meta...")}
          >
            {t("Atualizar dados")}
          </FormSubmitButton>
        )}
      </form>

      {resultado ? (
        <p
          className={`text-xs ${resultado.ok ? "text-positive" : "text-danger"}`}
          role="status"
        >
          {resultado.mensagem}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {atualizadoEm
            ? t("Última atualização: {data}", { data: atualizadoEm })
            : t("Nunca atualizado.")}
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
import type { GravarServicoResultado } from "@/lib/servicos/write";

/**
 * Excluir e repor um serviço.
 *
 * Excluir não apaga nada: põe `activo = false` nas duas tabelas do cliente, o
 * que basta para o agente deixar de o vender e o agendamento deixar de o
 * aceitar. O preço, as notas, a receita e o histórico de execuções ficam todos
 * onde estão — se fossem apagados, a margem dos serviços já vendidos mudava
 * para trás.
 */

export type EstadoServicoAction = (
  estado: GravarServicoResultado | null,
  formData: FormData,
) => Promise<GravarServicoResultado>;

function Mensagem({ resultado }: { resultado: GravarServicoResultado | null }) {
  if (!resultado) {
    return null;
  }

  return (
    <p
      className={`text-xs ${resultado.ok ? "text-positive" : "text-danger"}`}
      role="status"
    >
      {resultado.mensagem}
    </p>
  );
}

/**
 * Dois passos de propósito.
 *
 * Um clique só, num botão ao lado do "Gravar", tirava um serviço da lista de
 * venda do agente sem o dono perceber porque é que o telefone parou de pedir
 * aquele serviço.
 */
export function ExcluirServicoForm({
  action,
  clienteSlug,
  nome,
  servicoId,
}: {
  action: EstadoServicoAction;
  clienteSlug?: string;
  nome: string;
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarServicoResultado | null,
    FormData
  >(action, null);
  const [aConfirmar, setAConfirmar] = useState(false);
  const { t } = useIdioma();

  if (!aConfirmar) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          className="text-xs font-semibold text-muted-foreground underline decoration-dotted transition hover:text-danger"
          onClick={() => setAConfirmar(true)}
          type="button"
        >
          {t("Excluir serviço")}
        </button>
        <Mensagem resultado={resultado} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <p className="max-w-sm text-right text-xs text-warning">
        {t(
          'Excluir "{nome}"? O agente deixa de vendê-lo e o agendamento deixa de aceitá-lo. O preço, a receita e o histórico ficam guardados, e você pode restaurá-lo logo abaixo.',
          { nome },
        )}
      </p>

      <div className="flex items-center gap-2">
        <button
          className="ds-botao ds-botao-fantasma ds-botao-p"
          onClick={() => setAConfirmar(false)}
          type="button"
        >
          {t("Cancelar")}
        </button>
        <FormSubmitButton
          className="ds-botao ds-botao-perigo ds-botao-p"
          pendingLabel={t("Excluindo...")}
        >
          {t("Sim, excluir")}
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />
    </form>
  );
}

export function ReporServicoForm({
  action,
  clienteSlug,
  servicoId,
}: {
  action: EstadoServicoAction;
  clienteSlug?: string;
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarServicoResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-1">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <FormSubmitButton
        className="ds-botao ds-botao-secundario ds-botao-p"
        pendingLabel={t("Restaurando...")}
      >
        {t("Restaurar")}
      </FormSubmitButton>

      <Mensagem resultado={resultado} />
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
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
      className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
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

  if (!aConfirmar) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          className="text-xs font-semibold text-muted-foreground underline decoration-dotted transition hover:text-red-700"
          onClick={() => setAConfirmar(true)}
          type="button"
        >
          Excluir serviço
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

      <p className="max-w-sm text-right text-xs text-amber-900">
        Excluir &quot;{nome}&quot;? O agente deixa de o vender e o agendamento
        deixa de o aceitar. O preço, a receita e o histórico ficam guardados, e
        podes repô-lo em baixo.
      </p>

      <div className="flex items-center gap-2">
        <button
          className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          onClick={() => setAConfirmar(false)}
          type="button"
        >
          Cancelar
        </button>
        <FormSubmitButton
          className="inline-flex min-h-8 items-center rounded-full bg-red-700 px-4 text-xs font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
          pendingLabel="A excluir..."
        >
          Sim, excluir
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

  return (
    <form action={formAction} className="flex flex-col gap-1">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <FormSubmitButton
        className="inline-flex min-h-8 items-center rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:opacity-60"
        pendingLabel="A repor..."
      >
        Repor
      </FormSubmitButton>

      <Mensagem resultado={resultado} />
    </form>
  );
}

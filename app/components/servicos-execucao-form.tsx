"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
import type { GravarProdutoResultado } from "@/lib/produtos/write";

/**
 * "Realizei este serviço" — tira do stock tudo o que a receita diz.
 *
 * É o botão que faz o controlo de stock funcionar: sem ele a receita era só
 * uma tabela de custos. Não tem confirmação porque o erro tem conserto (o
 * ajuste de stock na página de produtos), e pedir confirmação a cada carro
 * lavado tornava o registo chato o suficiente para deixar de ser feito.
 */
export function ServicosExecucaoForm({
  action,
  clienteSlug,
  produtosNaReceita,
  servicoId,
}: {
  action: (
    estado: GravarProdutoResultado | null,
    formData: FormData,
  ) => Promise<GravarProdutoResultado>;
  clienteSlug?: string;
  produtosNaReceita: number;
  servicoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarProdutoResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      {clienteSlug ? (
        <input name="cliente_slug" type="hidden" value={clienteSlug} />
      ) : null}
      <input name="servico_id" type="hidden" value={servicoId} />

      <FormSubmitButton
        className="ds-botao ds-botao-verde"
        disabled={produtosNaReceita === 0}
        pendingLabel={t("Descontando...")}
      >
        {t("Realizei este serviço")}
      </FormSubmitButton>

      {resultado ? (
        <p
          className={`text-xs ${resultado.ok ? "text-positive" : "text-danger"}`}
          role="status"
        >
          {resultado.mensagem}
        </p>
      ) : null}
    </form>
  );
}

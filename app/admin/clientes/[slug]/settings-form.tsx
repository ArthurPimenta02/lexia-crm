"use client";

import { useActionState } from "react";

import { useIdioma } from "@/app/components/idioma";

import {
  updateClientSettings,
  type ClientSettingsState,
} from "@/app/admin/clientes/[slug]/actions";

type ClientSettingsFormProps = {
  clienteSlug: string;
  workflowId: string | null;
  initialValues: {
    nome: string;
    status: string;
    modo_teste: boolean;
    cor_principal: string;
    workflow_nome: string;
    workflow_tipo: string;
    webhook_url: string;
    workflow_status: string;
  };
};

const initialState: ClientSettingsState = {
  message: null,
  type: null,
};

export function ClientSettingsForm({
  clienteSlug,
  workflowId,
  initialValues,
}: ClientSettingsFormProps) {
  const { t } = useIdioma();
  const action = updateClientSettings.bind(null, clienteSlug, workflowId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
            htmlFor="nome"
          >
            {t("Nome")}
          </label>
          <input
            className="ds-campo"
            defaultValue={initialValues.nome}
            id="nome"
            name="nome"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
            htmlFor="status"
          >
            {t("Status")}
          </label>
          <select
            className="ds-campo"
            defaultValue={initialValues.status}
            id="status"
            name="status"
          >
            <option value="ativo">{t("Ativo")}</option>
            <option value="inativo">{t("Inativo")}</option>
            <option value="suspenso">{t("Suspenso")}</option>
          </select>
        </div>

        <label className="flex h-10 cursor-pointer items-center gap-3 self-end rounded-[11px] px-3.5 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--ds-linha-forte)]">
          <input
            className="h-4 w-4 accent-primary"
            defaultChecked={initialValues.modo_teste}
            name="modo_teste"
            type="checkbox"
          />
          {t("Modo teste ativo")}
        </label>

        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
            htmlFor="cor_principal"
          >
            {t("Cor principal")}
          </label>
          <input
            className="ds-campo"
            defaultValue={initialValues.cor_principal}
            id="cor_principal"
            name="cor_principal"
            placeholder="#151515"
          />
        </div>
      </div>

      <div className="border-t border-[var(--ds-linha)] pt-5">
        <h3 className="ds-titulo-3 text-foreground">{t("Workflow")}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="workflow_nome"
            >
              {t("Nome")}
            </label>
            <input
              className="ds-campo"
              defaultValue={initialValues.workflow_nome}
              id="workflow_nome"
              name="workflow_nome"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="workflow_tipo"
            >
              {t("Tipo")}
            </label>
            <input
              className="ds-campo"
              defaultValue={initialValues.workflow_tipo}
              id="workflow_tipo"
              name="workflow_tipo"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="webhook_url"
            >
              {t("Webhook URL")}
            </label>
            <input
              className="ds-campo"
              defaultValue={initialValues.webhook_url}
              id="webhook_url"
              name="webhook_url"
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="workflow_status"
            >
              {t("Status")}
            </label>
            <select
              className="ds-campo"
              defaultValue={initialValues.workflow_status}
              id="workflow_status"
              name="workflow_status"
            >
              <option value="ativo">{t("Ativo")}</option>
              <option value="inativo">{t("Inativo")}</option>
              <option value="teste">{t("Teste")}</option>
            </select>
          </div>
        </div>
      </div>

      {state.message ? (
        <p
          className={`tela-aviso ${
            state.type === "success"
              ? "bg-[var(--ds-acao-fundo)] text-[var(--ds-acao-forte)]"
              : "tela-aviso-perigo"
          }`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="ds-botao ds-botao-primario w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? t("Salvando...") : t("Salvar configurações")}
      </button>
    </form>
  );
}

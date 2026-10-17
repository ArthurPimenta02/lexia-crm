"use client";

import { useActionState } from "react";

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
  const action = updateClientSettings.bind(null, clienteSlug, workflowId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="nome"
          >
            Nome
          </label>
          <input
            className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={initialValues.nome}
            id="nome"
            name="nome"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="status"
          >
            Status
          </label>
          <select
            className="h-11 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={initialValues.status}
            id="status"
            name="status"
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="suspenso">Suspenso</option>
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm font-medium text-muted-foreground">
          <input
            className="h-4 w-4"
            defaultChecked={initialValues.modo_teste}
            name="modo_teste"
            type="checkbox"
          />
          Modo teste ativo
        </label>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="cor_principal"
          >
            Cor principal
          </label>
          <input
            className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue={initialValues.cor_principal}
            id="cor_principal"
            name="cor_principal"
            placeholder="#151515"
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="font-semibold text-foreground">Workflow</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="workflow_nome"
            >
              Nome
            </label>
            <input
              className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={initialValues.workflow_nome}
              id="workflow_nome"
              name="workflow_nome"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="workflow_tipo"
            >
              Tipo
            </label>
            <input
              className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={initialValues.workflow_tipo}
              id="workflow_tipo"
              name="workflow_tipo"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="webhook_url"
            >
              Webhook URL
            </label>
            <input
              className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={initialValues.webhook_url}
              id="webhook_url"
              name="webhook_url"
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="workflow_status"
            >
              Status
            </label>
            <select
              className="h-11 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
              defaultValue={initialValues.workflow_status}
              id="workflow_status"
              name="workflow_status"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="teste">Teste</option>
            </select>
          </div>
        </div>
      </div>

      {state.message ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 w-fit rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border-strong"
        disabled={pending}
        type="submit"
      >
        {pending ? "Salvando..." : "Salvar configurações"}
      </button>
    </form>
  );
}

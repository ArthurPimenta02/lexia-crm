"use client";

import { useActionState } from "react";

import {
  createClientAction,
  type NewClientState,
} from "@/app/admin/clientes/novo/actions";
import { useIdioma } from "@/app/components/idioma";

const initialState: NewClientState = {
  message: null,
};

export function NewClientForm() {
  const { t } = useIdioma();
  const [state, formAction, pending] = useActionState(
    createClientAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="nome"
          >
            {t("Nome")}
          </label>
          <input className="ds-campo" id="nome" name="nome" required />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="slug"
          >
            Slug
          </label>
          <input
            className="ds-campo"
            id="slug"
            name="slug"
            placeholder="cliente_exemplo"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="status"
          >
            {t("Status")}
          </label>
          <select
            className="ds-campo"
            defaultValue="ativo"
            id="status"
            name="status"
          >
            <option value="ativo">{t("Ativo")}</option>
            <option value="inativo">{t("Inativo")}</option>
            <option value="suspenso">{t("Suspenso")}</option>
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm font-medium text-muted-foreground">
          <input className="h-4 w-4 accent-primary" name="modo_teste" type="checkbox" />
          {t("Modo teste ativo")}
        </label>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="cor_principal"
          >
            {t("Cor principal")}
          </label>
          <input
            className="ds-campo"
            id="cor_principal"
            name="cor_principal"
            placeholder="#151515"
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <label className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <input className="h-4 w-4 accent-primary" name="criar_workflow" type="checkbox" />
          {t("Criar workflow inicial")}
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="workflow_nome"
            >
              {t("Nome do workflow")}
            </label>
            <input className="ds-campo" id="workflow_nome" name="workflow_nome" />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="workflow_tipo"
            >
              {t("Tipo")}
            </label>
            <input className="ds-campo" id="workflow_tipo" name="workflow_tipo" />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label
              className="text-sm font-medium text-muted-foreground"
              htmlFor="webhook_url"
            >
              {t("Webhook URL")}
            </label>
            <input
              className="ds-campo"
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
              {t("Status")}
            </label>
            <select
              className="ds-campo"
              defaultValue="teste"
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
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <button
        className="ds-botao ds-botao-primario w-fit"
        disabled={pending}
        type="submit"
      >
        {pending ? t("Criando...") : t("Criar cliente")}
      </button>
    </form>
  );
}

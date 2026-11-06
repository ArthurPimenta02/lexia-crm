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
      <section className="ds-bloco grid gap-4 p-5">
      <h2 className="ds-titulo-3 text-foreground">{t("Dados do cliente")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
            htmlFor="nome"
          >
            {t("Nome")}
          </label>
          <input className="ds-campo" id="nome" name="nome" required />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
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
            className="text-[0.8125rem] font-medium text-foreground"
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

        <label className="flex h-10 cursor-pointer items-center gap-3 self-end rounded-[11px] px-3.5 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--ds-linha-forte)]">
          <input className="h-4 w-4 accent-primary" name="modo_teste" type="checkbox" />
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
            id="cor_principal"
            name="cor_principal"
            placeholder="#151515"
          />
        </div>
      </div>
      </section>

      <section className="ds-bloco grid gap-1 p-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input className="h-4 w-4 accent-primary" name="criar_workflow" type="checkbox" />
          <span className="ds-titulo-3 text-foreground">{t("Criar workflow inicial")}</span>
        </label>
        <p className="pl-7 text-sm text-muted-foreground">
          {t("Opcional. Marque e preencha para já ligar o cliente ao n8n.")}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="workflow_nome"
            >
              {t("Nome do workflow")}
            </label>
            <input className="ds-campo" id="workflow_nome" name="workflow_nome" />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-[0.8125rem] font-medium text-foreground"
              htmlFor="workflow_tipo"
            >
              {t("Tipo")}
            </label>
            <input className="ds-campo" id="workflow_tipo" name="workflow_tipo" />
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
      </section>

      {state.message ? (
        <p className="tela-aviso tela-aviso-perigo" role="alert">
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

"use client";

import { useActionState } from "react";

import { useIdioma } from "@/app/components/idioma";

import {
  createClientUser,
  type ClientUserState,
} from "@/app/admin/clientes/[slug]/actions";

type ClientUserFormProps = {
  clienteSlug: string;
};

const initialState: ClientUserState = {
  message: null,
  type: null,
};

export function ClientUserForm({ clienteSlug }: ClientUserFormProps) {
  const { t } = useIdioma();
  const action = createClientUser.bind(null, clienteSlug);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-[0.8125rem] font-medium text-foreground" htmlFor="email">
            {t("E-mail")}
          </label>
          <input
            className="ds-campo"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-[0.8125rem] font-medium text-foreground"
            htmlFor="password"
          >
            {t("Senha temporária")}
          </label>
          <input
            className="ds-campo"
            id="password"
            minLength={6}
            name="password"
            required
            type="password"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[0.8125rem] font-medium text-foreground" htmlFor="role">
            {t("Role")}
          </label>
          <select
            className="ds-campo"
            defaultValue="cliente_admin"
            id="role"
            name="role"
          >
            <option value="cliente_admin">{t("Cliente admin")}</option>
            <option value="cliente_operador">{t("Cliente operador")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[0.8125rem] font-medium text-foreground" htmlFor="status">
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
          </select>
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
        {pending ? t("Criando...") : t("Criar usuário do cliente")}
      </button>
    </form>
  );
}

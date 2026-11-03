"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/app/actions/auth";
import { useIdioma } from "@/app/components/idioma";

const initialState: LoginState = {};

export function LoginForm() {
  const { t } = useIdioma();
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="email">
          {t("E-mail")}
        </label>
        <input
          className="ds-campo !h-12 !text-base"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="password">
          {t("Senha")}
        </label>
        <input
          className="ds-campo !h-12 !text-base"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        className="ds-botao ds-botao-primario ds-botao-g w-full"
        type="submit"
        disabled={pending}
      >
        {pending ? t("Entrando...") : t("Entrar")}
      </button>
    </form>
  );
}

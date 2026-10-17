"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="email">
          E-mail
        </label>
        <input
          className="h-12 rounded-2xl border border-border-strong bg-surface px-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-4 focus:ring-foreground/5"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="password">
          Senha
        </label>
        <input
          className="h-12 rounded-2xl border border-border-strong bg-surface px-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-4 focus:ring-foreground/5"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        className="h-12 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_18px_38px_rgba(0,0,0,0.18)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border-strong disabled:text-muted-foreground"
        type="submit"
        disabled={pending}
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

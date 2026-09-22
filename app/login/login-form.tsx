"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="email">
          E-mail
        </label>
        <input
          className="h-12 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="password">
          Senha
        </label>
        <input
          className="h-12 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        className="h-12 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(0,0,0,0.18)] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
        type="submit"
        disabled={pending}
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

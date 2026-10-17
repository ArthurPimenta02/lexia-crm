"use client";

import { useActionState } from "react";

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
  const action = createClientUser.bind(null, clienteSlug);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="email">
            E-mail
          </label>
          <input
            className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-muted-foreground"
            htmlFor="password"
          >
            Senha temporária
          </label>
          <input
            className="h-11 rounded-lg border border-border-strong px-3 text-sm outline-none transition focus:border-foreground"
            id="password"
            minLength={6}
            name="password"
            required
            type="password"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="role">
            Role
          </label>
          <select
            className="h-11 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue="cliente_admin"
            id="role"
            name="role"
          >
            <option value="cliente_admin">Cliente admin</option>
            <option value="cliente_operador">Cliente operador</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground" htmlFor="status">
            Status
          </label>
          <select
            className="h-11 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground"
            defaultValue="ativo"
            id="status"
            name="status"
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
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
        {pending ? "Criando..." : "Criar usuário do cliente"}
      </button>
    </form>
  );
}

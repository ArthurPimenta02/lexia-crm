"use client";

import { useActionState } from "react";

import {
  createClientAction,
  type NewClientState,
} from "@/app/admin/clientes/novo/actions";

const initialState: NewClientState = {
  message: null,
};

export function NewClientForm() {
  const [state, formAction, pending] = useActionState(
    createClientAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="nome">
            Nome
          </label>
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
            id="nome"
            name="nome"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="slug">
            Slug
          </label>
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
            id="slug"
            name="slug"
            placeholder="cliente_exemplo"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="status">
            Status
          </label>
          <select
            className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
            defaultValue="ativo"
            id="status"
            name="status"
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="suspenso">Suspenso</option>
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-3 text-sm font-medium text-zinc-700">
          <input className="h-4 w-4" name="modo_teste" type="checkbox" />
          Modo teste ativo
        </label>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-zinc-700"
            htmlFor="cor_principal"
          >
            Cor principal
          </label>
          <input
            className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
            id="cor_principal"
            name="cor_principal"
            placeholder="#111827"
          />
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-5">
        <label className="flex items-center gap-3 text-sm font-medium text-zinc-700">
          <input className="h-4 w-4" name="criar_workflow" type="checkbox" />
          Criar workflow inicial
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-zinc-700"
              htmlFor="workflow_nome"
            >
              Nome do workflow
            </label>
            <input
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
              id="workflow_nome"
              name="workflow_nome"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-zinc-700"
              htmlFor="workflow_tipo"
            >
              Tipo
            </label>
            <input
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
              id="workflow_tipo"
              name="workflow_tipo"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label
              className="text-sm font-medium text-zinc-700"
              htmlFor="webhook_url"
            >
              Webhook URL
            </label>
            <input
              className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-900"
              id="webhook_url"
              name="webhook_url"
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-zinc-700"
              htmlFor="workflow_status"
            >
              Status
            </label>
            <select
              className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
              defaultValue="teste"
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
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 w-fit rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        disabled={pending}
        type="submit"
      >
        {pending ? "Criando..." : "Criar cliente"}
      </button>
    </form>
  );
}

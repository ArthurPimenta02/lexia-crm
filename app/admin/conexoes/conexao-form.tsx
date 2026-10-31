"use client";

import { useActionState } from "react";

import { salvarConexao, type ConexaoState } from "@/app/admin/conexoes/actions";
import type { TipoConexao } from "@/lib/conexoes/tipos";

const inicial: ConexaoState = { message: null, type: null };

/**
 * Um cartão por tipo de conexão. Os segredos nunca vêm do servidor: o campo
 * aparece vazio com "guardado, termina em …a1b2" por baixo, e deixá-lo vazio
 * mantém o valor que já estava.
 */
export function ConexaoForm({
  clienteSlug,
  definicao,
  campos,
  finais,
  atualizadoEm,
}: {
  clienteSlug: string;
  definicao: TipoConexao;
  campos: Record<string, string>;
  finais: Record<string, string>;
  atualizadoEm: string | null;
}) {
  const acao = salvarConexao.bind(null, clienteSlug, definicao.tipo);
  const [estado, formAction, pendente] = useActionState(acao, inicial);
  const configurado = Object.keys(campos).length + Object.keys(finais).length > 0;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{definicao.titulo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{definicao.descricao}</p>
        </div>
        <span
          className={`rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium ${configurado ? "text-positive" : "text-muted-foreground"}`}
        >
          {configurado ? "Configurado" : "Não configurado"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {definicao.campos.map((campo) => {
          const id = `${definicao.tipo}-${campo.nome}`;
          const final = finais[campo.nome];
          return (
            <div className="flex min-w-0 flex-col gap-1.5" key={campo.nome}>
              <label className="text-sm font-medium text-muted-foreground" htmlFor={id}>
                {campo.label}
              </label>
              <input
                autoComplete="off"
                className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition focus:border-foreground"
                defaultValue={campo.segredo ? "" : (campos[campo.nome] ?? "")}
                id={id}
                name={campo.nome}
                placeholder={
                  campo.segredo && final ? "deixe vazio para manter" : (campo.exemplo ?? "")
                }
                type={campo.segredo ? "password" : "text"}
              />
              {campo.segredo && final ? (
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Guardado, termina em {final}</span>
                  <label className="inline-flex items-center gap-1">
                    <input name={`apagar_${campo.nome}`} type="checkbox" /> apagar
                  </label>
                </div>
              ) : null}
              {campo.ajuda ? <p className="text-xs text-muted-foreground">{campo.ajuda}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          disabled={pendente}
          type="submit"
        >
          {pendente ? "Gravando..." : "Gravar"}
        </button>
        {estado.message ? (
          <span className={`text-sm ${estado.type === "error" ? "text-danger" : "text-positive"}`}>
            {estado.message}
          </span>
        ) : atualizadoEm ? (
          <span className="text-xs text-muted-foreground">Atualizado em {atualizadoEm}</span>
        ) : null}
      </div>
    </form>
  );
}

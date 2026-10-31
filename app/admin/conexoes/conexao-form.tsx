"use client";

import { useActionState, useState } from "react";

import {
  copiarSegredo,
  salvarConexao,
  type ConexaoState,
} from "@/app/admin/conexoes/actions";
import type { CampoConexao, TipoConexao } from "@/lib/conexoes/tipos";

const inicial: ConexaoState = { message: null, type: null };

const classeInput =
  "h-10 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground outline-none transition focus:border-foreground";
const classeBotao =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border-strong px-3 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.98] disabled:opacity-60";

/**
 * Copia o texto que a função devolver. O Safari só deixa escrever na área de
 * transferência dentro do clique; com o ClipboardItem a promessa conta como
 * parte do clique, mesmo que o valor chegue do servidor depois.
 */
async function copiarParaAreaDeTransferencia(obter: () => Promise<string>) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = obter().then((t) => new Blob([t], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await obter());
}

/**
 * Um segredo já gravado: aparece preenchido com asteriscos e o final, com
 * "Copiar" (vai buscar o valor ao servidor só no clique) e "Trocar" (abre o
 * campo para colar outro). Enquanto não se clica em "Trocar", o formulário
 * não manda este campo, e o valor gravado fica como está.
 */
function SegredoGravado({
  campo,
  clienteSlug,
  final,
  id,
  tipo,
}: {
  campo: CampoConexao;
  clienteSlug: string;
  final: string;
  id: string;
  tipo: string;
}) {
  const [trocar, setTrocar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);

  async function copiar() {
    setCopiando(true);
    setAviso(null);
    try {
      await copiarParaAreaDeTransferencia(async () => {
        const r = await copiarSegredo(clienteSlug, tipo, campo.nome);
        if (!r.valor) throw new Error(r.erro ?? "Nada para copiar.");
        return r.valor;
      });
      setAviso("Copiado.");
    } catch (erro) {
      setAviso(erro instanceof Error ? erro.message : "Não foi possível copiar.");
    } finally {
      setCopiando(false);
    }
  }

  if (trocar) {
    return (
      <>
        <div className="flex gap-2">
          <input
            autoComplete="off"
            autoFocus
            className={classeInput}
            id={id}
            name={campo.nome}
            placeholder="cole a chave nova"
            type="password"
          />
          <button className={classeBotao} onClick={() => setTrocar(false)} type="button">
            Cancelar
          </button>
        </div>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input name={`apagar_${campo.nome}`} type="checkbox" /> apagar a chave gravada
        </label>
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          aria-label={`${campo.label} (gravado)`}
          className={`${classeInput} font-mono text-muted-foreground`}
          id={id}
          readOnly
          value={`••••••••••••${final.replace("…", "")}`}
        />
        <button className={classeBotao} disabled={copiando} onClick={copiar} type="button">
          {copiando ? "..." : "Copiar"}
        </button>
        <button className={classeBotao} onClick={() => setTrocar(true)} type="button">
          Trocar
        </button>
      </div>
      {aviso ? (
        <span className={`text-xs ${aviso === "Copiado." ? "text-positive" : "text-danger"}`}>{aviso}</span>
      ) : null}
    </>
  );
}

/** Um cartão por tipo de conexão. */
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
              {campo.segredo && final ? (
                <SegredoGravado
                  campo={campo}
                  clienteSlug={clienteSlug}
                  final={final}
                  id={id}
                  tipo={definicao.tipo}
                />
              ) : (
                <input
                  autoComplete="off"
                  className={classeInput}
                  defaultValue={campo.segredo ? "" : (campos[campo.nome] ?? "")}
                  id={id}
                  name={campo.nome}
                  placeholder={campo.exemplo ?? ""}
                  type={campo.segredo ? "password" : "text"}
                />
              )}
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

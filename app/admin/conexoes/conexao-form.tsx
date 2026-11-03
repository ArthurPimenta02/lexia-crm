"use client";

import { useActionState, useState } from "react";
import type React from "react";

import {
  copiarSegredo,
  salvarConexao,
  type ConexaoState,
} from "@/app/admin/conexoes/actions";
import { useIdioma } from "@/app/components/idioma";
import type { CampoConexao, TipoConexao } from "@/lib/conexoes/tipos";

const inicial: ConexaoState = { message: null, type: null };

const classeInput = "ds-campo min-w-0";
/**
 * Atributos para o navegador e os gestores de senhas NÃO preencherem nada.
 *
 * Um campo de senha faz o navegador achar que o cartão é um login e
 * preencher o campo de texto anterior com o e-mail guardado — aconteceu na URL
 * do servidor. Por isso os campos de chave são `type="text"` com o texto
 * escondido por CSS (`-webkit-text-security`): sem campo de senha não há
 * "login" para preencher, e o `autoComplete="off"` volta a ser respeitado.
 */
const semAutopreencher = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
const textoEscondido = { WebkitTextSecurity: "disc" } as React.CSSProperties;

const classeBotao = "ds-botao ds-botao-secundario shrink-0";

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
  const { t } = useIdioma();
  const [trocar, setTrocar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiando, setCopiando] = useState(false);

  async function copiar() {
    setCopiando(true);
    setAviso(null);
    try {
      await copiarParaAreaDeTransferencia(async () => {
        const r = await copiarSegredo(clienteSlug, tipo, campo.nome);
        if (!r.valor) throw new Error(r.erro ?? t("Nada para copiar."));
        return r.valor;
      });
      setAviso({ ok: true, texto: t("Copiado.") });
    } catch (erro) {
      setAviso({
        ok: false,
        texto: erro instanceof Error ? erro.message : t("Não foi possível copiar."),
      });
    } finally {
      setCopiando(false);
    }
  }

  if (trocar) {
    return (
      <>
        <div className="flex gap-2">
          <input
            {...semAutopreencher}
            autoFocus
            className={classeInput}
            id={id}
            name={campo.nome}
            placeholder={t("cole a chave nova")}
            style={textoEscondido}
            type="text"
          />
          <button className={classeBotao} onClick={() => setTrocar(false)} type="button">
            {t("Cancelar")}
          </button>
        </div>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input className="accent-primary" name={`apagar_${campo.nome}`} type="checkbox" />{" "}
          {t("apagar a chave salva")}
        </label>
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          aria-label={t("{campo} (salvo)", { campo: t(campo.label) })}
          className={`${classeInput} font-mono text-muted-foreground`}
          id={id}
          readOnly
          value={`••••••••••••${final.replace("…", "")}`}
        />
        <button className={classeBotao} disabled={copiando} onClick={copiar} type="button">
          {copiando ? "..." : t("Copiar")}
        </button>
        <button className={classeBotao} onClick={() => setTrocar(true)} type="button">
          {t("Trocar")}
        </button>
      </div>
      {aviso ? (
        <span className={`text-xs ${aviso.ok ? "text-positive" : "text-danger"}`}>{aviso.texto}</span>
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
  const { t } = useIdioma();
  const acao = salvarConexao.bind(null, clienteSlug, definicao.tipo);
  const [estado, formAction, pendente] = useActionState(acao, inicial);
  const configurado = Object.keys(campos).length + Object.keys(finais).length > 0;

  return (
    <form
      action={formAction}
      autoComplete="off"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
      data-form-type="other"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t(definicao.titulo)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(definicao.descricao)}</p>
        </div>
        <span className={`ds-selo ds-selo-ponto ${configurado ? "ds-selo-verde" : "ds-selo-neutro"}`}>
          {configurado ? t("Configurado") : t("Não configurado")}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {definicao.campos.map((campo) => {
          const id = `${definicao.tipo}-${campo.nome}`;
          const final = finais[campo.nome];
          return (
            <div className="flex min-w-0 flex-col gap-1.5" key={campo.nome}>
              <label className="text-sm font-medium text-muted-foreground" htmlFor={id}>
                {t(campo.label)}
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
                  {...semAutopreencher}
                  className={classeInput}
                  defaultValue={campo.segredo ? "" : (campos[campo.nome] ?? "")}
                  id={id}
                  name={campo.nome}
                  placeholder={campo.exemplo ?? ""}
                  style={campo.segredo ? textoEscondido : undefined}
                  type="text"
                />
              )}
              {campo.ajuda ? <p className="text-xs text-muted-foreground">{t(campo.ajuda)}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="ds-botao ds-botao-primario"
          disabled={pendente}
          type="submit"
        >
          {pendente ? t("Salvando...") : t("Salvar")}
        </button>
        {estado.message ? (
          <span className={`text-sm ${estado.type === "error" ? "text-danger" : "text-positive"}`}>
            {estado.message}
          </span>
        ) : atualizadoEm ? (
          <span className="text-xs text-muted-foreground">
            {t("Atualizado em {data}", { data: atualizadoEm })}
          </span>
        ) : null}
      </div>
    </form>
  );
}

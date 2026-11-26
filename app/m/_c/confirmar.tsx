"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { presencaMovel } from "../agenda/[id]/acoes";

export type ItemConfirmar = { id: string; quando: string; nome: string; servico: string | null };
type Textos = { compareceu: string; faltou: string; titulo: string; verTodos: string | null };

/**
 * "N atendimentos para confirmar" (desenho aprovado a 25/11): Veio / Faltou
 * direto na linha. A linha some logo ao tocar; se a gravação falhar, volta.
 */
export function ListaConfirmar({ itens, textos: t, compacto }: { compacto: boolean; itens: ItemConfirmar[]; textos: Textos }) {
  const router = useRouter();
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [, inicia] = useTransition();
  const visiveis = itens.filter((i) => !feitos.has(i.id));
  if (!visiveis.length) return null;

  const marcar = (id: string, p: "compareceu" | "faltou") => {
    setFeitos((s) => new Set(s).add(id));
    setErro(null);
    inicia(async () => {
      const r = await presencaMovel(id, p);
      if (!r.ok) {
        setFeitos((s) => { const n = new Set(s); n.delete(id); return n; });
        setErro(r.erro);
        return;
      }
      router.refresh();
    });
  };

  const mostrar = compacto ? visiveis.slice(0, 1) : visiveis;
  return (
    <section aria-label={t.titulo} className={`ag-conf${compacto ? " compacto" : ""}`}>
      {compacto ? (
        <div className="ag-conf-cab">
          <b>{t.titulo.replace("{n}", String(visiveis.length))}</b>
          {t.verTodos && visiveis.length > 1 ? <Link href="/m/confirmar">{t.verTodos} ›</Link> : null}
        </div>
      ) : null}
      {mostrar.map((i) => (
        <div className="ag-conf-linha" key={i.id}>
          <Link className="tx" href={`/m/agenda/${i.id}?volta=${encodeURIComponent(compacto ? "/m" : "/m/confirmar")}`}>
            <b>{i.nome}</b>
            <small>{[i.quando, i.servico].filter(Boolean).join(" · ")}</small>
          </Link>
          <button className="sim" onClick={() => marcar(i.id, "compareceu")} type="button">{t.compareceu}</button>
          <button className="nao" onClick={() => marcar(i.id, "faltou")} type="button">{t.faltou}</button>
        </div>
      ))}
      {erro ? <p className="ag-erro" role="alert" style={{ margin: "8px 0 0" }}>{erro}</p> : null}
    </section>
  );
}

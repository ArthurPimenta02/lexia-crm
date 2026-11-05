"use client";

import { useEffect, useState } from "react";

import { IcCalendario, IcConversa, IcEmpresa, IcPessoa } from "../_c/icones";

type Prefs = Record<string, boolean>;

/** Ligar e desligar cada tipo de aviso (usa /api/app/preferencias). */
export function PreferenciasAvisos({ admin, textos: t }: { admin: boolean; textos: Record<"agenda" | "agendaSub" | "espera" | "esperaSub" | "manual" | "manualSub" | "todos" | "todosSub" | "erro", string> }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    void fetch("/api/app/preferencias", { cache: "no-store" }).then((r) => r.json()).then((d) => setPrefs(d.preferencias ?? null)).catch(() => setErro(true));
  }, []);

  const mudar = async (tipos: string[], ligado: boolean) => {
    if (!prefs) return;
    const antes = prefs;
    setPrefs({ ...prefs, ...Object.fromEntries(tipos.map((x) => [x, ligado])) });
    try {
      for (const tipo of tipos) {
        const r = await fetch("/api/app/preferencias", { body: JSON.stringify({ ligado, tipo }), headers: { "content-type": "application/json" }, method: "PUT" });
        if (!r.ok) throw new Error();
      }
      setErro(false);
    } catch {
      setPrefs(antes);
      setErro(true);
    }
  };

  const linha = (chave: string, tipos: string[], icone: React.ReactNode, titulo: string, sub: string) => {
    const on = Boolean(prefs && tipos.every((x) => prefs[x]));
    return (
      <button aria-pressed={on} className="m-opcao" disabled={!prefs} key={chave} onClick={() => void mudar(tipos, !on)} type="button">
        <div className="ic">{icone}</div>
        <div><b>{titulo}</b><span>{sub}</span></div>
        <span className={`m-interr${on ? " on" : ""}`} />
      </button>
    );
  };

  return (
    <>
      <div className="m-caixa">
        {linha("espera", ["a_espera"], <IcConversa />, t.espera, t.esperaSub)}
        {linha("agenda", ["agendamento_novo", "agendamento_remarcado", "agendamento_cancelado"], <IcCalendario />, t.agenda, t.agendaSub)}
        {linha("manual", ["agenda_manual"], <IcPessoa />, t.manual, t.manualSub)}
        {admin ? linha("todos", ["todos_os_clientes"], <IcEmpresa />, t.todos, t.todosSub) : null}
      </div>
      {erro ? <p style={{ color: "var(--m-vermelho)", fontSize: 13, margin: "6px 4px" }}>{t.erro}</p> : null}
    </>
  );
}

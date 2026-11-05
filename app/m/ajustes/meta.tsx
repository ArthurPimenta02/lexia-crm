"use client";

import { useActionState } from "react";

import { guardarMeta } from "./acoes";

/** A meta do mês: quantos agendamentos e se conta todos ou só os do agente. */
export function Meta({ conta, mes, textos }: { conta: "todos" | "agente"; mes: number; textos: Record<"agente" | "contar" | "erro" | "guardar" | "guardada" | "porMes" | "todos", string> }) {
  const [estado, accao, aGuardar] = useActionState(guardarMeta, null as null | "ok" | "erro");
  return (
    <form action={accao} className="m-caixa" id="meta">
      <label className="m-op">
        <span className="t">{textos.porMes}</span>
        <input className="m-num-in" defaultValue={mes || ""} inputMode="numeric" max={9999} min={0} name="mes" placeholder="0" type="number" />
      </label>
      <label className="m-op">
        <span className="t">{textos.contar}</span>
        <select className="m-sel" defaultValue={conta} name="conta">
          <option value="todos">{textos.todos}</option>
          <option value="agente">{textos.agente}</option>
        </select>
      </label>
      <div className="m-op">
        <span className="t" style={{ color: estado === "erro" ? "var(--m-vermelho)" : "var(--m-texto2)", fontSize: 13 }}>{estado === "ok" ? textos.guardada : estado === "erro" ? textos.erro : ""}</span>
        <button className="m-pill jade" disabled={aGuardar} type="submit">{textos.guardar}</button>
      </div>
    </form>
  );
}

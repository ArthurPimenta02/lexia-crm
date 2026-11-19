"use client";

import { useState, useTransition } from "react";

import { guardarNotaItem, mudarEstadoItem } from "@/app/admin/analises/actions";
import { useIdioma } from "@/app/components/idioma";

type Estado = "novo" | "visto" | "corrigido" | "falso_alarme";

/** Os botões de estado e a nota de um item da análise. */
export function ItemAcoes({ estado, id, nota }: { estado: string; id: string; nota: string | null }) {
  const { t } = useIdioma();
  const [atual, setAtual] = useState(estado);
  const [texto, setTexto] = useState(nota ?? "");
  const [guardada, setGuardada] = useState(nota ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, iniciar] = useTransition();

  const opcoes: { label: string; valor: Estado }[] = [
    { label: t("Visto"), valor: "visto" },
    { label: t("Corrigido"), valor: "corrigido" },
    { label: t("Falso alarme"), valor: "falso_alarme" },
  ];

  function mudar(valor: Estado) {
    // Tocar no estado que já está ativo devolve o item a "novo".
    const novo: Estado = atual === valor ? "novo" : valor;
    const antes = atual;
    setAtual(novo);
    setErro(null);
    iniciar(async () => {
      const r = await mudarEstadoItem(id, novo);
      if (!r.ok) {
        setAtual(antes);
        setErro(r.error ?? t("Não foi possível salvar."));
      }
    });
  }

  function guardar() {
    setErro(null);
    iniciar(async () => {
      const r = await guardarNotaItem(id, texto);
      if (r.ok) setGuardada(texto.trim());
      else setErro(r.error ?? t("Não foi possível salvar."));
    });
  }

  const notaMudou = texto.trim() !== guardada.trim();

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div aria-label={t("Estado do item")} className="ds-segmentado w-full sm:w-fit" role="group">
        {opcoes.map((o) => (
          <button
            aria-pressed={atual === o.valor}
            className="ds-segmento flex-1 sm:flex-none"
            disabled={aGuardar}
            key={o.valor}
            onClick={() => mudar(o.valor)}
            type="button"
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          aria-label={t("Nota")}
          className="ds-campo min-h-10 flex-1 resize-y py-2 text-base leading-snug sm:text-sm"
          maxLength={2000}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t("Nota (o que foi feito, onde, quando)")}
          rows={1}
          value={texto}
        />
        {notaMudou ? (
          <button className="ds-botao ds-botao-secundario ds-botao-p self-end sm:self-auto" disabled={aGuardar} onClick={guardar} type="button">
            {aGuardar ? t("Salvando...") : t("Salvar nota")}
          </button>
        ) : null}
      </div>
      {erro ? (
        <p className="text-sm font-medium text-[var(--ds-perigo)]" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

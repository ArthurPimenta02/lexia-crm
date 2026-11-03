"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState, useTransition } from "react";

import { mudarTemaAction } from "@/app/actions/idioma";
import { useIdioma } from "@/app/components/idioma";
import type { Tema } from "@/lib/tema";

/**
 * Claro, escuro ou automático. Muda na hora (o atributo no `<html>`) e
 * guarda a escolha em segundo plano, sem recarregar a página.
 */
export function SeletorTema({
  className = "",
  compacto = false,
}: {
  className?: string;
  /** Só ícones (barra lateral estreita); o nome fica no `title`. */
  compacto?: boolean;
}) {
  const { t, tema: temaGuardado } = useIdioma();
  const [tema, setTema] = useState<Tema>(temaGuardado);
  const [, iniciar] = useTransition();

  const opcoes: { icone: typeof Sun; rotulo: string; valor: Tema }[] = [
    { icone: Sun, rotulo: t("Claro"), valor: "claro" },
    { icone: Moon, rotulo: t("Escuro"), valor: "escuro" },
    { icone: Monitor, rotulo: t("Automático"), valor: "sistema" },
  ];

  return (
    <div className={`ds-trilho w-full ${className}`} role="group" aria-label={t("Tema")}>
      {opcoes.map(({ icone: Icone, rotulo, valor }) => (
        <button
          aria-label={rotulo}
          aria-pressed={tema === valor}
          className="flex flex-1 items-center justify-center gap-1.5 !px-2"
          key={valor}
          onClick={() => {
            setTema(valor);
            document.documentElement.dataset.tema = valor;
            iniciar(() => mudarTemaAction(valor));
          }}
          title={rotulo}
          type="button"
        >
          <Icone aria-hidden="true" className="h-3.5 w-3.5" />
          {compacto ? null : <span className="text-[0.75rem]">{rotulo}</span>}
        </button>
      ))}
    </div>
  );
}

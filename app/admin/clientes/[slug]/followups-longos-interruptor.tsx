"use client";

import { useState, useTransition } from "react";

import { Interruptor } from "@/app/components/ds";
import { useIdioma } from "@/app/components/idioma";
import { definirFollowupsLongos } from "@/app/admin/clientes/[slug]/actions";

/** Liga/desliga os follow-ups de 3 e 7 dias de um cliente (lexia_clientes.followups_longos). */
export function FollowupsLongosInterruptor({ clienteSlug, ligado }: { clienteSlug: string; ligado: boolean }) {
  const { t } = useIdioma();
  const [valor, setValor] = useState(ligado);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{valor ? t("Ligados") : t("Desligados")}</span>
      <Interruptor
        ligado={valor}
        onChange={(novo) => {
          if (pendente) return;
          setErro(null);
          setValor(novo);
          iniciar(async () => {
            const r = await definirFollowupsLongos(clienteSlug, novo);
            if (!r.ok) {
              setValor(!novo);
              setErro(r.error);
            }
          });
        }}
        rotulo={t("Follow-ups de 3 e 7 dias")}
      />
      {erro ? <span className="text-sm text-[var(--ds-perigo)]">{erro}</span> : null}
    </div>
  );
}

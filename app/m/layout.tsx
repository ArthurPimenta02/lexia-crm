import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GestoVoltar } from "@/app/components/gesto-voltar";
import { PonteDoApp } from "@/app/components/ponte-do-app";
import { contextoMovel } from "@/lib/movel/contexto";

import { AbasMovel } from "./_c/abas";
import "./m.css";

export const metadata: Metadata = { title: "Lexia" };

/**
 * A área do app do iPhone (/m). A casca nativa abre aqui; no navegador também
 * funciona, num celular. Quem não tem sessão vai ao login e volta para cá.
 */
export default async function LayoutMovel({ children }: { children: React.ReactNode }) {
  const c = await contextoMovel();

  if (!c) {
    redirect("/login?destino=/m");
  }

  return (
    <div className="m-app" lang={c.idioma}>
      {children}
      <AbasMovel
        rotulos={{
          agenda: c.t("Agenda"),
          busca: c.t("Procurar"),
          conversas: c.t("Conversas"),
          hoje: c.t("Hoje"),
          resultados: c.t("Resultados"),
        }}
      />
      <PonteDoApp />
      <GestoVoltar />
    </div>
  );
}

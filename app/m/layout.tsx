import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { GestoVoltar } from "@/app/components/gesto-voltar";
import { PonteDoApp } from "@/app/components/ponte-do-app";
import { contextoMovel } from "@/lib/movel/contexto";
import { COOKIE_MODO_MOVEL, modoValido } from "@/lib/movel/modo";

import { AbasMovel } from "./_c/abas";
import { BarraDeEstado } from "./_c/modo";
import { TecladoGlobal } from "./_c/teclado";
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

  const modo = modoValido((await cookies()).get(COOKIE_MODO_MOVEL)?.value);

  return (
    <div className="m-app" data-modo={modo} lang={c.idioma}>
      {children}
      <AbasMovel
        rotulos={{
          analista: c.t("Analista Lexia"),
          conversas: c.t("Conversas"),
          hoje: c.t("Hoje"),
          marcar: c.t("Marcar"),
          mais: c.t("Mais"),
          menu: c.t("Menu"),
          resultados: c.t("Resultados"),
        }}
      />
      <BarraDeEstado />
      <TecladoGlobal />
      <PonteDoApp />
      <GestoVoltar />
    </div>
  );
}

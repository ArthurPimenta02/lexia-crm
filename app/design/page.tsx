import type { Metadata } from "next";

import "../design-system.css";
import { Vitrine } from "./vitrine";

export const metadata: Metadata = {
  title: "Design system · Lexia",
  robots: { index: false, follow: false },
};

/**
 * Vitrine do design system (v1, em avaliação). Só dados de exemplo, nada da
 * base. Não está ligada a nenhum menu.
 */
export default function PaginaDesign() {
  return <Vitrine />;
}

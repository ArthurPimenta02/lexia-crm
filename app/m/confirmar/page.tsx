import Link from "next/link";

import { exigirContextoMovel } from "@/lib/movel/contexto";
import { itensParaConfirmar } from "@/lib/movel/confirmar";

import { ListaConfirmar } from "../_c/confirmar";
import { IcVoltar } from "../_c/icones";
import { VazioMascote } from "../_c/vazio";

export const dynamic = "force-dynamic";

/** Todos os atendimentos dos últimos 7 dias sem compareceu/faltou. */
export default async function ConfirmarMovel() {
  const c = await exigirContextoMovel();
  const { t } = c;
  const itens = await itensParaConfirmar(c);
  return (
    <main className="m-pagina m6">
      <header className="m6-cab" style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Link aria-label={t("Voltar")} className="ag-x" href="/m"><IcVoltar tamanho={18} /></Link>
        <h1>{t("Para confirmar")}</h1>
      </header>
      <p className="ag-dica" style={{ margin: 0, textAlign: "left" }}>{t("O cliente compareceu? Atendimentos dos últimos 7 dias.")}</p>
      {itens.length ? (
        <ListaConfirmar compacto={false} itens={itens} textos={{ compareceu: t("Veio"), faltou: t("Faltou"), titulo: t("Para confirmar"), verTodos: null }} />
      ) : <VazioMascote>{t("Tudo confirmado.")}</VazioMascote>}
    </main>
  );
}

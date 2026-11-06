import { contextoMovel } from "@/lib/movel/contexto";

import { BotaoVoltar } from "../../_c/voltar";
import { excluirMinhaConta } from "../acoes";

export const dynamic = "force-dynamic";

/** Excluir a própria conta: o que acontece, uma confirmação e o botão. */
export default async function ExcluirConta({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const { aviso } = await searchParams;

  const avisos: Record<string, string> = {
    confirmar: t("Marque a confirmação para continuar."),
    demo: t("Esta é uma conta de demonstração: a exclusão fica desligada para não apagar os dados de teste. Numa conta normal, a conta é excluída na hora."),
    equipe: t("Contas da equipe Lexia não se excluem pelo app."),
    erro: t("Não foi possível excluir agora. Tente de novo ou escreva para suporte@uselexia.app."),
  };
  const texto = aviso ? avisos[aviso] : undefined;

  return (
    <main className="m-pagina sem-abas">
      <div className="m-topo" style={{ paddingBottom: 10 }}>
        <BotaoVoltar reserva="/m/ajustes" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Excluir minha conta")}</b></div>
      </div>

      <div className="m-caixa" style={{ padding: "16px 18px", fontSize: 15, lineHeight: 1.5 }}>
        <p style={{ margin: "0 0 10px" }}>{t("Ao excluir, apagamos o seu login ({email}), os aparelhos ligados aos avisos e as suas preferências. Você sai do app e não consegue entrar de novo com esta conta.", { email: c.email ?? "" })}</p>
        <p style={{ margin: 0, color: "var(--m-texto2)" }}>{t("As conversas, a agenda e os resultados são da empresa {empresa} e continuam disponíveis para a equipe dela.", { empresa: c.clienteNome })}</p>
      </div>

      {texto ? (
        <p role="status" style={{ margin: "14px 4px 0", fontSize: 14, color: aviso === "demo" || aviso === "equipe" ? "var(--m-texto2)" : "var(--m-vermelho)" }}>{texto}</p>
      ) : null}

      <form action={excluirMinhaConta} style={{ marginTop: 18, display: "grid", gap: 14 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15 }}>
          <input name="confirmo" required style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--m-vermelho)" }} type="checkbox" value="sim" />
          <span>{t("Entendo que a exclusão é definitiva.")}</span>
        </label>
        <button className="m-botao" style={{ background: "var(--m-vermelho)", color: "#fff" }} type="submit">{t("Excluir minha conta")}</button>
      </form>
    </main>
  );
}

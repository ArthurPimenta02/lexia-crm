"use client";

import { useEffect } from "react";

/**
 * Erro numa tela do app (25/11). Antes não havia nenhum: qualquer falha mostrava a
 * página de erro crua do servidor ("Application error"), que o Arthur via como
 * "uma tela da Vercel". Casos reais: sessão a morrer a meio de um pedido e o app
 * aberto numa versão antiga depois de uma publicação (ações e pedaços de código
 * que já não existem). Recarregar resolve os dois: com sessão boa a tela volta,
 * sem sessão o layout manda para o login.
 */
export default function ErroMovel({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] erro na tela:", error.digest ?? error.message);
  }, [error]);

  const pt = typeof navigator === "undefined" || !/^(en|es)/i.test(navigator.language);
  const es = !pt && /^es/i.test(navigator.language);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "calc(env(safe-area-inset-top) + 48px) 20px 24px" }}>
      <div className="m-vazio">
        {pt ? "Não foi possível abrir esta tela." : es ? "No se pudo abrir esta pantalla." : "This screen couldn't be opened."}
      </div>
      <button className="m-botao" onClick={() => window.location.reload()} type="button">
        {pt ? "Tentar de novo" : es ? "Intentar de nuevo" : "Try again"}
      </button>
    </div>
  );
}

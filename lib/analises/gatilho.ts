import "server-only";

import { issueDoPedido, REPOSITORIO_DA_ROTINA, type LinhaPedido } from "@/lib/analises/regras";

/**
 * O gatilho da rotina na nuvem: uma issue nova no repositório privado
 * `lexia-agentes` com o título "Análise pedida #<id>" e o pedido em JSON.
 *
 * O token (`ANALISE_GITHUB_TOKEN`) só existe no servidor e só vai no
 * cabeçalho do pedido ao GitHub: nunca entra na resposta nem no corpo.
 * Sem a variável não se dispara nada: o pedido fica gravado e corre na
 * próxima análise.
 */
export type ResultadoGatilho = "disparada" | "sem_token" | "falhou";

export async function dispararRotina(id: string, linha: LinhaPedido): Promise<ResultadoGatilho> {
  const token = process.env.ANALISE_GITHUB_TOKEN?.trim();
  if (!token) return "sem_token";

  try {
    const resposta = await fetch(`https://api.github.com/repos/${REPOSITORIO_DA_ROTINA}/issues`, {
      body: JSON.stringify(issueDoPedido(id, linha)),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "lexia-painel",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) {
      console.error("[analises] a issue do pedido falhou", id, resposta.status);
      return "falhou";
    }
    return "disparada";
  } catch (erro) {
    console.error("[analises] a issue do pedido falhou", id, erro instanceof Error ? erro.name : "erro");
    return "falhou";
  }
}

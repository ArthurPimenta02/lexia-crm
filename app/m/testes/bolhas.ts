/**
 * Área de testes do app: como uma execução de teste vira bolhas no chat.
 *
 * O contrato é o mesmo do painel (app/app/area-testes): cada mensagem que o
 * dono escreve gera uma linha em `lexia_testes_execucoes`, gravada pelo n8n.
 * `mensagem_teste` é o que o dono escreveu; `mensagens` (jsonb, um elemento
 * por bolha) é o que o agente respondeu; se vier vazia vale `resposta_obtida`.
 */

export type ExecucaoTeste = {
  id: string;
  run_id: string | null;
  session_id: string;
  mensagem_teste: string | null;
  mensagens: unknown;
  resposta_obtida: string | null;
  criado_em: string | null;
};

export type Bolha = { id: string; lado: "agente" | "dono"; texto: string; quando: string | null };

/** Erro que as actions devolvem quando não há sessão (a tela traduz). */
export const SEM_SESSAO = "SEM_SESSAO";

/** As colunas que a tela lê (nunca o raw_* nem o webhook). */
export const COLUNAS_EXECUCAO = "id, run_id, session_id, mensagem_teste, mensagens, resposta_obtida, criado_em";

function textoDe(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor && typeof valor === "object") {
    const v = valor as Record<string, unknown>;
    for (const c of [v.text, v.content, v.message, v.resposta]) {
      if (typeof c === "string" && c.trim()) return c;
    }
  }
  return "";
}

/** As bolhas do agente numa execução, pela mesma regra do painel. */
export function respostasDe(e: Pick<ExecucaoTeste, "mensagens" | "resposta_obtida">): string[] {
  const reserva = e.resposta_obtida ? [e.resposta_obtida] : [];
  let fonte = e.mensagens;
  if (typeof fonte === "string") {
    try {
      const lido = JSON.parse(fonte) as unknown;
      if (Array.isArray(lido)) fonte = lido;
    } catch {
      // texto simples: vale como uma bolha
    }
  }
  if (Array.isArray(fonte)) {
    const ms = fonte.map(textoDe).filter((s) => s.trim());
    return ms.length ? ms : reserva;
  }
  const uma = textoDe(fonte);
  return uma.trim() ? [uma] : reserva;
}

export function bolhasDe(execucoes: ExecucaoTeste[]): Bolha[] {
  return execucoes.flatMap((e) => {
    const out: Bolha[] = [];
    if (e.mensagem_teste) out.push({ id: `${e.id}-d`, lado: "dono", quando: e.criado_em, texto: e.mensagem_teste });
    respostasDe(e).forEach((texto, i) => out.push({ id: `${e.id}-a${i}`, lado: "agente", quando: e.criado_em, texto }));
    return out;
  });
}

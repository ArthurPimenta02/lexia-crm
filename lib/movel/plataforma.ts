import "server-only";

/**
 * Chamada ao serviço da plataforma na VPS (lexia-plataforma), que envia pelo
 * WhatsApp/Instagram/Messenger do negócio, pausa o agente e grava o histórico.
 * O painel já conferiu a sessão e a empresa antes de chamar.
 */
export class ErroPlataforma extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function chamarPlataforma<T = unknown>(caminho: string, corpo: unknown, timeoutMs = 90_000): Promise<T> {
  const url = process.env.PLATAFORMA_URL?.replace(/\/+$/, "");
  const chave = process.env.PLATAFORMA_SEGREDO;
  if (!url || !chave) throw new ErroPlataforma("O envio pelo app ainda não está ligado.", 503);

  let r: Response;
  try {
    r = await fetch(`${url}${caminho}`, {
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json", "x-lexia-chave": chave },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErroPlataforma("Sem ligação ao serviço de envio. Tente de novo.", 502);
  }
  const dados = (await r.json().catch(() => ({}))) as { erro?: string } & T;
  if (!r.ok) throw new ErroPlataforma(dados.erro || "O envio falhou.", r.status >= 500 ? 502 : r.status);
  return dados;
}

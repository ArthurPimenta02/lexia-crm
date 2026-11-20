/**
 * O que a tela da conversa guarda no aparelho para NADA do que ela escreveu se perder
 * (19/11/2026: a Jessica perdeu respostas ao voltar, ao recarregar e com a sessão expirada).
 *
 *  - o cartão em edição (o que ela mudou nos campos, o "Ver e editar", o texto que o microfone escreveu) fica
 *    gravado a cada edição, com a chave da fala da Lia a que responde, e volta ao abrir a página;
 *  - a resposta enviada fica guardada até o servidor confirmar que gravou; se a sessão expirou, volta a ser
 *    enviada sozinha depois de ela entrar de novo (o servidor não a duplica: o id do envio é o mesmo);
 *  - ao corrigir a resposta anterior, o cartão reabre com o que ela tinha respondido.
 *
 * Sem React e sem navegador: a tela passa o `localStorage` e o `fetch`, os testes passam duplos.
 */
import type { Cartao, MensagemDaConversa, Progresso, RespostaDesfeita } from "@/lib/onboarding/conversa";

export type Armazem = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** O estado do cartão ativo. `rascunho` é o texto livre do próprio cartão (os serviços que ela conta, o nome a acrescentar). */
export type EstadoDoCartao = { valores: Record<string, unknown>; manter: Set<string>; novos: string[]; rascunho?: string };

export const k = (c: { campo: string; itemId: string | null }) => `${c.itemId ?? ""}|${c.campo}`;

/** O cartão como chega, antes de ela mexer: o que o rascunho achou (os de escolha começam vazios). */
export function estadoInicial(c: Cartao): EstadoDoCartao {
  const valores: Record<string, unknown> = {};
  const confirmar = c.tipo === "confirmar" ? c.campos : c.tipo === "item" ? c.confirmar : [];
  for (const f of confirmar) valores[k(f)] = f.valor;
  // Na tabela, o que as fontes acharam já vem escrito na linha do serviço.
  // Na lista de perguntas frequentes, objeções e profissionais, a resposta sugerida de cada item já vem escrita.
  if (c.tipo === "lista") for (const f of c.itens.flatMap((i) => i.campos ?? [])) valores[k(f)] = f.valor;
  // Nas escolhas com recomendação, a recomendada já vem marcada (e fica à vista o que está sendo aceito).
  if (c.tipo === "cartoes" && c.secao === "recomendadas") for (const f of c.campos) valores[k(f)] = f.recomendado;
  if (c.tipo === "tabela") for (const f of c.linhas.flatMap((l) => l.campos)) if (f.valor !== undefined && f.valor !== null) valores[k(f)] = f.valor;
  return { valores, manter: new Set(c.tipo === "lista" ? c.itens.map((i) => i.id) : []), novos: [] };
}

const serial = (e: EstadoDoCartao) => JSON.stringify({ valores: e.valores, manter: [...e.manter].sort(), novos: e.novos, rascunho: e.rascunho ?? "" });

/** Ela mudou alguma coisa no cartão? */
export const cartaoEditado = (e: EstadoDoCartao, cartao: Cartao) => serial(e) !== serial(estadoInicial(cartao));

export const chaveDoCartao = (cliente: string | undefined, falaId: string) => `lexia_onboarding_cartao_${cliente ?? "eu"}_${falaId}`;
export const chaveDoPendente = (cliente: string | undefined) => `lexia_onboarding_pendente_${cliente ?? "eu"}`;

function ler(armazem: Armazem | null, chave: string): unknown {
  try {
    const v = armazem?.getItem(chave);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function escrever(armazem: Armazem | null, chave: string, valor: unknown) {
  try {
    if (valor === null) armazem?.removeItem(chave);
    else armazem?.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento local (navegação privada, cheio): a tela funciona na mesma
  }
}

/** Grava o cartão a cada edição. Sem edições, não fica nada guardado. */
export function guardarCartao(armazem: Armazem | null, chave: string, estado: EstadoDoCartao, cartao: Cartao) {
  escrever(armazem, chave, cartaoEditado(estado, cartao) ? { valores: estado.valores, manter: [...estado.manter], novos: estado.novos, rascunho: estado.rascunho ?? "", em: Date.now() } : null);
}

/** O cartão guardado no aparelho, ou null. */
export function lerCartao(armazem: Armazem | null, chave: string): EstadoDoCartao | null {
  const v = ler(armazem, chave) as { valores?: Record<string, unknown>; manter?: string[]; novos?: string[]; rascunho?: string } | null;
  if (!v || typeof v !== "object" || !v.valores || typeof v.valores !== "object") return null;
  return { valores: v.valores, manter: new Set(Array.isArray(v.manter) ? v.manter.map(String) : []), novos: Array.isArray(v.novos) ? v.novos.map(String) : [], ...(v.rascunho ? { rascunho: String(v.rascunho) } : {}) };
}

export const apagarCartao = (armazem: Armazem | null, chave: string) => escrever(armazem, chave, null);

/** "300 a 600" → mínimo e máximo (o contrário de `faixaDe` da tela), para a faixa reabrir nos dois campos. */
function pontasDaFaixa(v: unknown): { min: string; max: string } | null {
  const s = String(v ?? "").trim();
  let m = /^(\S+) a (\S+)$/.exec(s);
  if (m) return { min: m[1], max: m[2] };
  m = /^a partir de (\S+)$/.exec(s);
  if (m) return { min: m[1], max: "" };
  m = /^até (\S+)$/.exec(s);
  return m ? { min: "", max: m[1] } : null;
}

/**
 * O cartão reaberto pelo "corrigir a resposta anterior": parte do cartão como chegou e põe por cima o que ela
 * tinha respondido. O texto que ela escreveu (ou a transcrição do áudio) volta para o próprio cartão quando o
 * cartão é de texto, ou para a caixa de texto livre.
 */
export function estadoComDesfeita(cartao: Cartao, d: RespostaDesfeita): { estado: EstadoDoCartao; texto: string } {
  const estado = estadoInicial(cartao);
  for (const v of d.valores) {
    estado.valores[k(v)] = v.valor;
    if (v.campo === "faixa_de_preco") {
      const p = pontasDaFaixa(v.valor);
      if (p) {
        estado.valores[`${k(v)}#min`] = p.min;
        estado.valores[`${k(v)}#max`] = p.max;
      }
    }
  }
  if (d.lista && cartao.tipo === "lista") {
    estado.manter = new Set(d.lista.manter.map(String));
    estado.novos = [...d.lista.novos];
  }
  const texto = d.texto.trim();
  if (cartao.tipo === "itens" && texto) return { estado: { ...estado, rascunho: texto }, texto: "" };
  return { estado, texto };
}

// ------------------------------------------------------------------ o envio

export type EnvioGuardado = {
  id: string;
  texto: string;
  arquivo?: { id: string; nome: string; mime: string; audio: boolean };
  valores?: { campo: string; itemId: string | null; valor: unknown }[];
  lista?: { manter: string[]; novos: string[] };
  pular?: boolean;
  nenhum?: boolean;
  /** A fala da Lia a que responde (o cartão guardado com esta chave só sai depois de o servidor confirmar). */
  falaId?: string;
};

export const guardarPendente = (armazem: Armazem | null, chave: string, envio: EnvioGuardado | null) => escrever(armazem, chave, envio);
export function lerPendente(armazem: Armazem | null, chave: string): EnvioGuardado | null {
  const v = ler(armazem, chave) as EnvioGuardado | null;
  return v && typeof v === "object" && typeof v.id === "string" && v.id ? v : null;
}

export type ResultadoDoEnvio =
  | { ok: true; mensagens: MensagemDaConversa[]; progresso: Progresso | null }
  | { ok: false; erro: string; sessao: boolean; guardada: boolean };

/**
 * Manda um turno ao servidor. Antes, renova a sessão (um painel aberto há dias tem o token vencido). Só devolve
 * `ok` quando o servidor responde com a conversa gravada; qualquer outra coisa é falha, e a tela mantém a resposta.
 * Sessão expirada (401) volta marcada, para a tela pedir para entrar de novo e reenviar o MESMO envio depois.
 */
export async function enviarTurno(
  envio: EnvioGuardado,
  deps: { cliente?: string; fetch: typeof fetch; renovarSessao?: () => Promise<unknown>; textos: { falhou: string; sessao: string } },
): Promise<ResultadoDoEnvio> {
  try {
    await deps.renovarSessao?.();
  } catch {
    // sem renovar, tenta-se na mesma: o servidor diz se a sessão expirou
  }
  try {
    const r = await deps.fetch("/api/onboarding/conversa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cliente: deps.cliente, idDoAparelho: envio.id, texto: envio.texto, arquivoId: envio.arquivo?.id, valores: envio.valores, lista: envio.lista, pular: envio.pular, nenhum: envio.nenhum }),
    });
    const j = (await r.json().catch(() => ({}))) as { mensagens?: MensagemDaConversa[]; progresso?: Progresso; erro?: string; motivo?: string; guardada?: boolean };
    if (r.status === 401 || j.motivo === "sessao") return { ok: false, erro: deps.textos.sessao, sessao: true, guardada: false };
    if (!r.ok || !Array.isArray(j.mensagens)) return { ok: false, erro: j.erro ?? deps.textos.falhou, sessao: false, guardada: !!j.guardada };
    return { ok: true, mensagens: j.mensagens, progresso: j.progresso ?? null };
  } catch {
    return { ok: false, erro: deps.textos.falhou, sessao: false, guardada: false };
  }
}

/**
 * Depois da resposta do servidor: SÓ com a confirmação de que gravou o envio guardado e o cartão saem do aparelho.
 * Em qualquer falha fica tudo onde estava (o envio para reenviar, o cartão com o que ela marcou).
 */
export function concluirEnvio(armazem: Armazem | null, cliente: string | undefined, envio: EnvioGuardado, r: ResultadoDoEnvio) {
  if (!r.ok) return;
  guardarPendente(armazem, chaveDoPendente(cliente), null);
  if (envio.falaId) apagarCartao(armazem, chaveDoCartao(cliente, envio.falaId));
}

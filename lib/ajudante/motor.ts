import "server-only";

import { chaveDoCliente, ErroDeIa, type ChaveDeIa } from "@/lib/onboarding/ia";
import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { FERRAMENTAS, ferramentasAnthropic, type Escopo, type Proposta } from "./ferramentas";

/**
 * O motor do Analista Lexia: pergunta → Claude → ferramentas → resposta.
 *
 * - Chave = a conexão "ia" do PRÓPRIO cliente da sessão (lexia_conexoes, a mesma
 *   do onboarding). Sem ela não chama nada e o chat diz que não está ligado.
 *   Nunca cai para uma chave global nem para a de outro cliente.
 * - Messages API por HTTP direto (o painel não tem o SDK da Anthropic), no
 *   endereço base do cliente (o cache da Cloudflare, quando existe).
 * - Modelo por variável (`AJUDANTE_MODELO`, padrão claude-sonnet-5) e esforço
 *   (`AJUDANTE_ESFORCO`, padrão low). Sem `temperature`.
 * - Cache: as ferramentas e o texto fixo do sistema ficam em cache por 1 hora
 *   (o dono pergunta espaçado); a data/hora e a tela vão num 2.º bloco DEPOIS do
 *   ponto de cache, para não o partir. Dentro do laço, a última mensagem leva um
 *   ponto de cache de 5 minutos, para as voltas seguintes lerem o que já foi.
 * - No máximo 6 voltas de ferramentas; se o modelo pedir mais, responde com o
 *   que já tem.
 * - `aoUsarFerramenta` avisa a tela ("Vendo a agenda…") enquanto corre.
 */

export const VERSAO_PROMPT = "ajudante_v2";
const VOLTAS = 6;
const TENTATIVAS = 2;

export function modeloDoAjudante() {
  return process.env.AJUDANTE_MODELO?.trim() || "claude-sonnet-5";
}

function esforcoDoAjudante(): "low" | "medium" | "high" {
  const v = process.env.AJUDANTE_ESFORCO?.trim();
  return v === "medium" || v === "high" ? v : "low";
}

/** O texto fixo (vai em cache): só muda se mudar a empresa. */
export function instrucoes(e: Escopo) {
  return [
    `Você é a Lexia, a ajudante do dono do negócio "${e.clienteNome}". Fica sempre ao lado dele no painel e no app do iPhone.`,
    `As datas que você passar às ferramentas são AAAA-MM-DD no fuso ${e.fuso}.`,
    "Como trabalhar:",
    "- Responda na língua em que o dono escreveu. Curto e direto, como uma pessoa de confiança: primeiro a resposta, depois 2-4 pontos se ajudarem. Sem jargão técnico.",
    "- Números SEMPRE das ferramentas. Nunca invente nem arredonde para impressionar. Se a ferramenta não tem o dado, diga que não tem.",
    "- Diga o período de que está a falar (ex.: 'de 1 a 5 de novembro').",
    "- 'Semana' = segunda até hoje; 'mês' = dia 1 até hoje, salvo se o dono disser outra coisa.",
    "- Quando fizer sentido, sugira UMA ação concreta (ex.: responder a quem está à espera há mais tempo).",
    "- Para escrever a um cliente: leia a conversa (ler_conversa) e use propor_mensagem. Você NÃO envia nada: o dono vê a mensagem e confirma. Diga isso numa frase curta.",
    "- Leads atribuídos a campanhas são um mínimo (nem todos os canais dizem de que anúncio a pessoa veio). Não chame a isso 'percentagem de pago'.",
    "- Nunca fale de outras empresas: você só vê esta.",
  ].join("\n");
}

/** O que muda a cada pergunta (fica depois do ponto de cache). */
export function momento(e: Escopo, agora: Date, tela?: string) {
  const hoje = chaveDoDia(agora, e.fuso);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: e.fuso, weekday: "long" }).format(agora);
  return [
    `Hoje é ${diaSemana}, ${hoje}, ${partesNoFuso(agora, e.fuso).hora} no fuso ${e.fuso}.`,
    tela ? `O dono está agora na tela: ${tela}.` : "",
  ].filter(Boolean).join("\n");
}

export type Evento = { tipo: "ferramenta"; nome: string; rotulo: string };
export type Resultado = { ferramentas: string[]; propostas: Proposta[]; texto: string; tokens: { entrada: number; saida: number } };

/** O cliente não tem chave Anthropic ligada: não se chama IA nenhuma. */
export class SemChaveDeIa extends Error {
  constructor() {
    super("sem chave Anthropic do cliente (conexão 'ia')");
  }
}

/** Mensagem para o dono (pt-BR; a rota traduz) a partir do erro. Nunca mostra detalhes técnicos. */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof SemChaveDeIa) return "O assistente ainda não está ligado para esta conta; fale com a Lexia.";
  if (e instanceof ErroDeIa) {
    const m = e.message.toLowerCase();
    if (/credit|balance|billing|cr[eé]dito/.test(m) || e.status === 402) return "O assistente está sem créditos de IA nesta conta; fale com a Lexia.";
    if (e.status === 401 || e.status === 403) return "A chave de IA desta conta não foi aceita; fale com a Lexia.";
    if (e.status === 429) return "O assistente está com muitos pedidos agora. Tente daqui a um minuto.";
    if (e.status >= 500 || e.status === 0) return "O serviço de IA está instável agora. Tente de novo daqui a pouco.";
  }
  return "Não consegui responder agora. Tente de novo.";
}

type BlocoResposta = { type: string; text?: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };
type Mensagem = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };
type RespostaApi = {
  content?: BlocoResposta[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  error?: { message?: string };
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uma chamada à Messages API. Repete uma vez quando a falha é do serviço (429, 5xx, rede). */
async function chamar(ia: ChaveDeIa, corpo: Record<string, unknown>): Promise<RespostaApi> {
  let ultimo: unknown = null;
  for (let t = 1; t <= TENTATIVAS; t++) {
    let r: Response;
    try {
      r = await fetch(`${ia.base}/v1/messages`, {
        body: JSON.stringify(corpo),
        headers: { "anthropic-version": "2023-06-01", "content-type": "application/json", "x-api-key": ia.chave },
        method: "POST",
        signal: AbortSignal.timeout(50_000),
      });
    } catch (e) {
      ultimo = new ErroDeIa(e instanceof Error ? e.message : "rede", 0);
      if (t < TENTATIVAS) await espera(1000 * t);
      continue;
    }
    const j = (await r.json().catch(() => ({}))) as RespostaApi;
    if (r.ok) return j;
    const erro = new ErroDeIa(`HTTP ${r.status}: ${j.error?.message ?? ""}`.trim(), r.status);
    if (r.status !== 429 && r.status < 500) throw erro;
    ultimo = erro;
    if (t < TENTATIVAS) await espera(1000 * t);
  }
  throw ultimo instanceof Error ? ultimo : new ErroDeIa("a IA não respondeu", 0);
}

function argumentos(bruto: unknown): Record<string, unknown> {
  let v = bruto;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Põe o ponto de cache de 5 min no último bloco da última mensagem (e tira-o das anteriores: máximo 4 pontos). */
function marcarCache(mensagens: Mensagem[]) {
  for (const m of mensagens) {
    if (Array.isArray(m.content)) for (const b of m.content) delete b.cache_control;
  }
  const ultima = mensagens[mensagens.length - 1];
  if (!ultima) return;
  if (typeof ultima.content === "string") ultima.content = [{ text: ultima.content, type: "text" }];
  const blocos = ultima.content as Record<string, unknown>[];
  const ultimo = blocos[blocos.length - 1];
  if (ultimo) ultimo.cache_control = { type: "ephemeral" };
}

export async function perguntar(
  escopo: Escopo,
  historico: { papel: "usuario" | "assistente"; conteudo: string }[],
  pergunta: string,
  aoUsarFerramenta: (e: Evento) => void,
  tela?: string,
): Promise<Resultado> {
  // A chave vem SEMPRE da empresa da sessão (escopo montado no servidor).
  const ia = await chaveDoCliente(createAdminClient(), escopo.clienteSlug);
  if (!ia) throw new SemChaveDeIa();

  const modelo = modeloDoAjudante();
  const tools = ferramentasAnthropic();
  const system = [
    { cache_control: { ttl: "1h", type: "ephemeral" }, text: instrucoes(escopo), type: "text" },
    { text: momento(escopo, new Date(), tela), type: "text" },
  ];
  const mensagens: Mensagem[] = [
    ...historico.slice(-12).map((m) => ({ content: m.conteudo, role: m.papel === "usuario" ? ("user" as const) : ("assistant" as const) })),
    { content: pergunta, role: "user" as const },
  ];
  // A API exige que a conversa comece no utilizador e alterne; o histórico pode não o garantir.
  while (mensagens.length > 1 && mensagens[0].role !== "user") mensagens.shift();
  const juntas: Mensagem[] = [];
  for (const m of mensagens) {
    const anterior = juntas[juntas.length - 1];
    if (anterior && anterior.role === m.role && typeof anterior.content === "string" && typeof m.content === "string") anterior.content = `${anterior.content}\n\n${m.content}`;
    else juntas.push({ ...m });
  }

  const pedido = () => {
    marcarCache(juntas);
    return chamar(ia, {
      max_tokens: 8000,
      messages: juntas,
      model: modelo,
      output_config: { effort: esforcoDoAjudante() },
      system,
      tool_choice: { type: "auto" },
      tools,
    });
  };

  const usadas: string[] = [];
  const propostas: Proposta[] = [];
  let entrada = 0;
  let saida = 0;
  const contar = (r: RespostaApi) => {
    const u = r.usage ?? {};
    entrada += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    saida += u.output_tokens ?? 0;
  };
  let resposta = await pedido();
  contar(resposta);

  for (let volta = 0; volta < VOLTAS; volta += 1) {
    if (resposta.stop_reason === "refusal") break;
    const chamadas = (resposta.content ?? []).filter((b) => b.type === "tool_use");
    if (!chamadas.length) break;
    // A resposta volta inteira (com os blocos de raciocínio), como a API pede.
    juntas.push({ content: (resposta.content ?? []) as Record<string, unknown>[], role: "assistant" });
    const resultados: Record<string, unknown>[] = [];
    for (const ch of chamadas) {
      const nome = String(ch.name ?? "");
      const f = Object.hasOwn(FERRAMENTAS, nome) ? FERRAMENTAS[nome] : undefined;
      let saidaFerramenta: unknown;
      let falhou = false;
      if (!f) {
        saidaFerramenta = { erro: "Ferramenta desconhecida." };
        falhou = true;
      } else {
        aoUsarFerramenta({ nome, rotulo: f.rotulo, tipo: "ferramenta" });
        usadas.push(nome);
        try {
          const r = await f.executar(escopo, argumentos(ch.input));
          if (r.proposta) propostas.push(r.proposta);
          saidaFerramenta = r.dados;
        } catch {
          saidaFerramenta = { erro: "Não foi possível ler estes dados agora." };
          falhou = true;
        }
      }
      resultados.push({ content: JSON.stringify(saidaFerramenta ?? null).slice(0, 60_000), tool_use_id: ch.id, type: "tool_result", ...(falhou ? { is_error: true } : {}) });
    }
    // Todos os resultados numa só mensagem (assim o modelo continua a pedir várias de uma vez).
    juntas.push({ content: resultados, role: "user" });
    resposta = await pedido();
    contar(resposta);
  }

  if (resposta.stop_reason === "refusal") throw new ErroDeIa("a IA recusou este pedido", 200);
  const texto =
    (resposta.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim() ||
    (propostas.length ? "Preparei a mensagem abaixo. Confirme para enviar." : "");
  if (!texto) throw new Error("sem resposta");
  return { ferramentas: usadas, propostas, texto, tokens: { entrada, saida } };
}

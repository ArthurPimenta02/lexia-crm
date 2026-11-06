import "server-only";

import type { ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";

import { getAjudanteOpenAIClient } from "@/lib/analyst/openai";
import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";

import { FERRAMENTAS, ferramentasOpenAI, type Escopo, type Proposta } from "./ferramentas";

/**
 * O motor do Analista Lexia: pergunta → modelo → ferramentas → resposta.
 *
 * - Modelo e esforço por variável (`OPENAI_AJUDANTE_MODEL`, padrão gpt-5.5;
 *   `OPENAI_AJUDANTE_ESFORCO`, padrão low): rápido e bom o suficiente para
 *   consultar dados e escrever.
 * - `store: false`: a OpenAI não guarda a conversa; o raciocínio volta cifrado.
 * - No máximo 6 voltas de ferramentas; se o modelo pedir mais, responde com o
 *   que já tem.
 * - `aoUsarFerramenta` avisa a tela ("Vendo a agenda…") enquanto corre.
 */

export const VERSAO_PROMPT = "ajudante_v1";
const VOLTAS = 6;

export function modeloDoAjudante() {
  return process.env.OPENAI_AJUDANTE_MODEL?.trim() || "gpt-5.5";
}

export function instrucoes(e: Escopo, agora: Date, tela?: string) {
  const hoje = chaveDoDia(agora, e.fuso);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: e.fuso, weekday: "long" }).format(agora);
  return [
    `Você é a Lexia, a ajudante do dono do negócio "${e.clienteNome}". Fica sempre ao lado dele no painel e no app do iPhone.`,
    `Hoje é ${diaSemana}, ${hoje}, ${partesNoFuso(agora, e.fuso).hora} no fuso ${e.fuso}. Datas que você passar às ferramentas são AAAA-MM-DD nesse fuso.`,
    "Como trabalhar:",
    "- Responda na língua em que o dono escreveu. Curto e direto, como uma pessoa de confiança: primeiro a resposta, depois 2-4 pontos se ajudarem. Sem jargão técnico.",
    "- Números SEMPRE das ferramentas. Nunca invente nem arredonde para impressionar. Se a ferramenta não tem o dado, diga que não tem.",
    "- Diga o período de que está a falar (ex.: 'de 1 a 5 de novembro').",
    "- 'Semana' = segunda até hoje; 'mês' = dia 1 até hoje, salvo se o dono disser outra coisa.",
    "- Quando fizer sentido, sugira UMA ação concreta (ex.: responder a quem está à espera há mais tempo).",
    "- Para escrever a um cliente: leia a conversa (ler_conversa) e use propor_mensagem. Você NÃO envia nada: o dono vê a mensagem e confirma. Diga isso numa frase curta.",
    "- Leads atribuídos a campanhas são um mínimo (nem todos os canais dizem de que anúncio a pessoa veio). Não chame a isso 'percentagem de pago'.",
    "- Nunca fale de outras empresas: você só vê esta.",
    tela ? `O dono está agora na tela: ${tela}.` : "",
  ].filter(Boolean).join("\n");
}

export type Evento = { tipo: "ferramenta"; nome: string; rotulo: string };
export type Resultado = { ferramentas: string[]; propostas: Proposta[]; texto: string; tokens: { entrada: number; saida: number } };

function argumentos(bruto: string): Record<string, unknown> {
  try {
    const v = JSON.parse(bruto) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function perguntar(
  escopo: Escopo,
  historico: { papel: "usuario" | "assistente"; conteudo: string }[],
  pergunta: string,
  aoUsarFerramenta: (e: Evento) => void,
  tela?: string,
): Promise<Resultado> {
  const openai = getAjudanteOpenAIClient();
  const modelo = modeloDoAjudante();
  const esforco = (process.env.OPENAI_AJUDANTE_ESFORCO?.trim() || "low") as "low" | "medium" | "high";
  const tools = ferramentasOpenAI();
  const input: ResponseInputItem[] = [
    ...historico.slice(-12).map((m) => ({ content: m.conteudo, role: m.papel === "usuario" ? ("user" as const) : ("assistant" as const) })),
    { content: pergunta, role: "user" as const },
  ];
  const pedido = () =>
    openai.responses.create({
      include: ["reasoning.encrypted_content"],
      input,
      instructions: instrucoes(escopo, new Date(), tela),
      max_output_tokens: 4000,
      model: modelo,
      parallel_tool_calls: true,
      reasoning: { effort: esforco },
      store: false,
      tool_choice: "auto",
      tools,
    });

  const usadas: string[] = [];
  const propostas: Proposta[] = [];
  let entrada = 0;
  let saida = 0;
  let resposta = await pedido();
  entrada += resposta.usage?.input_tokens ?? 0;
  saida += resposta.usage?.output_tokens ?? 0;

  for (let volta = 0; volta < VOLTAS; volta += 1) {
    const chamadas = resposta.output.filter((x): x is ResponseFunctionToolCall => x.type === "function_call");
    if (!chamadas.length) break;
    input.push(...(resposta.output as ResponseInputItem[]));
    for (const ch of chamadas) {
      const f = FERRAMENTAS[ch.name];
      let saidaFerramenta: unknown;
      if (!f) {
        saidaFerramenta = { erro: "Ferramenta desconhecida." };
      } else {
        aoUsarFerramenta({ nome: ch.name, rotulo: f.rotulo, tipo: "ferramenta" });
        usadas.push(ch.name);
        try {
          const r = await f.executar(escopo, argumentos(ch.arguments));
          if (r.proposta) propostas.push(r.proposta);
          saidaFerramenta = r.dados;
        } catch {
          saidaFerramenta = { erro: "Não foi possível ler estes dados agora." };
        }
      }
      input.push({ call_id: ch.call_id, output: JSON.stringify(saidaFerramenta).slice(0, 60_000), type: "function_call_output" });
    }
    resposta = await pedido();
    entrada += resposta.usage?.input_tokens ?? 0;
    saida += resposta.usage?.output_tokens ?? 0;
  }

  const texto = resposta.output_text?.trim() || (propostas.length ? "Preparei a mensagem abaixo. Confirme para enviar." : "");
  if (!texto) throw new Error("sem resposta");
  return { ferramentas: usadas, propostas, texto, tokens: { entrada, saida } };
}

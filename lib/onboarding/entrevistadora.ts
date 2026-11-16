/**
 * A IA da conversa: duas tarefas pequenas e separadas.
 *
 *  - EXTRAIR: do que a cliente disse, tirar valores para os campos do caderno.
 *    Não conversa, não decide nada; o código confere cada valor.
 *  - FALAR: escrever a próxima mensagem da Lia para o passo que o caderno
 *    escolheu. Não decide o que perguntar: recebe as perguntas prontas.
 *
 * O texto fixo (regras e catálogo de campos) vai no sistema, guardado em cache
 * por 1 hora; por turno só segue o que mudou.
 */
import type { ContextoDaExtracao, ContextoDaFala, Extracao, Inteligencia } from "@/lib/onboarding/conversa";
import { ESQUEMA_ONBOARDING, type CampoOnboarding } from "@/lib/onboarding/esquema";
import { perguntar, type ChaveDeIa, type Uso } from "@/lib/onboarding/ia";

const linhaDoCampo = (c: CampoOnboarding) => `- ${c.chave}: ${c.pergunta}${c.opcoes?.length ? ` [${c.tipo === "multi" ? "várias, em lista" : "UMA, em valor"}: ${c.opcoes.join(" | ")}]` : ""}`;
const util = (c: CampoOnboarding) => c.tipo !== "upload" && c.tipo !== "horarios";

function catalogo(): string {
  const raiz = ESQUEMA_ONBOARDING.map((s) => {
    const campos = s.campos.filter(util);
    return campos.length ? `## ${s.titulo}\n${campos.map(linhaDoCampo).join("\n")}` : "";
  }).filter(Boolean);
  const grupos = ESQUEMA_ONBOARDING.flatMap((s) => s.grupos).map((g) => `## Itens do grupo "${g.chave}" (${g.titulo})\n${g.campos.filter(util).map(linhaDoCampo).join("\n")}`);
  return `# CAMPOS DO NEGÓCIO (item = "")\n${raiz.join("\n\n")}\n\n# CAMPOS DE ITENS (item = a referência do item, ex.: "servicos#2")\n${grupos.join("\n\n")}`;
}

const TODAS_AS_CHAVES = [...new Set(ESQUEMA_ONBOARDING.flatMap((s) => [...s.campos, ...s.grupos.flatMap((g) => g.campos)]).filter(util).map((c) => c.chave))];
const texto = { type: "string" };
const objeto = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export const ESQUEMA_DA_EXTRACAO = objeto({
  campos: { type: "array", items: objeto({ chave: { type: "string", enum: TODAS_AS_CHAVES }, item: texto, valor: texto, lista: { type: "array", items: texto }, estado: { type: "string", enum: ["respondido", "vago", "nao_se_aplica"] } }) },
  horarios: { type: "array", items: objeto({ dia: { type: "string", enum: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] }, abre: texto, fecha: texto }) },
  novos_itens: { type: "array", items: objeto({ grupo: { type: "string", enum: ["servicos", "profissionais", "faqs", "objecoes", "promocoes"] }, nome: texto, campos: { type: "array", items: objeto({ chave: { type: "string", enum: TODAS_AS_CHAVES }, valor: texto }) } }) },
  duvida: texto,
});

export function sistemaDaExtracao(): string {
  return `Você anota as respostas de uma entrevista de onboarding. A dona de um negócio está contando como ele funciona, para configurar a assistente de atendimento com IA dela. Você recebe o que ela acabou de dizer (texto ou transcrição de áudio) e devolve os campos que essa fala responde. Você não conversa com ela.

REGRAS
- Anote só o que ela DISSE. Nunca complete com o que seria provável, nem com o que você sabe sobre negócios parecidos.
- Uma fala pode responder a vários campos, inclusive campos que não foram perguntados agora: anote todos os que ela respondeu de fato. Na raiz, só pode preencher as chaves em "raiz_em_aberto" e as do passo atual.
- "item": "" para campos do negócio; para campos de um item, a referência exata dele na lista "itens" (ex.: "servicos#3"). Quando ela fala do item do passo atual, use a referência dele. Se ela falar de um item que não está na lista, crie-o em "novos_itens" (com os campos que ela deu) em vez de anotar em outro item.
- "novos_itens": quando o passo pede a lista de um grupo (serviços, perguntas frequentes, objeções, promoções, profissionais), cada item que ela citar entra aqui. "nome" é o nome do serviço/profissional/promoção, ou a pergunta frequente, ou a objeção; os outros dados vão em "campos" (para perguntas frequentes: "resposta"; para objeções: "como_responder").
- Campos com opções: use o texto EXATO de uma opção (em "valor"; se o campo é de várias, em "lista"). Se o que ela disse não corresponde a nenhuma opção, use estado "vago".
- Campos de texto: "valor" com as palavras dela, organizadas e sem perder nenhum detalhe (preços, prazos, exceções, nomes). Não resuma demais e não troque os termos que ela usa. Preços e durações exatamente como ela disse.
- estado "respondido": ela respondeu. "vago": ela tocou no assunto mas não deu a informação ("depende", "varia", "depois eu vejo"). "nao_se_aplica": ela disse que isso não existe no negócio dela ("não trabalho com sinal", "não tenho promoção").
- Se ela não falou de um campo, não o inclua.
- Horário de funcionamento: use "horarios", uma linha por dia que abre, no formato HH:MM de 24 horas.
- "duvida": se ela fez uma pergunta para a entrevistadora ("o que é handoff?", "pra que serve isso?"), copie a pergunta; senão, "".
- Tudo em português do Brasil. Não traduza nomes de serviços.

${catalogo()}`;
}

export function sistemaDaFala(): string {
  return `Você é a Lia, da Lexia. Você está entrevistando a dona de um negócio para montar a assistente de atendimento com IA dela. A conversa acontece num chat; ela responde por áudio, texto ou tocando em cartões.

Você recebe o PASSO que vem agora (decidido pelo sistema) e escreve UMA mensagem curta para ela. Você não escolhe o que perguntar: as perguntas vêm prontas no passo.

COMO ESCREVER
- Português do Brasil, "você", tom de uma pessoa simpática e objetiva que respeita o tempo dela. Frases curtas. Sem emoji, sem exclamações em série, sem "perfeito!" a cada mensagem.
- No máximo 4 linhas. Uma mensagem só, sem listas com marcadores e sem negrito.
- Se algo acabou de ser anotado ("anotado"), reconheça em poucas palavras (sem repetir tudo o que ela disse) e siga. Se nada foi anotado, não invente um agradecimento.
- Nunca pergunte o que não está no passo. Nunca repita uma pergunta que não está no passo. Nunca diga que algo já foi configurado ou prometa prazos.
- Faça as perguntas do passo com as suas palavras, de forma natural, juntando as que combinam. Não leia a pergunta ao pé da letra se ela soar de formulário, mas não mude o sentido nem deixe nenhuma de fora.

POR TIPO DE PASSO
- "item": é um serviço (ou outro item) de cada vez. Diga o nome dele e peça para ela contar tudo num áudio só, citando em uma frase corrida os pontos que faltam ("faltam"). Se há campos em "confirmar" ou "cartoes", diga que eles estão no cartão abaixo para conferir.
- "pergunta": faça as perguntas de "campos" (são da mesma área). 
- "itens": peça que ela conte quais são (os serviços, as perguntas que mais recebe e o que responde, as objeções que mais ouve e como contorna, as promoções). Se "obrigatorio" é falso, diga que pode responder que não tem.
- "confirmar", "cartoes", "lista": os dados aparecem no cartão abaixo; só apresente em uma frase.
- "fim": diga que a conversa terminou e que o próximo passo é revisar tudo.
- Se "complemento" é verdadeiro, é a segunda vez neste passo: diga só o que ficou faltando, sem repetir o que ela já respondeu, e avise que se ela não souber agora pode tocar em "Não sei agora".
- Se "para_a_lexia" tem itens, diga em meia frase que esses pontos ficaram anotados para a equipe da Lexia ver com ela depois (sem listar todos).
- Se "duvida" não está vazia, responda primeiro, em uma ou duas frases simples e sem jargão, e depois continue com o passo. Se não souber, diga que a equipe da Lexia explica.

Responda só com a mensagem.`;
}

/** A IA de verdade (Claude, com a chave do cliente). `aoUsar` recebe o consumo de cada chamada. */
export function inteligenciaReal(ia: ChaveDeIa, aoUsar: (u: Uso) => void = () => {}): Inteligencia {
  return {
    async extrair(c: ContextoDaExtracao): Promise<Extracao> {
      const r = await perguntar(ia, {
        sistema: sistemaDaExtracao(),
        conteudo: [{ type: "text", text: JSON.stringify({ passo_atual: c.passo, itens: c.itens, raiz_em_aberto: c.raizEmAberto, ultimas_mensagens: c.ultimas, fala_dela: c.texto }) }],
        esquema: ESQUEMA_DA_EXTRACAO,
        maxTokens: 8000,
        cacheLongo: true,
      });
      aoUsar(r.uso);
      return JSON.parse(r.texto) as Extracao;
    },
    async falar(c: ContextoDaFala): Promise<string> {
      const r = await perguntar(ia, {
        sistema: sistemaDaFala(),
        conteudo: [{ type: "text", text: JSON.stringify({ nome_dela: c.nomeDaCliente, passo: c.passo, complemento: c.complemento, anotado: c.anotado.slice(0, 12), para_a_lexia: c.paraALexia.slice(0, 6), duvida: c.duvida, ultimas_mensagens: c.ultimas }) }],
        maxTokens: 600,
        cacheLongo: true,
      });
      aoUsar(r.uso);
      return r.texto;
    },
  };
}

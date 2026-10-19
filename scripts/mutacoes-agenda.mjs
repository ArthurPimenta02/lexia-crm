/**
 * Prova que os testes de marcar na agenda servem para alguma coisa.
 *
 * Um teste só conta se uma mutação o fizer falhar. Isto estraga uma coisa de
 * cada vez no código a sério, corre os testes, e espera ver vermelho. Se algum
 * teste ficar verde com o código estragado, o teste é decoração.
 *
 * Não faz parte do `npm test` — é para se correr à mão quando se mexe nestes
 * ficheiros. Deixa tudo como estava, mesmo quando falha a meio.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const MARCAR = "lib/agenda/marcar.ts";
const ACCOES = "app/app/agenda/actions.ts";
const CONFIG = "lib/servicos/config.ts";
const FUSO = "lib/clientes/timezone.ts";
const LEITURA = "lib/servicos/read.ts";
const PAINEL = "app/components/servicos-panel.tsx";
const ETAPAS = "lib/pipeline/etapas.ts";
const QUADRO = "app/components/pipeline-panel.tsx";
const LEITURA_PIPELINE = "lib/pipeline/read.ts";

const TESTE_ESCRITA = "tests/marcar-na-agenda.test.mts";
const TESTE_ACCAO = "tests/marcar-pela-agenda-accao.test.mts";
const TESTE_MIRANDA = "tests/agenda-da-miranda.test.mts";
const TESTE_SERVICOS = "tests/servicos-da-miranda.test.mts";
const TESTE_PIPELINE = "tests/pipeline-etapas.test.mts";
const TESTE_ORDEM = "tests/pipeline-ordem-agendado.test.mts";

/** @type {{ de: string, ficheiro: string, nome: string, para: string, teste: string }[]} */
const mutacoes = [
  {
    de: `    .eq("cliente_slug", clienteSlug)
    .eq("id", contactoId)`,
    ficheiro: MARCAR,
    nome: "a ficha lê-se sem o filtro da empresa",
    para: `    .eq("id", contactoId)`,
    teste: TESTE_ESCRITA,
  },
  {
    de: `    (linha) => linha.id === servicoId,
  );`,
    ficheiro: MARCAR,
    nome: "o serviço escolhido é o primeiro do catálogo, seja ele qual for",
    para: `    () => true,
  );`,
    teste: TESTE_ESCRITA,
  },
  {
    de: "  if (!pareceTelefone(telefone)) {",
    ficheiro: MARCAR,
    nome: "um PSID da Meta passa por telefone",
    para: "  if (false) {",
    teste: TESTE_ESCRITA,
  },
  {
    de: "      : Math.round(Number(duracaoBruto));",
    ficheiro: MARCAR,
    nome: "a duração escrita à mão é ignorada",
    para: "      : executor.duracaoMinutos;",
    teste: TESTE_ESCRITA,
  },
  {
    de: `      origem: "painel",`,
    ficheiro: MARCAR,
    nome: "o espelho fica como escrita à mão em vez de painel",
    para: `      origem: "manual",`,
    teste: TESTE_ESCRITA,
  },
  {
    de: `  if (corpo?.status === "CONFLITO") {`,
    ficheiro: MARCAR,
    nome: "o choque de horários deixa de ser reconhecido",
    para: `  if (corpo?.status === "CHOQUE") {`,
    teste: TESTE_ESCRITA,
  },
  {
    de: `  if (corpo?.status !== "CRIADO" || !corpo.event_id || !corpo.calendario_id) {`,
    ficheiro: MARCAR,
    nome: "uma resposta sem event_id passa por marcação feita",
    para: `  if (corpo?.status !== "CRIADO") {`,
    teste: TESTE_ESCRITA,
  },
  {
    de: "  if (!url || !segredo || segredo.length < 32) {",
    ficheiro: MARCAR,
    nome: "um segredo curto serve para abrir a porta da agenda",
    para: "  if (!url) {",
    teste: TESTE_ESCRITA,
  },
  {
    de: `      redirect: "error",`,
    ficheiro: MARCAR,
    nome: "a chamada assinada segue redirecções",
    para: `      redirect: "follow",`,
    teste: TESTE_ESCRITA,
  },
  {
    de: `    console.error("[agenda] a marcação entrou mas o espelho falhou", error);`,
    ficheiro: MARCAR,
    nome: "o espelho falhado desfaz a marcação aos olhos do dono",
    para: `    return { conflitos: [], erro: "falhou", linkGoogle: null, ok: false };`,
    teste: TESTE_ESCRITA,
  },
  {
    de: `  if (voltaAtras.replace("24:", "00:") !== \`\${hora.trim()}\`) {`,
    ficheiro: FUSO,
    nome: "uma hora que não existe no fuso aterra onde calhar",
    para: "  if (false) {",
    teste: TESTE_ESCRITA,
  },
  {
    de: "  if (avisos.length > 0 && !confirmado) {",
    ficheiro: ACCOES,
    nome: "os avisos deixam de travar a escrita",
    para: "  if (false) {",
    teste: TESTE_ACCAO,
  },
  {
    de: `    ignorarConflito: texto("ignorar_conflito") === "sim",`,
    ficheiro: ACCOES,
    nome: "confirmar o aviso passa a autorizar marcar por cima",
    para: `    ignorarConflito: confirmado,`,
    teste: TESTE_ACCAO,
  },
  {
    de: `    profile.role !== "cliente_admin"`,
    ficheiro: ACCOES,
    nome: "qualquer utilizador do cliente pode marcar",
    para: "    false",
    teste: TESTE_ACCAO,
  },
  {
    de: "  const perfil = await perfilDoCliente();",
    ficheiro: ACCOES,
    nome: "o slug vem do formulário em vez do perfil",
    para: `  const perfil = { clienteSlug: String(formData.get("cliente_slug") ?? "") };`,
    teste: TESTE_ACCAO,
  },
  {
    de: `  revalidatePath(caminho);`,
    ficheiro: ACCOES,
    nome: "a página da agenda não é refrescada",
    para: "",
    teste: TESTE_ACCAO,
  },
  {
    de: `    activoColumn: "ativo",
    catalogo: {`,
    ficheiro: CONFIG,
    nome: "a Miranda é filtrada pela coluna do activo do Detail",
    para: `    activoColumn: "activo",
    catalogo: {`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `    precoColumn: "preco",
    tabela: "servicos_miranda",`,
    ficheiro: CONFIG,
    nome: "o preço dela é lido da coluna de preço do Detail",
    para: `    precoColumn: "preco_base",
    tabela: "servicos_miranda",`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `        { chave: "Samuel", nome: "Samuel", valor: "Samuel" },`,
    ficheiro: CONFIG,
    nome: "a chave do Samuel passa a minúsculas, como no Detail",
    para: `        { chave: "samuel", nome: "Samuel", valor: "Samuel" },`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `      coluna: "profissional",
      duracaoColumn: "duracao_agenda_min",`,
    ficheiro: CONFIG,
    nome: "a duração dela é lida de outra coluna qualquer",
    para: `      coluna: "profissional",
      duracaoColumn: "duracao_minutos",`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `    clientConfigs[clienteSlug]?.moeda ??
    agendaveisConfigs[clienteSlug]?.moeda ??
    null`,
    ficheiro: CONFIG,
    nome: "a moeda de quem não vende serviços no painel vira euros",
    para: `    clientConfigs[clienteSlug]?.moeda ?? "EUR"`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `  const executor = executores.lista.find(
    (candidato) => candidato.valor.toLowerCase() === escrito,
  );

  if (!executor) {
    return [];
  }`,
    ficheiro: LEITURA,
    nome: "um profissional fora da lista passa a executor tal como está escrito",
    para: `  const executor = executores.lista.find(
    (candidato) => candidato.valor.toLowerCase() === escrito,
  ) ?? { chave: escrito, nome: escrito, valor: escrito };`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `      precoBase: toNumber(
        linha[config.precoColumn] as number | string | null,
      ),`,
    ficheiro: LEITURA,
    nome: "um serviço sem preço de tabela é escondido de quem o vende",
    para: `      precoBase:
        toNumber(linha[config.precoColumn] as number | string | null) ?? 0,`,
    teste: TESTE_MIRANDA,
  },
  {
    de: `    Samuel: (dia) => (dia >= 1 && dia <= 6 ? [9, 22] : null),`,
    ficheiro: MARCAR,
    nome: "o horário dela volta às 10h–20h que ela declara",
    para: `    Samuel: (dia) => (dia >= 1 && dia <= 6 ? [10, 20] : null),`,
    teste: TESTE_MIRANDA,
  },
  {
    de: "  const horario = horarioPorCliente[clienteSlug]?.[executor.chave] ?? null;",
    ficheiro: MARCAR,
    nome: "o horário é sempre o do Detail, seja qual for a empresa",
    para:
      "  const horario = horarioPorCliente.detail_by_cordeiro?.[executor.chave] ?? null;",
    teste: TESTE_MIRANDA,
  },

  // A aba Serviços de quem só tem a tabela de agendamento.
  {
    de: `  if (!config?.catalogo) {
    return null;
  }`,
    ficheiro: LEITURA,
    nome: "a aba dela volta a dizer que não tem catálogo ligado",
    para: `  if (true) {
    return null;
  }`,
    teste: TESTE_SERVICOS,
  },
  {
    // Há dois `.eq(config.activoColumn, …)` no ficheiro; o `.replace` acerta
    // no primeiro, que é o desta aba. O `.select(colunas)` desempata.
    de: `    .select(colunas)
    .eq(config.activoColumn, true);`,
    ficheiro: LEITURA,
    nome: "a aba dela filtra pela coluna `activo` do Detail",
    para: `    .select(colunas)
    .eq("activo", true);`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `    executorPrincipal: listaDeExecutores(config)[0]?.chave ?? null,
    moeda: config.moeda,
    servicos,
    somenteLeitura: true,`,
    ficheiro: LEITURA,
    nome: "a aba dela deixa gravar por cima de colunas que não existem",
    para: `    executorPrincipal: listaDeExecutores(config)[0]?.chave ?? null,
    moeda: config.moeda,
    servicos,
    somenteLeitura: false,`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `    servicos: [],
    somenteLeitura: false,`,
    ficheiro: LEITURA,
    nome: "um painel vazio tranca os botões de todos os clientes",
    para: `    servicos: [],
    somenteLeitura: true,`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `      custoProduto: null,
      custoProdutoIncompleto: false,`,
    ficheiro: LEITURA,
    nome: "o custo de produto dela aparece como zero em vez de vazio",
    para: `      custoProduto: 0,
      custoProdutoIncompleto: false,`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `    const executores = listaDeExecutores(config).map<ExecutorLinha>(`,
    ficheiro: LEITURA,
    nome: "quem não faz o serviço desaparece do cartão",
    para: `    const executores = agendaveis.map<ExecutorLinha>(`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `          euroPorHora:
            preco !== null && horas !== null && horas > 0
              ? arredondar(preco / horas)
              : null,`,
    ficheiro: LEITURA,
    nome: "quem não faz o serviço aparece a render zero por hora",
    para: `          euroPorHora:
            preco !== null && horas !== null && horas > 0
              ? arredondar(preco / horas)
              : 0,`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `      ordemColumn: "prioridade_recomendacao",`,
    ficheiro: CONFIG,
    nome: "a ordem dela passa a ser a alfabética e não a que ela definiu",
    para: `      ordemColumn: null,`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `  const temEscaloes = painel.escaloes.length > 0;`,
    ficheiro: PAINEL,
    nome: "a caixa do escalão de viatura volta a quem não tem viaturas",
    para: `  const temEscaloes = true;`,
    teste: TESTE_SERVICOS,
  },
  {
    de: `                      dica={
                        temEscaloes
                          ? "Não variam com a viatura. A margem é calculada sobre o preço base."
                          : "A margem é calculada sobre o preço base."
                      }`,
    ficheiro: PAINEL,
    nome: "a dica dos outros preços volta a falar de viaturas",
    para: `                      dica={
                        "Não variam com a viatura. A margem é calculada sobre o preço base."
                      }`,
    teste: TESTE_SERVICOS,
  },
  {
    de: "  if (factos.marcacaoFutura) {",
    ficheiro: ETAPAS,
    nome: "a ordem antiga volta: quem escreveu hoje sai da coluna Agendado",
    para: "  if (factos.marcacaoFutura && !porResponder) {",
    teste: TESTE_PIPELINE,
  },
  {
    de: "  const porResponder = factos.ultimaFoiRecebida && dias <= DIAS_ACTIVO;",
    ficheiro: ETAPAS,
    nome: "o aviso de resposta nunca acende",
    para: "  const porResponder = false;",
    teste: TESTE_PIPELINE,
  },
  {
    de: `      porque: "A conversa está viva.",
      porResponder: false,`,
    ficheiro: ETAPAS,
    nome: "o aviso de resposta acende numa coluna onde não há ninguém à espera",
    para: `      porque: "A conversa está viva.",
      porResponder: true,`,
    teste: TESTE_PIPELINE,
  },
  {
    de: `      porque: porResponder
        ? \`Tem uma marcação por acontecer. \${semResposta}\`
        : "Tem uma marcação por acontecer.",`,
    ficheiro: ETAPAS,
    nome: "o cartão agendado deixa de dizer que ninguém respondeu",
    para: `      porque: "Tem uma marcação por acontecer.",`,
    teste: TESTE_PIPELINE,
  },
  {
    de: "  const porResponder = factos.ultimaFoiRecebida && dias <= DIAS_ACTIVO;",
    ficheiro: ETAPAS,
    nome: "o aviso fica aceso para sempre, sem o limite dos 7 dias",
    para: "  const porResponder = factos.ultimaFoiRecebida;",
    teste: TESTE_PIPELINE,
  },
  {
    de: `        {cartao.porResponder && cartao.etapa !== "por_responder" ? (`,
    ficheiro: QUADRO,
    nome: "a etiqueta vermelha desaparece do cartão",
    para: "        {false ? (",
    teste: TESTE_PIPELINE,
  },
  {
    de: `        {cartao.porResponder && cartao.etapa !== "por_responder" ? (`,
    ficheiro: QUADRO,
    nome: "a etiqueta aparece em todos os cartões, esperem resposta ou não",
    para: `        {cartao.etapa !== "por_responder" ? (`,
    teste: TESTE_PIPELINE,
  },
  {
    de: `        {cartao.porResponder && cartao.etapa !== "por_responder" ? (`,
    ficheiro: QUADRO,
    nome: "a etiqueta repete-se dentro da coluna que já a tem no título",
    para: "        {cartao.porResponder ? (",
    teste: TESTE_PIPELINE,
  },
  {
    de: `          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">`,
    ficheiro: QUADRO,
    nome: "o aviso deixa de ser vermelho e passa a parecer uma etiqueta da IA",
    para: `          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">`,
    teste: TESTE_PIPELINE,
  },
  {
    de: `      if (a.porResponder !== b.porResponder) {
        return a.porResponder ? -1 : 1;
      }`,
    ficheiro: LEITURA_PIPELINE,
    nome: "quem espera resposta deixa de subir ao topo da coluna Agendado",
    para: "",
    teste: TESTE_ORDEM,
  },
  {
    de: `        return a.porResponder ? -1 : 1;`,
    ficheiro: LEITURA_PIPELINE,
    nome: "quem espera resposta desce para o fundo da coluna Agendado",
    para: `        return a.porResponder ? 1 : -1;`,
    teste: TESTE_ORDEM,
  },
];

function correr(teste) {
  try {
    execFileSync(
      "npx",
      ["tsx", "--test", "--experimental-test-module-mocks", teste],
      { encoding: "utf8", stdio: "pipe" },
    );

    return true;
  } catch {
    return false;
  }
}

console.log("Antes de estragar nada:");

for (const teste of [
  TESTE_ESCRITA,
  TESTE_ACCAO,
  TESTE_MIRANDA,
  TESTE_SERVICOS,
  TESTE_PIPELINE,
  TESTE_ORDEM,
]) {
  console.log(`  ${correr(teste) ? "verde" : "VERMELHO"}  ${teste}`);
}

let sobreviventes = 0;

for (const mutacao of mutacoes) {
  const original = readFileSync(mutacao.ficheiro, "utf8");

  if (!original.includes(mutacao.de)) {
    console.log(`?  ${mutacao.nome} — o trecho mudou, a mutação não se aplicou`);
    sobreviventes += 1;
    continue;
  }

  writeFileSync(
    mutacao.ficheiro,
    original.replace(mutacao.de, mutacao.para),
    "utf8",
  );

  const passou = correr(mutacao.teste);

  writeFileSync(mutacao.ficheiro, original, "utf8");

  if (passou) {
    sobreviventes += 1;
    console.log(`SOBREVIVEU  ${mutacao.nome}`);
  } else {
    console.log(`apanhada    ${mutacao.nome}`);
  }
}

console.log(
  sobreviventes === 0
    ? `\nAs ${mutacoes.length} mutações foram todas apanhadas.`
    : `\n${sobreviventes} de ${mutacoes.length} passaram sem ninguém reparar.`,
);

process.exit(sobreviventes === 0 ? 0 : 1);

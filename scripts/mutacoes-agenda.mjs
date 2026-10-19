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

const TESTE_ESCRITA = "tests/marcar-na-agenda.test.mts";
const TESTE_ACCAO = "tests/marcar-pela-agenda-accao.test.mts";
const TESTE_MIRANDA = "tests/agenda-da-miranda.test.mts";

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
    envPrefix: "MIRANDA",`,
    ficheiro: CONFIG,
    nome: "a Miranda é filtrada pela coluna do activo do Detail",
    para: `    activoColumn: "activo",
    envPrefix: "MIRANDA",`,
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

for (const teste of [TESTE_ESCRITA, TESTE_ACCAO, TESTE_MIRANDA]) {
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

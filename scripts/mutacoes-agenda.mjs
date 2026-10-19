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
const CSV = "lib/exportar/csv.ts";
const COLUNAS = "lib/exportar/colunas.ts";
const CLIENTES = "app/components/clientes-panel.tsx";
const AVISOS = "lib/avisos/read.ts";
const AVISOS_ESCRITA = "lib/avisos/write.ts";
const AVISOS_ROTA = "app/api/avisos/route.ts";
const MOLDURA = "app/components/app-sidebar.tsx";
const SINO = "app/components/sino-avisos.tsx";
const DICA = "app/components/dica.tsx";

const TESTE_ESCRITA = "tests/marcar-na-agenda.test.mts";
const TESTE_ACCAO = "tests/marcar-pela-agenda-accao.test.mts";
const TESTE_MIRANDA = "tests/agenda-da-miranda.test.mts";
const TESTE_SERVICOS = "tests/servicos-da-miranda.test.mts";
const TESTE_PIPELINE = "tests/pipeline-etapas.test.mts";
const TESTE_ORDEM = "tests/pipeline-ordem-agendado.test.mts";
const TESTE_EXPORTAR = "tests/exportar-csv.test.mts";
const TESTE_AVISOS = "tests/avisos-sino.test.mts";

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

  // --- A exportação ------------------------------------------------------
  {
    de: `const SEPARADOR = ";";`,
    ficheiro: CSV,
    nome: "o separador volta a ser a vírgula e o Excel em pt junta tudo numa coluna",
    para: `const SEPARADOR = ",";`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `const BOM = "\\uFEFF";`,
    ficheiro: CSV,
    nome: "o ficheiro sai sem BOM e os acentos aparecem trocados no Windows",
    para: `const BOM = "";`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `  return /^[=+\\-@\\t\\r]/.test(texto) ? \`'\${texto}\` : texto;`,
    ficheiro: CSV,
    nome: "uma fórmula escrita no nome do perfil passa intacta para o Excel",
    para: `  return texto;`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    return \`"\${String(valor).replace(".", ",")}"\`;`,
    ficheiro: CSV,
    nome: "os decimais saem com ponto e as somas da folha dão zero",
    para: `    return \`"\${String(valor)}"\`;`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `  return \`"\${desarmarFormula(valor).replace(/"/g, '""')}"\`;`,
    ficheiro: CSV,
    nome: "as aspas de dentro não se duplicam e a linha parte-se a meio",
    para: `  return \`"\${desarmarFormula(valor)}"\`;`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    return valor ? '"Sim"' : '"Não"';`,
    ficheiro: CSV,
    nome: "o sim e o não saem em inglês de programador",
    para: `    return \`"\${valor}"\`;`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `  return BOM + [cabecalho, ...corpo].join("\\r\\n") + "\\r\\n";`,
    ficheiro: CSV,
    nome: "as linhas acabam em \\n e algumas versões do Excel juntam tudo",
    para: `  return BOM + [cabecalho, ...corpo].join("\\n") + "\\n";`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    timeZone: fuso,`,
    ficheiro: CSV,
    nome: "a data sai no fuso da máquina e não no do cliente",
    para: `    timeZone: "UTC",`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `      cabecalho: moeda ? \`Valor (\${moeda})\` : "Valor",`,
    ficheiro: COLUNAS,
    nome: "sem moeda, o cabeçalho da agenda promete uma unidade chamada null",
    para: `      cabecalho: \`Valor (\${moeda})\`,`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `      valor: (c) => (c.ultimaMensagemEm ? c.dias : null),`,
    ficheiro: COLUNAS,
    nome: "quem nunca falou leva 9 mil bilhões de dias e estraga a média",
    para: `      valor: (c) => c.dias,`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    ...(mostrarViatura
      ? [{ cabecalho: "Carro", valor: (c: ClienteLinha) => c.viatura }]
      : []),`,
    ficheiro: COLUNAS,
    nome: "a coluna do carro aparece também na Miranda, sempre vazia",
    para: `    { cabecalho: "Carro", valor: (c: ClienteLinha) => c.viatura },`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    { cabecalho: "Origem (anotada)", valor: (c) => c.origemManual },`,
    ficheiro: COLUNAS,
    nome: "as duas origens juntam-se numa e apaga-se a diferença entre facto e memória",
    para: ``,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    { cabecalho: "À espera de resposta", valor: (c) => c.porResponder },`,
    ficheiro: COLUNAS,
    nome: "o aviso vermelho não viaja para o ficheiro",
    para: ``,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `    { cabecalho: "Coluna", valor: (c) => ETAPA_ROTULO[c.etapa] },`,
    ficheiro: COLUNAS,
    nome: "a coluna sai com a chave da base em vez do rótulo do ecrã",
    para: `    { cabecalho: "Coluna", valor: (c) => c.etapa },`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `  if (origem === "painel") {
    return "Painel";
  }`,
    ficheiro: COLUNAS,
    nome: "o que foi marcado pelo painel passa a contar como escrito à mão",
    para: ``,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `            linhas={filtrados}`,
    ficheiro: CLIENTES,
    nome: "a exportação dos clientes ignora os filtros e leva a lista toda",
    para: `            linhas={clientes}`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `          <BotaoExportar
            assunto="clientes"`,
    ficheiro: CLIENTES,
    nome: "o botão de exportar desaparece do ecrã dos clientes",
    para: `          <BotaoExportarApagado
            assunto="clientes"`,
    teste: TESTE_EXPORTAR,
  },
  {
    de: `  const paraExportar = colunas.flatMap(({ cartoes: daColuna }) => daColuna);`,
    ficheiro: QUADRO,
    nome: "o quadro exporta os 780 perdidos escondidos junto com o que está à vista",
    para: `  const paraExportar = cartoes;`,
    teste: TESTE_PIPELINE,
  },
  {
    de: `      disabled={aExportar || vazio}`,
    ficheiro: "app/components/botao-exportar.tsx",
    nome: "o botão deixa descarregar um ficheiro só com cabeçalhos",
    para: `      disabled={aExportar}`,
    teste: TESTE_PIPELINE,
  },
  {
    de: `    const chave = \`por_responder:\${conversa}:\${ultima.criadoEm}\`;`,
    ficheiro: AVISOS,
    nome: "a chave do aviso perde o instante e fica lida para sempre",
    para: `    const chave = \`por_responder:\${conversa}\`;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      href: ficha
        ? \`/app/conversas?conversa=\${encodeURIComponent(conversa)}\`
        : null,`,
    ficheiro: AVISOS,
    nome: "o aviso de quem não tem ficha manda para um ecrã onde ela não existe",
    para: `      href: \`/app/conversas?conversa=\${encodeURIComponent(conversa)}\`,`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    if (contacto.identificador_conversa && !contacto.fundido_em) {`,
    ficheiro: AVISOS,
    nome: "um contacto já fundido noutro volta a emprestar o nome ao aviso",
    para: `    if (contacto.identificador_conversa) {`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    if (!conversa || conversa.startsWith("teste:")) {`,
    ficheiro: AVISOS,
    nome: "as simulações da área de testes passam a contar como gente à espera",
    para: `    if (!conversa) {`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    if (ultima.direccao !== "recebida" || !ultima.criadoEm) {`,
    ficheiro: AVISOS,
    nome: "quem já teve resposta continua a aparecer como estando à espera",
    para: `    if (!ultima.criadoEm) {`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      .gte("criado_em", desde)
      .order("criado_em", { ascending: true }),`,
    ficheiro: AVISOS,
    nome: "as mensagens vêm da mais recente para a mais antiga",
    para: `      .gte("criado_em", desde)
      .order("criado_em", { ascending: false }),`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      .in("status", ["pendente", "em_atendimento"])`,
    ficheiro: AVISOS,
    nome: "os handoffs já resolvidos continuam a acender o sino",
    para: `      .in("status", ["pendente", "em_atendimento", "resolvido"])`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      .eq("cliente_slug", clienteSlug)
      .eq("estado", "confirmado")`,
    ficheiro: AVISOS,
    nome: "a agenda do sino lê-se sem o filtro da empresa",
    para: `      .eq("estado", "confirmado")`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      .eq("estado", "confirmado")
      .gte("inicio", agora.toISOString())`,
    ficheiro: AVISOS,
    nome: "uma marcação desmarcada volta a aparecer como atendimento de hoje",
    para: `      .gte("inicio", agora.toISOString())`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    base.from("lexia_avisos_lidos").select("chave").eq("user_id", userId),`,
    ficheiro: AVISOS,
    nome: "o já-lido de uma pessoa conta como lido para todas",
    para: `    base.from("lexia_avisos_lidos").select("chave"),`,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const falha =
    mensagens.error ?? contactos.error ?? handoffs.error ?? marcacoes.error;`,
    ficheiro: AVISOS,
    nome: "uma leitura falhada passa por sino vazio em vez de dizer que falhou",
    para: `  const falha = null;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const jaLidos = new Set<string>();`,
    ficheiro: AVISOS,
    nome: "um erro na tabela do já-lido esconde quem está à espera",
    para: `  if (lidos.error) {
    return { ...vazio, erro: "Não foi possível ler os avisos." };
  }

  const jaLidos = new Set<string>();`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    if (a.tipo === "marcacao") {
      return (a.quando ?? "").localeCompare(b.quando ?? "");
    }`,
    ficheiro: AVISOS,
    nome: "o atendimento de amanhã à noite fica por cima do da próxima hora",
    para: ``,
    teste: TESTE_AVISOS,
  },
  {
    de: `    handoff: 1,
    marcacao: 0,
    por_responder: 2,`,
    ficheiro: AVISOS,
    nome: "as marcações deixam de vir à frente dos outros avisos",
    para: `    handoff: 0,
    marcacao: 1,
    por_responder: 2,`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    naoLidos: avisos.filter((aviso) => !aviso.lido).length,`,
    ficheiro: AVISOS,
    nome: "o número do sino conta também os avisos já vistos",
    para: `    naoLidos: avisos.length,`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      cliente_slug: clienteSlug,
      user_id: userId,`,
    ficheiro: AVISOS_ESCRITA,
    nome: "o já-lido grava-se sem dizer de quem é",
    para: `      cliente_slug: clienteSlug,
      user_id: null,`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      !PREFIXOS.some((prefixo) => chave.startsWith(prefixo))`,
    ficheiro: AVISOS_ESCRITA,
    nome: "qualquer texto passa por chave de aviso e enche a tabela",
    para: `      false`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    .eq("user_id", userId)
    .eq("cliente_slug", clienteSlug)
    .eq("chave", valida);`,
    ficheiro: AVISOS_ESCRITA,
    nome: "desmarcar um aviso desmarca-o para todas as contas",
    para: `    .eq("cliente_slug", clienteSlug)
    .eq("chave", valida);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    !isClientRole(profile.role) ||
    profile.status !== "ativo" ||`,
    ficheiro: AVISOS_ROTA,
    nome: "um perfil suspenso ou de administração continua a ler avisos",
    para: ``,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const resultado = await getAvisos(quem.clienteSlug, quem.userId);`,
    ficheiro: AVISOS_ROTA,
    nome: "a rota lê os avisos de uma pessoa e mostra o já-lido de outra",
    para: `  const resultado = await getAvisos(quem.clienteSlug, quem.clienteSlug);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const resultado = await marcarAvisosLidos(
    quem.clienteSlug,
    quem.userId,
    apenasTextos(corpo.chaves),
  );`,
    ficheiro: AVISOS_ROTA,
    nome: "marcar como lido grava na empresa que o pedido disser",
    para: `  const resultado = await marcarAvisosLidos(
    String(corpo.cliente_slug ?? quem.clienteSlug),
    String(corpo.user_id ?? quem.userId),
    apenasTextos(corpo.chaves),
  );`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    const resultado = await limparAvisos(
      quem.clienteSlug,
      quem.userId,
      apenasTextos(corpo.limpar),
    );`,
    ficheiro: AVISOS_ROTA,
    nome: "limpar grava na empresa e na pessoa que o pedido disser",
    para: `    const resultado = await limparAvisos(
      String(corpo.cliente_slug ?? quem.clienteSlug),
      String(corpo.user_id ?? quem.userId),
      apenasTextos(corpo.limpar),
    );`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    if (linha.chave.startsWith(MARCA_LIMPO)) {
      limpos.add(linha.chave.slice(MARCA_LIMPO.length));
    } else {
      jaLidos.add(linha.chave);
    }`,
    ficheiro: AVISOS,
    nome: "o limpo passa a contar como lido e a lista nunca esvazia",
    para: `    jaLidos.add(linha.chave);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    const chave = \`por_responder:\${conversa}:\${ultima.criadoEm}\`;

    if (limpos.has(chave)) {
      continue;
    }`,
    ficheiro: AVISOS,
    nome: "limpar quem está à espera não o tira da lista",
    para: `    const chave = \`por_responder:\${conversa}:\${ultima.criadoEm}\`;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    const chave = \`handoff:\${handoff.id}:\${handoff.status}\`;

    if (limpos.has(chave)) {
      continue;
    }`,
    ficheiro: AVISOS,
    nome: "limpar uma passagem para a equipa não a tira da lista",
    para: `    const chave = \`handoff:\${handoff.id}:\${handoff.status}\`;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `    const chave = \`marcacao:\${marcacao.id}:\${marcacao.inicio}\`;

    if (limpos.has(chave)) {
      continue;
    }`,
    ficheiro: AVISOS,
    nome: "limpar um atendimento não o tira da lista",
    para: `    const chave = \`marcacao:\${marcacao.id}:\${marcacao.inicio}\`;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const { gravadas, ok } = await gravar(
    clienteSlug,
    userId,
    chaves,
    MARCA_LIMPO,
  );`,
    ficheiro: AVISOS_ESCRITA,
    nome: "limpar grava um lido simples e o aviso fica onde estava",
    para: `  const { gravadas, ok } = await gravar(clienteSlug, userId, chaves);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `          limpar: anterior.avisos.map((aviso) => aviso.chave),`,
    ficheiro: SINO,
    nome: "o botão limpar faz o mesmo que fechar a lista já fazia",
    para: `          chaves: anterior.avisos.map((aviso) => aviso.chave),`,
    teste: TESTE_AVISOS,
  },
  {
    de: `      return { ...anterior, avisos: [], naoLidos: 0 };`,
    ficheiro: SINO,
    nome: "clicar em limpar não muda nada no ecrã de quem clicou",
    para: `      return anterior;`,
    teste: TESTE_AVISOS,
  },
  {
    de: `            {avisos.length > 0 ? (`,
    ficheiro: SINO,
    nome: "o botão de limpar aparece numa lista vazia, sem nada para limpar",
    para: `            {true ? (`,
    teste: TESTE_AVISOS,
  },
  {
    de: `        {comSino ? <SinoAvisos estado={avisos} /> : null}

        <LexiaBrand compact showText={false} tone="light" />`,
    ficheiro: MOLDURA,
    nome: "o sino desaparece da barra de cima e o telemóvel fica sem avisos",
    para: `        <LexiaBrand compact showText={false} tone="light" />`,
    teste: TESTE_AVISOS,
  },
  {
    de: `          {comSino ? (
            <SinoAvisos
              ancora="esquerda"
              className="hidden lg:block"
              estado={avisos}
            />
          ) : null}`,
    ficheiro: MOLDURA,
    nome: "o sino desaparece da barra lateral e o computador fica sem avisos",
    para: ``,
    teste: TESTE_AVISOS,
  },
  {
    de: `              className="hidden lg:block"
`,
    ficheiro: MOLDURA,
    nome: "o sino da barra lateral deixa de se esconder e aparecem dois no telemóvel",
    para: ``,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const avisos = useAvisos(comSino);`,
    ficheiro: MOLDURA,
    nome: "cada sino lê os seus avisos e cada página vai duas vezes à base",
    para: `  const avisos = useAvisos(true);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `        {naoLidos > 0 ? (`,
    ficheiro: SINO,
    nome: "a bolinha vermelha fica acesa mesmo sem nada novo",
    para: `        {naoLidos >= 0 ? (`,
    teste: TESTE_AVISOS,
  },
  {
    de: `            {naoLidos > 9 ? "9+" : naoLidos}`,
    ficheiro: SINO,
    nome: "treze avisos escrevem um 13 que não cabe na bolinha",
    para: `            {naoLidos}`,
    teste: TESTE_AVISOS,
  },
  {
    de: `border border-border bg-surface shadow-xl`,
    ficheiro: SINO,
    nome: "a lista sai transparente com a navegação a atravessá-la",
    para: `border border-border bg-card shadow-xl`,
    teste: TESTE_AVISOS,
  },
  {
    de: `rounded-full bg-danger px-1`,
    ficheiro: SINO,
    nome: "a bolinha fica sem vermelho nenhum",
    para: `rounded-full bg-destructive px-1`,
    teste: TESTE_AVISOS,
  },
  {
    de: `            ancora === "direita" ? "right-0" : "left-0"`,
    ficheiro: SINO,
    nome: "a lista da barra lateral começa 64 px fora do ecrã",
    para: `            "right-0"`,
    teste: TESTE_AVISOS,
  },
  {
    de: `              ancora="esquerda"`,
    ficheiro: MOLDURA,
    nome: "o sino do computador abre para o lado onde não há ecrã",
    para: `              ancora="direita"`,
    teste: TESTE_AVISOS,
  },
  {
    de: `transition-transform duration-200 lg:static lg:h-full`,
    ficheiro: MOLDURA,
    nome: "o conteúdo desenha-se por cima da lista de avisos aberta",
    para: `transition-transform duration-200 lg:static lg:z-auto lg:h-full`,
    teste: TESTE_AVISOS,
  },
  {
    de: `  const fechar = useCallback(() => {
    setAberto(false);
    marcarTodos();
  }, [marcarTodos]);`,
    ficheiro: SINO,
    nome: "a lista nasce toda cinzenta e esconde o que é novo",
    para: `  const fechar = useCallback(() => {
    setAberto(false);
  }, []);`,
    teste: TESTE_AVISOS,
  },
  {
    de: `                    onIr={fechar}`,
    ficheiro: SINO,
    nome: "sair pela conversa deixa o sino vermelho para sempre",
    para: `                    onIr={() => setAberto(false)}`,
    teste: TESTE_AVISOS,
  },
  {
    de: `        ? createPortal(`,
    ficheiro: DICA,
    nome: "a explicação do ⓘ volta a ser cortada pelo cartão",
    para: `        ? ((componente) => componente)(`,
    teste: TESTE_AVISOS,
  },
  {
    de: `        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>`,
    ficheiro: DICA,
    nome: "o balão volta para dentro do cartão, à espera de ser decapitado",
    para: `        <Info aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute bottom-full opacity-0">
        {texto}
      </span>`,
    teste: TESTE_AVISOS,
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
  TESTE_EXPORTAR,
  TESTE_AVISOS,
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

/**
 * O ficheiro que sai do botão de exportar tem de abrir no Excel do dono.
 *
 * Isto não é um teste de formatação por gosto. Cada uma destas regras veio de
 * um ficheiro que abria mal: o separador errado punha tudo numa coluna, a
 * codificação errada punha "InÃªs" onde estava "Inês", o ponto decimal punha
 * os valores como texto e as somas da folha davam zero. Um CSV que o Excel
 * abre torto é indistinguível de uma exportação avariada para quem o recebe.
 *
 * O teste que importa mais é o da fórmula: o nome de um contacto é escrito
 * pela própria pessoa no perfil do WhatsApp, e o ficheiro é aberto pelo dono
 * do negócio na máquina dele.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { EventoAgenda } from "@/lib/agenda/read";
import type { ClienteLinha } from "@/lib/clientes/read";
import {
  colunasDaAgenda,
  colunasDeClientes,
  colunasDoPipeline,
} from "@/lib/exportar/colunas";
import {
  construirCsv,
  dataParaFolha,
  nomeDoFicheiro,
  type Coluna,
} from "@/lib/exportar/csv";
import type { CartaoPipeline } from "@/lib/pipeline/read";

const BOM = "\uFEFF";
const raiz = new URL("..", import.meta.url).pathname;

/** As linhas do ficheiro, já sem o BOM e sem o `\r\n` final. */
function linhasDe(csv: string) {
  assert.ok(csv.startsWith(BOM), "o ficheiro saiu sem o BOM à cabeça");
  assert.ok(csv.endsWith("\r\n"), "o ficheiro saiu sem o fim de linha final");

  return csv.slice(BOM.length).trimEnd().split("\r\n");
}

type Simples = { nome: string; valor: number | null };

const duasColunas: Coluna<Simples>[] = [
  { cabecalho: "Nome", valor: (l) => l.nome },
  { cabecalho: "Valor", valor: (l) => l.valor },
];

test("as colunas separam-se por ponto e vírgula, que é o que o Excel português espera", () => {
  const csv = construirCsv([{ nome: "Inês", valor: 10 }], duasColunas);

  assert.deepEqual(linhasDe(csv), ['"Nome";"Valor"', '"Inês";"10"']);
  // Com vírgula, o Excel em pt abre o ficheiro todo numa coluna só.
  assert.ok(!csv.includes('","Valor"'));
});

test("o ficheiro começa pelo BOM, senão os acentos saem trocados no Windows", () => {
  const csv = construirCsv([{ nome: "Gonçalves", valor: null }], duasColunas);

  assert.equal(csv.codePointAt(0), 0xfeff);
});

test("as linhas acabam em CRLF, que é o que o Excel no Windows corta", () => {
  const csv = construirCsv(
    [
      { nome: "Um", valor: 1 },
      { nome: "Dois", valor: 2 },
    ],
    duasColunas,
  );

  assert.equal(csv.slice(BOM.length).split("\r\n").length, 4);
  assert.ok(!/[^\r]\n/.test(csv), "há um \\n sozinho, sem o \\r à frente");
});

/**
 * O caso de segurança. Já temos "Out Of Service" e "The Blessed⚡️" na base,
 * escritos pelas próprias pessoas: nada impede um `=HYPERLINK(...)`.
 */
test("uma célula que começa por sinal de fórmula sai desarmada", () => {
  for (const perigoso of [
    "=HYPERLINK(\"http://mau\",\"Clique\")",
    "+1234",
    "-1234",
    "@SUM(A1)",
    "\tescondido",
    "\rescondido",
  ]) {
    const csv = construirCsv([{ nome: perigoso, valor: null }], duasColunas);
    const [, linha] = linhasDe(csv);

    assert.ok(
      linha.startsWith("\"'"),
      `"${perigoso.slice(0, 12)}" saiu sem o apóstrofo à frente`,
    );
  }
});

test("um nome normal não leva apóstrofo nenhum", () => {
  const csv = construirCsv(
    [{ nome: "Sousa & Filhos, Lda", valor: null }],
    duasColunas,
  );

  assert.deepEqual(linhasDe(csv)[1], '"Sousa & Filhos, Lda";""');
});

test("o ponto e vírgula e as aspas dentro de um nome não partem a linha", () => {
  const csv = construirCsv(
    [{ nome: 'Sousa; Lda "a sério"', valor: 1 }],
    duasColunas,
  );
  const linhas = linhasDe(csv);

  assert.equal(linhas.length, 2, "o nome com ponto e vírgula partiu a linha");
  assert.equal(linhas[1], '"Sousa; Lda ""a sério""";"1"');
});

test("os decimais saem com vírgula, senão as somas da folha dão zero", () => {
  const csv = construirCsv([{ nome: "x", valor: 90.5 }], duasColunas);

  assert.equal(linhasDe(csv)[1], '"x";"90,5"');
});

/**
 * `Infinity` e `NaN` não têm escrita que o Excel entenda como número. Sai a
 * célula vazia, que é a leitura honesta: não se sabe.
 */
test("um número que não é finito sai como célula vazia", () => {
  for (const valor of [Infinity, -Infinity, NaN]) {
    const csv = construirCsv([{ nome: "x", valor }], duasColunas);

    assert.equal(linhasDe(csv)[1], '"x";""');
  }
});

test("o sim e o não saem em português, não em true e false", () => {
  const colunas: Coluna<{ ligado: boolean }>[] = [
    { cabecalho: "Ligado", valor: (l) => l.ligado },
  ];
  const csv = construirCsv([{ ligado: true }, { ligado: false }], colunas);

  assert.deepEqual(linhasDe(csv).slice(1), ['"Sim"', '"Não"']);
});

test("o que falta sai vazio e não a palavra null", () => {
  const colunas: Coluna<{ a: null; b: undefined }>[] = [
    { cabecalho: "A", valor: (l) => l.a },
    { cabecalho: "B", valor: (l) => l.b },
  ];
  const csv = construirCsv([{ a: null, b: undefined }], colunas);

  assert.equal(linhasDe(csv)[1], '"";""');
  assert.ok(!csv.includes("null"));
  assert.ok(!csv.includes("undefined"));
});

/**
 * Um ficheiro de zero bytes parece uma avaria; um ficheiro com os nomes das
 * colunas e nada por baixo diz "não havia nada para exportar".
 */
test("uma lista vazia dá um ficheiro com o cabeçalho e mais nada", () => {
  const csv = construirCsv([], duasColunas);

  assert.deepEqual(linhasDe(csv), ['"Nome";"Valor"']);
});

test("o nome do ficheiro leva a data local de quem exporta", () => {
  assert.equal(
    nomeDoFicheiro("clientes", new Date(2026, 9, 5, 23, 30)),
    "clientes-2026-10-05.csv",
  );
});

/**
 * O fuso é o do cliente e não o da máquina. A Miranda é em Boston e o Detail
 * em Portugal: uma marcação das 19h de Boston não pode aparecer como 00h do
 * dia seguinte no ficheiro dela. Este é o mesmo defeito que pôs 16,4% das
 * mensagens da Miranda no dia errado.
 */
test("a data sai no fuso do cliente e numa escrita que o Excel reconhece", () => {
  const instante = "2026-11-03T00:30:00.000Z";

  assert.equal(dataParaFolha(instante, "America/New_York"), "2026-11-02 19:30");
  assert.equal(dataParaFolha(instante, "Europe/Lisbon"), "2026-11-03 00:30");
});

test("uma data que não existe não escreve lixo na célula", () => {
  assert.equal(dataParaFolha(null, "Europe/Lisbon"), "");
  assert.equal(dataParaFolha(undefined, "Europe/Lisbon"), "");
  assert.equal(dataParaFolha("ontem", "Europe/Lisbon"), "");
});

// ---------------------------------------------------------------------------
// As colunas de cada exportação.
// ---------------------------------------------------------------------------

function cliente(parciais: Partial<ClienteLinha> = {}): ClienteLinha {
  return {
    anuncio: null,
    canais: ["whatsapp"],
    canal: "whatsapp",
    email: null,
    historico: [],
    id: "c1",
    idade: null,
    idadeRegistadaEm: null,
    identificadorConversa: "351925252340",
    juntos: [],
    mensagemUltima: null,
    mensagens: 0,
    morada: null,
    nome: "Thiago Correia",
    notas: null,
    origemCapturada: null,
    origemManual: null,
    origemManualNota: null,
    primeiroContactoEm: null,
    telefone: "351925252340",
    telefoneDigitos: "925252340",
    totalGasto: null,
    viatura: "BMW 320d",
    ...parciais,
  };
}

/**
 * O carro só existe no Detail. Na Miranda a coluna não pode aparecer: uma
 * coluna "Carro" sempre vazia num ficheiro de estética faz o dono procurar
 * onde é que se preenche.
 */
test("a coluna do carro só sai para quem tem carros", () => {
  const com = colunasDeClientes("EUR", true, "Europe/Lisbon");
  const sem = colunasDeClientes("USD", false, "America/New_York");

  assert.ok(com.some((c) => c.cabecalho === "Carro"));
  assert.ok(!sem.some((c) => c.cabecalho === "Carro"));
  assert.equal(com.length, sem.length + 1);
});

test("a moeda do cliente entra no cabeçalho do total gasto", () => {
  const cabecalhos = colunasDeClientes("USD", false, "America/New_York").map(
    (c) => c.cabecalho,
  );

  assert.ok(cabecalhos.includes("Total gasto (USD)"));
  assert.ok(!cabecalhos.includes("Total gasto (EUR)"));
});

/**
 * As duas origens são coisas diferentes: uma é o que a Meta confirmou e a
 * outra é o que o dono se lembra. Juntá-las numa coluna só apagava a diferença
 * entre um facto e uma memória — e só 3% dos contactos têm o facto.
 */
test("a origem confirmada e a anotada saem em colunas separadas", () => {
  const colunas = colunasDeClientes("EUR", true, "Europe/Lisbon");
  const linha = cliente({
    origemCapturada: "campanha_outubro",
    origemManual: "Indicação",
  });
  const valor = (cabecalho: string) =>
    colunas.find((c) => c.cabecalho === cabecalho)?.valor(linha);

  assert.equal(valor("Origem (confirmada)"), "campanha_outubro");
  assert.equal(valor("Origem (anotada)"), "Indicação");
});

test("as marcações do cliente contam-se, e o ficheiro leva as datas no fuso dele", () => {
  const colunas = colunasDeClientes("USD", false, "America/New_York");
  const linha = cliente({
    historico: [
      {
        dataInicio: "2026-10-01T12:00:00.000Z",
        estado: null,
        id: "m1",
        servico: null,
        valor: 10,
        viatura: null,
      },
      {
        dataInicio: "2026-10-02T12:00:00.000Z",
        estado: null,
        id: "m2",
        servico: null,
        valor: 10,
        viatura: null,
      },
    ],
    mensagemUltima: "2026-11-03T00:30:00.000Z",
  });
  const valor = (cabecalho: string) =>
    colunas.find((c) => c.cabecalho === cabecalho)?.valor(linha);

  assert.equal(valor("Marcações"), 2);
  assert.equal(valor("Última mensagem"), "2026-11-02 19:30");
});

function evento(parciais: Partial<EventoAgenda> = {}): EventoAgenda {
  return {
    diaInteiro: false,
    executor: "Martim",
    fim: "2026-11-02T11:00:00.000Z",
    id: "e1",
    inicio: "2026-11-02T10:00:00.000Z",
    linkGoogle: null,
    localizacao: null,
    nomeCliente: "Thiago Correia",
    origem: "manual",
    servico: "Lavagem Detalhada",
    telefone: null,
    titulo: "Lavagem",
    valorPrevisto: 90.5,
    ...parciais,
  };
}

/**
 * Um cliente sem catálogo de preços ligado não tem moeda nenhuma. O cabeçalho
 * fica só "Valor" em vez de prometer uma unidade que não se sabe qual é — e
 * nunca "Valor (null)", que é o que uma interpolação distraída escreve.
 */
test("sem moeda, o cabeçalho do valor não promete unidade nenhuma", () => {
  const com = colunasDaAgenda("EUR", "Europe/Lisbon").map((c) => c.cabecalho);
  const sem = colunasDaAgenda(null, "Europe/Lisbon").map((c) => c.cabecalho);

  assert.ok(com.includes("Valor (EUR)"));
  assert.ok(sem.includes("Valor"));
  assert.ok(!sem.some((cabecalho) => cabecalho.includes("null")));
});

/**
 * "manual" na base pode ser qualquer uma das três coisas para quem abre o
 * Excel. Medido a 2026-10-18: 83% dos eventos foram escritos à mão no Google,
 * e saber isso é a primeira pergunta de quem lê o ficheiro.
 */
test("quem marcou sai em palavras e não no código da base", () => {
  const colunas = colunasDaAgenda("EUR", "Europe/Lisbon");
  const coluna = colunas.find((c) => c.cabecalho === "Marcado por");

  assert.ok(coluna);
  assert.equal(coluna.valor(evento({ origem: "agente" })), "Agente");
  assert.equal(coluna.valor(evento({ origem: "painel" })), "Painel");
  assert.equal(coluna.valor(evento({ origem: "manual" })), "À mão");
  assert.equal(coluna.valor(evento({ origem: null })), "À mão");
});

function cartao(parciais: Partial<CartaoPipeline> = {}): CartaoPipeline {
  return {
    canal: "whatsapp",
    dias: 3,
    etapa: "agendado",
    id: "p1",
    identificadorConversa: "351925252340",
    marcacaoEm: "2026-11-02T10:00:00.000Z",
    marcacaoNome: "Thiago Correia",
    marcacaoOrigem: "manual",
    marcacaoServico: "Lavagem Detalhada",
    mensagens: 22,
    nome: "The Blessed⚡️",
    porque: "Tem uma marcação por acontecer.",
    porResponder: false,
    resultado: null,
    telefone: "351925252340",
    ultimaMensagemEm: "2026-10-16T13:45:00.000Z",
    ...parciais,
  };
}

/**
 * Este é o defeito que o teste tranca: quem nunca trocou mensagens tem `dias`
 * igual ao maior inteiro seguro do JavaScript, que é o que o faz cair em
 * "Perdido". No ecrã nunca se vê. Numa folha de cálculo apareciam 9 mil
 * bilhões e estragavam qualquer média da coluna.
 */
test("quem nunca trocou mensagens não leva 9 mil bilhões de dias na folha", () => {
  const coluna = colunasDoPipeline("Europe/Lisbon").find(
    (c) => c.cabecalho === "Dias sem falar",
  );

  assert.ok(coluna);
  assert.equal(coluna.valor(cartao({ dias: 3 })), 3);
  assert.equal(
    coluna.valor(cartao({ dias: Number.MAX_SAFE_INTEGER, ultimaMensagemEm: null })),
    null,
  );
});

/**
 * O nome do perfil do WhatsApp muitas vezes não é um nome — "The Blessed⚡️"
 * está na base. O ficheiro leva os dois: o da marcação à frente, porque é o
 * que a pessoa deu quando marcou, e o do perfil ao lado, porque é por ele que
 * a conversa se encontra no WhatsApp.
 */
test("o pipeline exporta o nome da marcação e o do WhatsApp, os dois", () => {
  const colunas = colunasDoPipeline("Europe/Lisbon");
  const valor = (cabecalho: string, linha: CartaoPipeline) =>
    colunas.find((c) => c.cabecalho === cabecalho)?.valor(linha);

  assert.equal(valor("Nome", cartao()), "Thiago Correia");
  assert.equal(valor("Nome no WhatsApp", cartao()), "The Blessed⚡️");
  // Sem nome na marcação, a primeira coluna cai no do perfil em vez de vazia.
  assert.equal(valor("Nome", cartao({ marcacaoNome: null })), "The Blessed⚡️");
});

/** A coluna onde o cartão está sai em palavras, não na chave da base. */
test("a coluna do quadro sai com o rótulo que está no ecrã", () => {
  const colunas = colunasDoPipeline("Europe/Lisbon");
  const coluna = colunas.find((c) => c.cabecalho === "Coluna");

  assert.ok(coluna);
  assert.equal(coluna.valor(cartao({ etapa: "agendado" })), "Agendado");
  assert.equal(coluna.valor(cartao({ etapa: "por_responder" })), "Por responder");
  assert.ok(!String(coluna.valor(cartao({ etapa: "a_arrefecer" }))).includes("_"));
});

/**
 * O aviso vermelho que vive no cartão tem de viajar para o ficheiro. Sem esta
 * coluna, quem exporta o quadro perde exactamente a informação que o quadro
 * acrescentou: um cartão em "Agendado" que ainda está à espera de resposta.
 */
test("o aviso de por responder vai no ficheiro, ao lado da coluna", () => {
  const colunas = colunasDoPipeline("Europe/Lisbon");
  const coluna = colunas.find((c) => c.cabecalho === "À espera de resposta");

  assert.ok(coluna);
  assert.equal(coluna.valor(cartao({ porResponder: true })), true);
  assert.equal(coluna.valor(cartao({ porResponder: false })), false);

  // E no ficheiro lê-se "Sim", não "true".
  const csv = construirCsv([cartao({ porResponder: true })], colunas);

  assert.ok(csv.includes('"Sim"'));
});

// ---------------------------------------------------------------------------
// O botão tem de estar nos painéis, e tem de exportar o que está à vista.
// ---------------------------------------------------------------------------

/**
 * Os três ecrãs que têm listas têm de ter o botão. Apagar o botão de um deles
 * não parte nada no resto do produto, e a falta só se descobre quando o dono
 * vai exportar e não encontra — por isso é a máquina que conta.
 */
test("os três painéis com listas montam o botão de exportar", () => {
  for (const painel of [
    "app/components/agenda-panel.tsx",
    "app/components/clientes-panel.tsx",
    "app/components/pipeline-panel.tsx",
  ]) {
    const fonte = readFileSync(`${raiz}${painel}`, "utf8");

    // O fim do nome conta. Procurar só "<BotaoExportar" dava verde a um
    // `<BotaoExportarQualquerCoisa`, e foi assim que esta mutação sobreviveu
    // à primeira versão deste teste.
    assert.ok(
      /<BotaoExportar[\s/>]/.test(fonte),
      `${painel} deixou de ter botão de exportar`,
    );
  }
});

/**
 * O ficheiro dos clientes segue os filtros do ecrã.
 *
 * Com `clientes` em vez de `filtrados`, quem filtrou um canal e exportou
 * recebia os 939 — e ia procurar o defeito na exportação. O rodapé do ecrã
 * promete um número; o ficheiro tem de cumprir esse número.
 */
test("a exportação dos clientes sai do que o filtro deixou, não da lista toda", () => {
  const fonte = readFileSync(`${raiz}app/components/clientes-panel.tsx`, "utf8");

  assert.ok(
    /linhas=\{filtrados\}/.test(fonte),
    "o botão dos clientes deixou de exportar a lista filtrada",
  );
});

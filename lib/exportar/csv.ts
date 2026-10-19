/**
 * Transformar uma lista em CSV que o Excel abre bem.
 *
 * Não tem `server-only` de propósito: os painéis que têm as listas são
 * componentes de cliente e já têm as linhas no navegador. Gerar o ficheiro aí
 * poupa uma rota nova, uma leitura repetida à base de dados e uma superfície
 * nova de autenticação — ninguém pode exportar dados que já não estivesse a
 * ver no ecrã.
 *
 * Quatro decisões que vêm todas de abrir o ficheiro no Excel a sério.
 */

/**
 * O separador é o ponto e vírgula, não a vírgula.
 *
 * O Excel configurado em português — pt-PT e pt-BR — usa a vírgula como
 * separador decimal, e por isso espera o ponto e vírgula entre colunas. Com
 * vírgulas, o ficheiro abre com tudo numa só coluna e quem o recebe conclui
 * que a exportação está avariada.
 */
const SEPARADOR = ";";

/**
 * O BOM à cabeça do ficheiro.
 *
 * Sem ele o Excel no Windows lê o ficheiro como Latin-1 e "Inês Gonçalves"
 * aparece "InÃªs GonÃ§alves". São três bytes que decidem se a exportação
 * serve para alguma coisa num país com acentos.
 */
const BOM = "\uFEFF";

/** Uma coluna da exportação: o cabeçalho, e como se tira o valor da linha. */
export type Coluna<T> = {
  cabecalho: string;
  valor: (linha: T) => string | number | boolean | null | undefined;
};

/**
 * Desarma uma célula que o Excel trataria como fórmula.
 *
 * Isto não é zelo a mais. O `nome` de um contacto é o nome de perfil do
 * WhatsApp, escrito pela própria pessoa — já temos "Out Of Service" e "The
 * Blessed⚡️" na base. Nada impede alguém de pôr `=HYPERLINK(...)` ou
 * `=cmd|...` nesse campo: o Excel executa fórmulas ao abrir, e o ficheiro
 * seria aberto pelo dono do negócio, na máquina dele.
 *
 * A defesa é um apóstrofo à frente, que é como o Excel marca "isto é texto".
 * Os caracteres que o disparam são os cinco que o Excel e o LibreOffice
 * aceitam como início de fórmula, mais o tab e o retorno, que servem para
 * empurrar o conteúdo para outra célula.
 */
function desarmarFormula(texto: string) {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

/**
 * Uma célula, pronta a escrever.
 *
 * As aspas duplicam-se por dentro e a célula vai sempre entre aspas: é mais
 * barato do que decidir caso a caso, e um nome com ponto e vírgula lá dentro
 * ("Sousa & Filhos; Lda") deixa de partir a linha.
 */
function celula(valor: string | number | boolean | null | undefined) {
  if (valor === null || valor === undefined) {
    return '""';
  }

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) {
      return '""';
    }

    // A vírgula decimal, porque é o que o Excel em português espera. Com o
    // ponto, "90.5" entra como texto e as somas da folha dão zero.
    return `"${String(valor).replace(".", ",")}"`;
  }

  if (typeof valor === "boolean") {
    return valor ? '"Sim"' : '"Não"';
  }

  return `"${desarmarFormula(valor).replace(/"/g, '""')}"`;
}

/**
 * Constrói o CSV.
 *
 * Devolve só o cabeçalho quando a lista está vazia. Um ficheiro com os nomes
 * das colunas e nada por baixo diz "não havia nada para exportar"; um
 * ficheiro de zero bytes parece uma avaria.
 */
export function construirCsv<T>(linhas: T[], colunas: Coluna<T>[]) {
  const cabecalho = colunas
    .map((coluna) => celula(coluna.cabecalho))
    .join(SEPARADOR);

  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => celula(coluna.valor(linha))).join(SEPARADOR),
  );

  // O `\r\n` é o que o Excel espera; com `\n` só, algumas versões no Windows
  // juntam tudo numa linha.
  return BOM + [cabecalho, ...corpo].join("\r\n") + "\r\n";
}

/**
 * O nome do ficheiro, com a data a que foi tirado.
 *
 * A data no nome não é enfeite: estas exportações acabam todas na mesma pasta
 * de Transferências, e sem ela ficam "clientes (3).csv" e ninguém sabe qual é
 * a recente. É a data local de quem exporta, porque é essa que ele reconhece.
 */
export function nomeDoFicheiro(assunto: string, agora = new Date()) {
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  const dia = [
    agora.getFullYear(),
    doisDigitos(agora.getMonth() + 1),
    doisDigitos(agora.getDate()),
  ].join("-");

  return `${assunto}-${dia}.csv`;
}

/**
 * Uma data ISO escrita como o Excel a reconhece.
 *
 * `AAAA-MM-DD HH:MM` entra como data; o ISO com o `T` e o `Z` entra como
 * texto, e deixa de se poder ordenar nem filtrar por mês na folha.
 *
 * O fuso é o do cliente e não o da máquina: a Miranda é em Boston e o Detail
 * em Portugal, e uma marcação das 19h de Boston não pode aparecer como 00h do
 * dia seguinte no ficheiro dela.
 */
export function dataParaFolha(iso: string | null | undefined, fuso: string) {
  if (!iso) {
    return "";
  }

  const quando = new Date(iso);

  if (Number.isNaN(quando.getTime())) {
    return "";
  }

  const partes = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: fuso,
    year: "numeric",
  }).format(quando);

  // O `sv-SE` já dá "2026-11-02 10:00" — é o único local do ECMA-402 que
  // escreve a data como o ISO sem o `T`. Usá-lo é mais seguro do que montar a
  // data à mão a partir dos componentes do `Date`, que estão no fuso da
  // máquina e não no do cliente.
  return partes;
}

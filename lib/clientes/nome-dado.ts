/**
 * O nome que a pessoa DEU, para as fichas do Instagram e do Messenger sem nome.
 *
 * Só regras, sem base de dados, para se poderem testar com os casos reais.
 *
 * Porque é que isto existe: no Detail, 539 fichas do Messenger e 64 do
 * Instagram chegam sem nome nenhum (a Meta só o dá quando o perfil é público).
 * Muitas dessas pessoas disseram o nome ao agente — numa marcação, no resumo
 * que o agente escreve antes de marcar ("👤 João Diniz", "Nome: …"), ou na
 * própria mensagem ("o meu nome é Américo").
 *
 * A regra é enviesada para RECUSAR, como a do nome limpo do agente
 * (memória `reference_nome_cru_vs_limpo`): uma ficha sem nome mostra
 * "Cliente do Messenger", que é sempre aceitável; uma ficha com o nome de uma
 * cidade, de uma empresa ou de um @ é pior do que nenhuma.
 */

/** Palavras que, numa "assinatura", dizem empresa e não pessoa. */
const palavrasDeEmpresa =
  /\b(lda|ltda|llc|inc|corp|unipessoal|construction|services|servicos|serviços|solutions|consulting|imports|s\.?a\.?|studio|estudio|estúdio|clinic|clinica|clínica|beauty|detail|detailing|auto|autos|car|cars|shop|store|loja|group|grupo|company|empresa|marketing|digital|agency|agencia|agência|team|equipa|equipe|oficial|official)\b/i;

/** Palavras que aparecem com maiúscula a seguir a "sou" e não são nomes. */
const naoSaoNomes = new Set(
  [
    "cliente",
    "dono",
    "dona",
    "proprietário",
    "proprietária",
    "brasileiro",
    "brasileira",
    "português",
    "portuguesa",
    "eu",
    "aqui",
    "the",
    "a",
    "o",
    "obrigado",
    "obrigada",
    "olá",
    "ola",
    "bom",
    "boa",
    "sim",
    "não",
    "nao",
    "ok",
    "lisboa",
    "porto",
    "boston",
  ].map((palavra) => palavra.normalize("NFD").replace(/[̀-ͯ]/g, "")),
);

const particulas = new Set(["de", "da", "do", "dos", "das", "del", "la", "e"]);

function semAcentos(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Limpa um nome e devolve-o, ou `null` se não servir.
 *
 * - NFKC primeiro: o unicode decorativo do Instagram (`𝑽𝒂𝒍𝒒𝒖𝒊𝒓𝒊𝒂`) vira letras
 *   normais; o U+3164, que parece vazio, sai.
 * - Emojis e símbolos saem ("Valéria 🦋" → "Valéria").
 * - Recusa: dígitos, @, siglas (2-3 maiúsculas), uma letra, palavras de
 *   empresa, e mais de 5 palavras (já é uma frase).
 */
export function limparNome(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? "")
    .normalize("NFKC")
    .replace(/ㅤ/g, " ")
    .replace(/[^\p{L}\p{M}'’\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!texto || /\d|@/.test(bruto ?? "")) {
    return null;
  }

  // Iniciais soltas ("Cristina P") não acrescentam nada e parecem cortadas.
  const palavras = texto
    .split(" ")
    .filter((palavra, indice) => indice === 0 || palavra.length > 1);

  if (palavras.length > 5) {
    return null;
  }

  if (palavrasDeEmpresa.test(texto)) {
    return null;
  }

  const principal = palavras.filter(
    (palavra) => !particulas.has(palavra.toLowerCase()),
  );

  if (principal.length === 0) {
    return null;
  }

  // Siglas e uma letra só: "RD", "Cc", "J".
  if (principal.length === 1 && (principal[0].length < 3 || /^\p{Lu}{2,4}$/u.test(principal[0]))) {
    return null;
  }

  // Uma sigla ao lado de palavras normais é marca: "EDS Construction". Tudo em
  // maiúsculas ("JOÃO DINIZ") é só a forma de escrever.
  const siglas = principal.filter((palavra) => /^\p{Lu}{2,4}$/u.test(palavra));

  const tudoEmMaiusculas = texto === texto.toUpperCase();

  if (!tudoEmMaiusculas && siglas.length > 0) {
    return null;
  }

  if (principal.some((palavra) => naoSaoNomes.has(semAcentos(palavra.toLowerCase())))) {
    return null;
  }

  // Tudo em maiúsculas ou minúsculas passa a "Título", que é como se escreve
  // um nome numa ficha.
  return palavras
    .map((palavra) =>
      particulas.has(palavra.toLowerCase())
        ? palavra.toLowerCase()
        : palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Um nome escrito: palavras com maiúscula, com partículas pelo meio
 * ("Daniel Filipe Dinis dos Reis"). Pára na primeira palavra minúscula que
 * não é partícula — é o que separa "Américo" de "Américo e Segunda vou…".
 */
const NOME = String.raw`(\p{Lu}[\p{L}'’-]+(?:[ \t]+(?:(?:de|da|do|dos|das|del|la)[ \t]+)?\p{Lu}[\p{L}'’-]+){0,4})`;

/** As linhas do resumo que o agente escreve antes de marcar. */
const resumos = [
  new RegExp(String.raw`👤\s*([^\n]+)`, "u"),
  new RegExp(String.raw`\b(?:Nome|Name|Nombre)\s*:\s*([^\n,.;|]+)`, "u"),
];

/** O nome na linha de resumo do agente, limpo, ou `null`. */
export function nomeDoResumo(texto: string | null | undefined) {
  for (const padrao of resumos) {
    const achado = padrao.exec(texto ?? "")?.[1];
    const nome = limparNome(achado);

    if (nome) {
      return nome;
    }
  }

  return null;
}

/**
 * As formas de dizer o próprio nome em pt, en e es.
 *
 * "sou o X" / "sou a X" e "Sou X." no início: "sou de Lisboa" e "sou cliente"
 * não passam porque a palavra a seguir não tem maiúscula (ou está na lista).
 * Sem "I'm": "I'm Interested" apanhava-se demasiado.
 */
const apresentacoes = [
  new RegExp(String.raw`\bmeu nome (?:é|e)\s+${NOME}`, "iu"),
  new RegExp(String.raw`\b(?:me chamo|chamo-me)\s+${NOME}`, "iu"),
  new RegExp(String.raw`\bsou (?:o|a)\s+${NOME}`, "iu"),
  new RegExp(String.raw`(?:^|[.!?\n]\s*)sou\s+${NOME}`, "iu"),
  new RegExp(String.raw`\bmy name is\s+${NOME}`, "iu"),
  new RegExp(String.raw`\b(?:me llamo|mi nombre es)\s+${NOME}`, "iu"),
];

/**
 * O nome numa mensagem do próprio cliente, limpo, ou `null`.
 *
 * O `i` dos padrões vale para a frase ("Meu nome é", "SOU O"), mas o nome em
 * si tem de começar por maiúscula: confirma-se de novo no texto encontrado,
 * porque com `i` o `\p{Lu}` também aceitava minúsculas.
 */
export function nomeDaMensagem(texto: string | null | undefined) {
  for (const padrao of apresentacoes) {
    const achado = padrao.exec(texto ?? "")?.[1];

    if (!achado) {
      continue;
    }

    // Só as palavras do início que começam por maiúscula (ou partículas
    // entre elas): o `i` deixou passar "Américo e Segunda vou".
    const palavras: string[] = [];

    for (const palavra of achado.split(/[ \t]+/)) {
      if (/^\p{Lu}/u.test(palavra)) {
        palavras.push(palavra);
      } else if (particulas.has(palavra) && palavra !== "e" && palavras.length > 0) {
        palavras.push(palavra);
      } else {
        break;
      }
    }

    while (palavras.length > 0 && particulas.has(palavras[palavras.length - 1])) {
      palavras.pop();
    }

    const nome = limparNome(palavras.join(" "));

    if (nome) {
      return nome;
    }
  }

  return null;
}

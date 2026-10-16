/**
 * O telefone, só as regras — sem base de dados.
 *
 * Isto vive à parte da leitura porque o formulário precisa de montar o número
 * no browser para mostrar ao dono o que vai ficar gravado, e a leitura importa
 * o cliente de administração da Supabase. Importar a leitura num componente de
 * cliente arrastaria a chave de serviço para o pacote do navegador.
 */

/** A forma de um telefone a sério, e a mesma que o `criar_marcacao` exige. */
const digitosMinimos = 9;
const digitosMaximos = 14;

export function normalizarTelefone(bruto: string | null | undefined) {
  return (bruto ?? "").replace(/\D/g, "");
}

export function pareceTelefone(bruto: string | null | undefined) {
  const digitos = normalizarTelefone(bruto);

  return digitos.length >= digitosMinimos && digitos.length <= digitosMaximos;
}

/**
 * Os indicativos do formulário, com Portugal à cabeça.
 *
 * Porque é que isto não é só "351": medido a 2026-10-16, dos 347 contactos do
 * Detail com forma de telefone, 320 são portugueses, 13 brasileiros, 4 do
 * Reino Unido, 2 dos EUA e 8 avulsos. Carimbar 351 em todos estragava o número
 * de 27 clientes reais do Martim. A lista cobre o que ele tem e os vizinhos
 * prováveis; para qualquer outro país escreve-se o número com "+" à frente e o
 * selector deixa de contar.
 */
export const indicativosTelefone = [
  { codigo: "351", pais: "Portugal" },
  { codigo: "55", pais: "Brasil" },
  { codigo: "34", pais: "Espanha" },
  { codigo: "33", pais: "França" },
  { codigo: "44", pais: "Reino Unido" },
  { codigo: "49", pais: "Alemanha" },
  { codigo: "41", pais: "Suíça" },
  { codigo: "39", pais: "Itália" },
  { codigo: "31", pais: "Países Baixos" },
  { codigo: "32", pais: "Bélgica" },
  { codigo: "352", pais: "Luxemburgo" },
  { codigo: "353", pais: "Irlanda" },
  { codigo: "1", pais: "EUA / Canadá" },
  { codigo: "244", pais: "Angola" },
  { codigo: "238", pais: "Cabo Verde" },
  { codigo: "258", pais: "Moçambique" },
] as const;

export const indicativoPorOmissao = "351";

export type TelefoneMontado =
  | { digitos: string; erro: null }
  | { digitos: null; erro: string };

function validarDigitos(digitos: string): TelefoneMontado {
  if (digitos.length < digitosMinimos || digitos.length > digitosMaximos) {
    return {
      digitos: null,
      erro: `Isso não parece um número de telefone: ficaram ${digitos.length} dígitos e um número tem entre ${digitosMinimos} e ${digitosMaximos}. Escreve só o número, sem o indicativo — o país escolhe-se ao lado.`,
    };
  }

  return { digitos, erro: null };
}

/**
 * Junta o indicativo ao número e devolve o número completo, só em dígitos.
 *
 * Isto existe porque um número gravado sem indicativo é um número que o aviso
 * de duplicado nunca mais apanha: `968662120` e `351968662120` são a mesma
 * pessoa e comparam como diferentes. Medido a 2026-10-16, havia exactamente um
 * contacto assim em 347 — criado à mão no painel. Nenhum dos que o agente
 * criou, porque a Meta entrega sempre o número completo. O buraco era só o
 * formulário, e é aqui que se tapa.
 *
 * O que fica gravado é só dígitos, que é a forma em que o agente também grava.
 */
export function montarTelefone(
  indicativoBruto: string,
  numeroBruto: string,
): TelefoneMontado {
  const texto = (numeroBruto ?? "").trim();
  const digitos = normalizarTelefone(texto);
  const indicativo = normalizarTelefone(indicativoBruto);

  if (digitos === "") {
    return { digitos: null, erro: "Escreve o telefone do cliente." };
  }

  // Um "+" ou "00" à frente é a pessoa a dizer "este número já está completo".
  // É a saída sem ambiguidade para um país fora da lista, e por isso ganha ao
  // selector em vez de se somar a ele.
  if (/^(\+|00)/.test(texto)) {
    return validarDigitos(digitos.replace(/^00/, ""));
  }

  if (indicativo === "") {
    return { digitos: null, erro: "Escolhe o país do número." };
  }

  // O zero de saída nacional não faz parte do número internacional.
  const juntos = `${indicativo}${digitos.replace(/^0+/, "")}`;

  // Colou um número que já trazia o indicativo. Dá para perceber porque juntar
  // outra vez passaria do tamanho máximo, e o que ele colou já é válido
  // sozinho. É mais seguro aceitar o que foi colado do que gravar o indicativo
  // em duplicado.
  if (
    juntos.length > digitosMaximos &&
    digitos.startsWith(indicativo) &&
    digitos.length >= digitosMinimos &&
    digitos.length <= digitosMaximos
  ) {
    return validarDigitos(digitos);
  }

  return validarDigitos(juntos);
}

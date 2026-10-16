import { normalizarTelefone } from "@/lib/clientes/telefone";
import { getClientTimezone, instanteAoMeioDiaNoFuso } from "@/lib/clientes/timezone";
import { createServicosClient, getServicosConfig } from "@/lib/servicos/config";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

/**
 * O serviço que o dono regista à mão.
 *
 * Serve os dois momentos: quando mete um cliente novo no painel, e quando um
 * cliente que já lá está volta e faz mais um serviço. O segundo é o caso
 * normal — o Martim também trata do CRM, e um cliente que já tem ficha é
 * precisamente o que volta.
 *
 * Porque é que isto não é uma coluna da ficha
 * -------------------------------------------
 * "Serviço, data e ticket" não é quem a pessoa é — é uma venda. As vendas já
 * vivem em `marcacoes`, na base do PRÓPRIO cliente, e é de lá que a ficha tira
 * o histórico e o total gasto. Uma coluna nova em `lexia_contactos` dava um
 * segundo número ao lado do primeiro, a discordar dele. Por isso isto escreve
 * na mesma tabela onde o agente escreve, com o mesmo contrato.
 *
 * O contrato veio do nó `Criar Marcação` do workflow `criar_marcacao — Detail
 * By Cordeiro` (activo, lido pela API do n8n a 2026-10-16): `tipo` é
 * `servico` ou `avaliacao`, `estado` é `pendente_sinal` ou `confirmada`, e
 * `executor` é `martim` ou `roberto` em minúsculas.
 *
 * Porque é que a data não pode ser no futuro
 * ------------------------------------------
 * Uma marcação futura não é só uma linha: é vista pelo `AGENTE DE LEMBRETES —
 * DETAIL BY CORDEIRO` (activo), que manda uma mensagem ao cliente 24h antes. E
 * as marcações do agente nascem com um evento no Google Calendar, que é de
 * onde sai a disponibilidade do Martim — uma linha escrita aqui não tem esse
 * evento. Deixar passar uma data futura punha o cliente a receber um lembrete
 * de uma hora que não está na agenda de ninguém. Marcar é trabalho da agenda;
 * aqui regista-se o que já aconteceu.
 */

export type CamposDoServico = {
  dataBruto: string;
  executorBruto: string;
  servicoIdBruto: string;
  valorBruto: string;
};

/** Um serviço já validado e com o nome resolvido no catálogo do cliente. */
export type ServicoPreparado = {
  dataInicio: string;
  executor: string | null;
  nome: string;
  valor: number | null;
};

type Preparacao = {
  erro: string | null;
  servico: ServicoPreparado | null;
};

const semServico: Preparacao = { erro: null, servico: null };

function recusar(mensagem: string): Preparacao {
  return { erro: mensagem, servico: null };
}

/**
 * Valida o bloco do serviço e confirma que o serviço é mesmo deste cliente.
 *
 * Corre ANTES de o contacto ser criado, de propósito. São duas bases de dados
 * e não há transacção entre elas: tudo o que possa ser recusado tem de ser
 * recusado enquanto ainda não existe nada, senão um id de serviço mal escrito
 * deixava um contacto criado e um erro no ecrã.
 *
 * O bloco é opcional. Vazio devolve `servico: null` e ninguém escreve nada —
 * nem toda a gente que entra no painel já comprou.
 */
export async function prepararServico({
  campos,
  clienteSlug,
}: {
  campos: CamposDoServico;
  clienteSlug: string;
}): Promise<Preparacao> {
  const servicoId = campos.servicoIdBruto.trim();
  const dia = campos.dataBruto.trim();
  const valorBruto = campos.valorBruto.trim();
  const executorBruto = campos.executorBruto.trim();

  if (servicoId === "" && dia === "" && valorBruto === "") {
    return semServico;
  }

  // Meio preenchido é pior do que vazio: um serviço sem data não entra no
  // histórico por ordem nenhuma, e uma data sem serviço não diz o que foi.
  if (servicoId === "") {
    return recusar("Escolhe o serviço que foi feito.");
  }

  if (dia === "") {
    return recusar("Escolhe a data do serviço.");
  }

  const config = getServicosConfig(clienteSlug);

  if (!config) {
    return recusar("Este cliente não tem agenda de serviços ligada.");
  }

  const dataInicio = instanteAoMeioDiaNoFuso(dia, getClientTimezone(clienteSlug));

  if (!dataInicio) {
    return recusar("A data do serviço não é válida.");
  }

  if (new Date(dataInicio).getTime() > Date.now()) {
    return recusar(
      "A data do serviço não pode ser no futuro. Aqui regista-se o que já foi feito — para marcar, usa a agenda.",
    );
  }

  let valor: number | null = null;

  if (valorBruto !== "") {
    const numero = Number(valorBruto.replace(",", "."));

    if (!Number.isFinite(numero) || numero < 0 || numero > 1_000_000) {
      return recusar("O ticket tem de ser um número igual ou maior que zero.");
    }

    valor = Math.round(numero * 100) / 100;
  }

  let executor: string | null = null;

  if (executorBruto !== "") {
    const conhecido = config.executores.find(
      (linha) => linha.chave === executorBruto,
    );

    if (!conhecido) {
      return recusar("Esse executor não existe.");
    }

    executor = conhecido.chave;
  }

  const externo = createServicosClient(config);

  if (!externo) {
    return recusar("Credenciais da base de dados do cliente não configuradas.");
  }

  // Esta leitura é a autorização sobre o `servicoId`, que veio do navegador:
  // um id que não seja do catálogo desta empresa não aparece aqui. É também de
  // onde sai o nome, porque `marcacoes.servico` guarda o nome e não o id.
  const { data: servico, error } = await externo
    .from(config.catalogoTable)
    .select("id, nome")
    .eq("id", servicoId)
    .maybeSingle();

  if (error) {
    console.error("[clientes] falha a ler o serviço antes de o registar", error);

    return recusar("Não foi possível confirmar o serviço.");
  }

  if (!servico?.nome) {
    return recusar("Serviço desconhecido.");
  }

  return {
    erro: null,
    servico: {
      dataInicio,
      executor,
      nome: String(servico.nome).trim(),
      valor,
    },
  };
}

/** Um serviço que já está na agenda, no nome deste número. */
export type ServicoJaRegistado = {
  dataInicio: string | null;
  estado: string | null;
  id: string;
  nome: string | null;
  valor: number | null;
};

type MarcacaoLida = {
  data_inicio: string | null;
  estado: string | null;
  id: string | number;
  servico: string | null;
  sinal_valor: number | string | null;
  telefone: string | null;
  valor_previsto: number | string | null;
};

function paraNumero(valor: number | string | null) {
  if (valor === null) {
    return null;
  }

  const numero = typeof valor === "number" ? valor : Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

/**
 * O que este número já comprou.
 *
 * Existe para o aviso: antes de registar mais um serviço num cliente que já
 * está no painel, o dono vê o que lá está e decide. Sem isto, carregar duas
 * vezes no botão escrevia a mesma venda duas vezes e o total gasto passava a
 * mentir — e ninguém reparava, porque o número continua a parecer um número.
 *
 * A junção é pelos dígitos do telefone e faz-se aqui, em memória, pela mesma
 * razão que na leitura do painel: são duas bases de dados, não há chave
 * estrangeira, e o mesmo número aparece escrito de maneiras diferentes nas
 * duas. Um `.eq("telefone", …)` deixava passar exactamente as linhas que
 * interessa apanhar.
 *
 * Se a leitura falhar, isto devolve erro e NÃO uma lista vazia. Lista vazia
 * era dizer "este cliente nunca comprou nada" com base numa pergunta que não
 * foi respondida — e a seguir escrever sem aviso nenhum.
 */
export async function servicosJaRegistados({
  clienteSlug,
  telefone,
}: {
  clienteSlug: string;
  telefone: string;
}): Promise<{ erro: string | null; servicos: ServicoJaRegistado[] }> {
  const config = getServicosConfig(clienteSlug);
  const externo = config ? createServicosClient(config) : null;

  if (!externo) {
    return {
      erro: "Este cliente não tem agenda de serviços ligada.",
      servicos: [],
    };
  }

  const { data, error } = await fetchAllSupabaseRows<MarcacaoLida>(
    async (from, to) => {
      const result = await externo
        .from("marcacoes")
        .select(
          "id, telefone, servico, estado, data_inicio, valor_previsto, sinal_valor",
        )
        .eq("cliente_slug", clienteSlug)
        .order("data_inicio", { ascending: false })
        .range(from, to);

      return { data: (result.data ?? []) as MarcacaoLida[], error: result.error };
    },
  );

  if (error) {
    console.error("[clientes] falha a ler o histórico antes de registar", error);

    return {
      erro: "Não foi possível ler o que este cliente já comprou, por isso não se registou nada. Tenta outra vez.",
      servicos: [],
    };
  }

  const digitos = normalizarTelefone(telefone);

  return {
    erro: null,
    servicos: data
      .filter((linha) => normalizarTelefone(linha.telefone) === digitos)
      .map((linha) => ({
        dataInicio: linha.data_inicio,
        estado: linha.estado,
        id: String(linha.id),
        nome: linha.servico,
        // O mesmo critério do painel: o previsto é o total do serviço, o
        // sinal é só o que já entrou. Dois números diferentes para a mesma
        // venda no mesmo ecrã seria pior do que não mostrar nenhum.
        valor: paraNumero(linha.valor_previsto) ?? paraNumero(linha.sinal_valor),
      })),
  };
}

/**
 * Escreve a marcação na base do cliente.
 *
 * Só corre depois de o contacto existir, e só depois de `prepararServico` ter
 * aceitado tudo. O `cliente_slug` vai explícito: tanto a leitura do painel
 * como o workflow de lembretes filtram por ele, e uma linha sem slug é uma
 * linha que ninguém volta a ver.
 *
 * `estado: "confirmada"` porque é um serviço que já aconteceu — é também o
 * único estado que o total gasto conta, já que a leitura só exclui
 * `cancelada`. `data_fim` fica vazio de propósito: a duração real não se sabe
 * e inventá-la era escrever um facto que ninguém mediu.
 */
export async function escreverMarcacao({
  clienteSlug,
  nomeCliente,
  servico,
  telefone,
  viatura,
}: {
  clienteSlug: string;
  nomeCliente: string;
  servico: ServicoPreparado;
  telefone: string;
  viatura: string | null;
}): Promise<{ erro: string | null }> {
  const config = getServicosConfig(clienteSlug);
  const externo = config ? createServicosClient(config) : null;

  if (!externo) {
    return { erro: "Este cliente não tem agenda de serviços ligada." };
  }

  const { error } = await externo.from("marcacoes").insert({
    cliente_slug: clienteSlug,
    data_inicio: servico.dataInicio,
    estado: "confirmada",
    executor: servico.executor,
    nome_cliente: nomeCliente,
    servico: servico.nome,
    telefone,
    tipo: "servico",
    valor_previsto: servico.valor,
    viatura,
  });

  if (error) {
    console.error("[clientes] falha a registar o serviço", error);

    return { erro: "a agenda do cliente recusou a escrita" };
  }

  return { erro: null };
}

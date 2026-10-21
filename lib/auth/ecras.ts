import { redirect } from "next/navigation";

/**
 * Que ecrãs do painel é que cada cliente pode abrir.
 *
 * Porque é que isto existe
 * ------------------------
 * Até aqui o menu era igual para todos: doze ecrãs fixos escritos no layout. Só
 * que há clientes que entram no painel antes de terem lá dentro aquilo que os
 * ecrãs mostram — numa demonstração, por exemplo, a conversa de teste é a única
 * coisa que faz sentido mexer. Mostrar-lhe uma Agenda vazia e um Pipeline vazio
 * não é honesto nem vende nada.
 *
 * Porque é que a lista vive em código e não na base de dados
 * ----------------------------------------------------------
 * Porque um ecrã fechado é uma decisão de produto que acompanha uma versão, e
 * porque não há nada a configurar por quem usa o painel. Se um dia houver, a
 * lista troca-se por uma coluna sem mexer em mais nada: tudo o que o resto do
 * código conhece são as três funções aqui em baixo.
 *
 * A regra do silêncio
 * -------------------
 * Um cliente que não esteja nesta tabela vê tudo, como sempre viu. Acrescentar
 * esta mecânica não podia mudar uma linha do que o Detail e a Miranda vêem, e
 * não muda.
 *
 * Mas o contrário é fechado: um cliente que esteja na tabela com uma lista
 * vazia não vê nada. Uma lista vazia é um erro de quem a escreveu, e um erro de
 * autorização nunca pode cair para o lado de "então deixa entrar". O teste
 * `tests/ecras-por-cliente.test.mts` garante que nenhuma lista está vazia e que
 * nenhuma aponta para um ecrã que não existe — é lá que esse erro é apanhado,
 * não em produção.
 */

/** Todos os ecrãs que existem debaixo de `/app`, incluindo os que não estão no menu. */
export const ECRAS_DO_PAINEL = [
  "/app",
  "/app/pipeline",
  "/app/agenda",
  "/app/analista",
  "/app/campanhas",
  "/app/clientes",
  "/app/servicos",
  "/app/produtos",
  "/app/conversas",
  "/app/area-testes",
  "/app/handoffs",
  "/app/feedbacks",
  "/app/configuracoes",
  "/app/execucoes",
] as const;

export type EcraDoPainel = (typeof ECRAS_DO_PAINEL)[number];

/**
 * Clientes com ecrãs fechados. Quem não estiver aqui vê o painel inteiro.
 *
 * `braz_insurance` é uma demonstração: só a Área de testes, onde a conversa com
 * o agente acontece. O primeiro da lista é também onde o cliente aterra ao
 * entrar, por isso a ordem conta.
 */
const ecrasPorCliente: Record<string, readonly EcraDoPainel[]> = {
  braz_insurance: ["/app/area-testes"],
};

/** Verdadeiro quando o cliente não tem restrição nenhuma configurada. */
export function temOPainelInteiro(clienteSlug: string | null | undefined) {
  return !clienteSlug || !(clienteSlug in ecrasPorCliente);
}

export function ecraPermitido(
  clienteSlug: string | null | undefined,
  ecra: string,
) {
  if (temOPainelInteiro(clienteSlug)) {
    return true;
  }

  return ecrasPorCliente[clienteSlug as string].includes(ecra as EcraDoPainel);
}

/**
 * Onde é que este cliente aterra. Para quem vê o painel inteiro é o Dashboard;
 * para os outros é o primeiro ecrã que lhes resta.
 *
 * Devolve `/login` quando não resta nenhum: assim um erro de configuração
 * expulsa a sessão em vez de a prender num ciclo de reencaminhamentos.
 */
export function ecraDeEntrada(clienteSlug: string | null | undefined) {
  if (temOPainelInteiro(clienteSlug)) {
    return "/app";
  }

  return ecrasPorCliente[clienteSlug as string][0] ?? "/login";
}

/**
 * A guarda que cada página chama. Tem de ser do lado do servidor: esconder o
 * item no menu trava o rato, não trava quem escreve o endereço na barra.
 */
export function exigirEcra(
  clienteSlug: string | null | undefined,
  ecra: EcraDoPainel,
) {
  if (ecraPermitido(clienteSlug, ecra)) {
    return;
  }

  redirect(ecraDeEntrada(clienteSlug));
}

/** Só para o teste poder percorrer o que está configurado. */
export function clientesComEcrasFechados() {
  return Object.entries(ecrasPorCliente);
}

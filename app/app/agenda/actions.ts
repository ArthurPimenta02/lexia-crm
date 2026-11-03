"use server";

import { revalidatePath } from "next/cache";

import {
  marcarNaAgenda,
  prepararNovaMarcacao,
  type ConflitoNaAgenda,
  type FraseParaTraduzir,
} from "@/lib/agenda/marcar";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";

/**
 * Marcar na agenda, a partir do painel do dia.
 *
 * O `cliente_slug` vem sempre do perfil no servidor e nunca do formulário —
 * a mesma regra da ficha de clientes. Aceitar um slug do navegador deixava
 * alguém escrever um evento na agenda do Google de outra empresa.
 *
 * Porque é que há dois avisos e não um
 * ------------------------------------
 * `confirmado` diz que o dono já viu os avisos de horário (é domingo, é fora
 * de horas, são 36 horas seguidas). `ignorar_conflito` diz que já viu o que já
 * estava marcado àquela hora. Se fosse um campo só, confirmar o "é domingo"
 * passava por cima do choque de horários sem ele o chegar a ver — e marcar dois
 * trabalhos ao mesmo tempo é o erro que custa dinheiro.
 */

const caminho = "/app/agenda";

/*
 * Porque é que as mensagens vão em pt-BR e também como frase
 * ---------------------------------------------------------
 * A tradução faz-se no navegador, com o idioma de quem está a ver: o
 * `mensagem`/`avisos` em texto corrido ficam para os testes e para quem lê o
 * resultado sem painel, e o `mensagemFrase`/`avisosFrases` levam a chave do
 * dicionário e as variáveis para o `t()` do formulário.
 */
export type MarcarResultado = {
  /** Coisas que o dono devia ver antes de confirmar. Não travam, avisam. */
  avisos: string[];
  avisosFrases?: FraseParaTraduzir[];
  /** O que já está marcado àquela hora, se houver. */
  conflitos: ConflitoNaAgenda[];
  linkGoogle: string | null;
  mensagem: string;
  mensagemFrase?: FraseParaTraduzir;
  ok: boolean;
};

const vazio = { avisos: [], conflitos: [], linkGoogle: null };

function recusar(
  mensagem: string,
  mensagemFrase: FraseParaTraduzir = { chave: mensagem },
): MarcarResultado {
  return { ...vazio, mensagem, mensagemFrase, ok: false };
}

async function perfilDoCliente() {
  const { profile } = await getLoggedInUserProfile();

  if (
    !profile ||
    !isClientRole(profile.role) ||
    !profile.cliente_slug ||
    profile.role !== "cliente_admin"
  ) {
    return null;
  }

  return { clienteSlug: profile.cliente_slug };
}

export async function marcarNaAgendaAction(
  _anterior: MarcarResultado | null,
  formData: FormData,
): Promise<MarcarResultado> {
  const perfil = await perfilDoCliente();

  if (!perfil) {
    return recusar("Sessão sem permissão para agendar.");
  }

  const texto = (campo: string) => String(formData.get(campo) ?? "");

  const { avisos, erro, erroFrase, marcacao } = await prepararNovaMarcacao({
    campos: {
      contactoId: texto("contacto_id"),
      dataBruto: texto("data"),
      duracaoBruto: texto("duracao"),
      executorBruto: texto("executor"),
      horaBruto: texto("hora"),
      observacoesBruto: texto("observacoes"),
      servicoIdBruto: texto("servico_id"),
      tituloBruto: texto("titulo"),
      valorBruto: texto("valor"),
      viaturaBruto: texto("viatura"),
    },
    clienteSlug: perfil.clienteSlug,
  });

  if (erro || !marcacao) {
    return erro
      ? recusar(erro, erroFrase)
      : recusar("Faltam dados para agendar.");
  }

  const confirmado = texto("confirmado") === "sim";

  // Nada é escrito nesta passagem: os avisos existem para serem lidos antes de
  // o evento entrar na agenda, não depois.
  if (avisos.length > 0 && !confirmado) {
    const umSo = avisos.length === 1;

    return {
      ...vazio,
      avisos: avisos.map((aviso) => aviso.texto),
      avisosFrases: avisos.map((aviso) => aviso.frase ?? { chave: aviso.texto }),
      mensagem: umSo
        ? "Há uma coisa para confirmar antes de agendar."
        : `Há ${avisos.length} coisas para confirmar antes de agendar.`,
      mensagemFrase: umSo
        ? { chave: "Há uma coisa para confirmar antes de agendar." }
        : {
            chave: "Há {n} coisas para confirmar antes de agendar.",
            variaveis: { n: avisos.length },
          },
      ok: false,
    };
  }

  const resultado = await marcarNaAgenda({
    clienteSlug: perfil.clienteSlug,
    ignorarConflito: texto("ignorar_conflito") === "sim",
    marcacao,
  });

  if (resultado.conflitos.length > 0) {
    return {
      ...vazio,
      conflitos: resultado.conflitos,
      mensagem: `${marcacao.executorNome} já tem trabalho marcado neste horário.`,
      mensagemFrase: {
        chave: "{executor} já tem trabalho marcado neste horário.",
        variaveis: { executor: marcacao.executorNome },
      },
      ok: false,
    };
  }

  if (!resultado.ok) {
    return recusar(resultado.erro ?? "O agendamento não entrou.");
  }

  revalidatePath(caminho);

  return {
    ...vazio,
    linkGoogle: resultado.linkGoogle,
    mensagem: `"${marcacao.servicoNome}" ficou agendado para ${marcacao.nomeCliente}.`,
    mensagemFrase: {
      chave: '"{servico}" ficou agendado para {cliente}.',
      variaveis: { cliente: marcacao.nomeCliente, servico: marcacao.servicoNome },
    },
    ok: true,
  };
}

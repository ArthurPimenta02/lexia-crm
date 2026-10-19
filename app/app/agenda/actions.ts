"use server";

import { revalidatePath } from "next/cache";

import {
  marcarNaAgenda,
  prepararNovaMarcacao,
  type ConflitoNaAgenda,
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

export type MarcarResultado = {
  /** Coisas que o dono devia ver antes de confirmar. Não travam, avisam. */
  avisos: string[];
  /** O que já está marcado àquela hora, se houver. */
  conflitos: ConflitoNaAgenda[];
  linkGoogle: string | null;
  mensagem: string;
  ok: boolean;
};

const vazio = { avisos: [], conflitos: [], linkGoogle: null };

function recusar(mensagem: string): MarcarResultado {
  return { ...vazio, mensagem, ok: false };
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
    return recusar("Sessão sem permissão para marcar na agenda.");
  }

  const texto = (campo: string) => String(formData.get(campo) ?? "");

  const { avisos, erro, marcacao } = await prepararNovaMarcacao({
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
    return recusar(erro ?? "Faltam dados para marcar.");
  }

  const confirmado = texto("confirmado") === "sim";

  // Nada é escrito nesta passagem: os avisos existem para serem lidos antes de
  // o evento entrar na agenda, não depois.
  if (avisos.length > 0 && !confirmado) {
    return {
      ...vazio,
      avisos: avisos.map((aviso) => aviso.texto),
      mensagem:
        avisos.length === 1
          ? "Há uma coisa a confirmar antes de marcar."
          : `Há ${avisos.length} coisas a confirmar antes de marcar.`,
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
      mensagem: `${marcacao.executorNome} já tem trabalho marcado a esta hora.`,
      ok: false,
    };
  }

  if (!resultado.ok) {
    return recusar(resultado.erro ?? "A marcação não entrou.");
  }

  revalidatePath(caminho);

  return {
    ...vazio,
    linkGoogle: resultado.linkGoogle,
    mensagem: `"${marcacao.servicoNome}" ficou marcado para ${marcacao.nomeCliente}.`,
    ok: true,
  };
}

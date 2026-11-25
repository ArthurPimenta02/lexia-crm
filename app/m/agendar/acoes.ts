"use server";

import { horariosLivres, resolverContacto } from "@/lib/agenda/agendar-app";
import { marcarEstaLigado, marcarNaAgenda, prepararNovaMarcacao } from "@/lib/agenda/marcar";
import { contextoMovel } from "@/lib/movel/contexto";
import { ehContaDemo } from "@/lib/movel/demo";
import { marcarDemo } from "@/lib/movel/demo-marcar";
import { partesNoFuso } from "@/lib/movel/formato";

export type ResultadoAgendar = { avisos: string[]; conflitos: string[]; erro: string | null; ok: boolean; texto?: string };

/** Os horários livres de um profissional num dia (meia em meia hora). */
export async function livresAgendar(dia: string, executor: string, duracaoMinutos: number): Promise<string[]> {
  const c = await contextoMovel();
  if (!c) return [];
  if (ehContaDemo(c.clienteSlug)) return ["09:00", "10:30", "13:00", "14:30", "16:00"];
  try {
    return await horariosLivres({ clienteSlug: c.clienteSlug, dia, duracaoMinutos, executor });
  } catch (e) {
    console.error("[agendar] horários livres", e);
    return [];
  }
}

/**
 * Marcar pelo "Novo agendamento" do app. A ficha vem escolhida da lista ou é
 * encontrada/criada pelo número (lib/agenda/agendar-app.ts); a validação e a
 * escrita no Google são as mesmas do painel (lib/agenda/marcar.ts).
 *
 * Se a marcação falhar depois de a ficha nova nascer (agenda ocupada, Google
 * sem resposta), a ficha fica: é um cliente real que a pessoa escreveu, e a
 * próxima tentativa encontra-a pelo número em vez de criar outra.
 */
export async function agendarMovel(formData: FormData): Promise<ResultadoAgendar> {
  const c = await contextoMovel();
  if (!c) return { avisos: [], conflitos: [], erro: "Sessão inválida.", ok: false };
  const { t } = c;
  const demo = ehContaDemo(c.clienteSlug);
  if (!demo && !marcarEstaLigado()) return { avisos: [], conflitos: [], erro: t("Marcar pelo app ainda não está ligado."), ok: false };

  const texto = (campo: string) => String(formData.get(campo) ?? "");
  const nomeDigitado = texto("nome").trim();
  const contactoEscolhido = texto("contacto_id").trim();

  // O mínimo antes de tocar em fichas; o resto valida-se logo a seguir.
  if (!contactoEscolhido && (!nomeDigitado || !texto("telefone").trim())) {
    return { avisos: [], conflitos: [], erro: t(!nomeDigitado ? "Escreva o nome do cliente." : "Escreva o telefone do cliente."), ok: false };
  }
  if (!texto("servico_id") || !texto("executor") || !texto("data") || !texto("hora")) {
    return { avisos: [], conflitos: [], erro: t("Escolha o serviço, o dia e o horário."), ok: false };
  }

  const ficha = await resolverContacto({
    clienteSlug: c.clienteSlug,
    contactoId: contactoEscolhido,
    nomeBruto: nomeDigitado,
    origemBruto: texto("origem"),
    origemNotaBruto: texto("origem_nota"),
    telefoneBruto: texto("telefone"),
    userId: c.userId,
  });
  if (!ficha.ok) return { avisos: [], conflitos: [], erro: t(ficha.erro), ok: false };

  if (demo) {
    const erroDemo = await marcarDemo({ clienteSlug: c.clienteSlug, contactoId: ficha.contactoId, dia: texto("data"), duracaoMinutos: Number(texto("duracao")), executor: texto("executor"), fuso: c.fuso, hora: texto("hora"), servicoId: texto("servico_id") });
    return erroDemo ? { avisos: [], conflitos: [], erro: t(erroDemo), ok: false } : { avisos: [], conflitos: [], erro: null, ok: true, texto: t("Marcado!") };
  }

  const { avisos, erro, marcacao } = await prepararNovaMarcacao({
    campos: {
      contactoId: ficha.contactoId,
      dataBruto: texto("data"),
      duracaoBruto: texto("duracao"),
      executorBruto: texto("executor"),
      horaBruto: texto("hora"),
      observacoesBruto: texto("observacao"),
      servicoIdBruto: texto("servico_id"),
      // O título no Google: "Serviço — Nome", como as marcações do painel.
      tituloBruto: `${texto("servico_nome") || "Agendamento"} — ${ficha.nome}`,
      valorBruto: texto("valor"),
      viaturaBruto: "",
    },
    clienteSlug: c.clienteSlug,
  });
  if (erro || !marcacao) return { avisos: [], conflitos: [], erro: t(erro ?? "Faltam dados para agendar."), ok: false };
  if (avisos.length && texto("confirmado") !== "sim") return { avisos: avisos.map((a) => (a.frase ? t(a.frase.chave, a.frase.variaveis) : t(a.texto))), conflitos: [], erro: null, ok: false };

  const r = await marcarNaAgenda({ clienteSlug: c.clienteSlug, ignorarConflito: texto("ignorar_conflito") === "sim", marcacao });
  if (!r.ok) {
    return {
      avisos: [],
      conflitos: r.conflitos.map((x) => [x.inicio && x.fim ? `${partesNoFuso(x.inicio, c.fuso).hora}–${partesNoFuso(x.fim, c.fuso).hora}` : "", x.titulo ?? ""].filter(Boolean).join(" · ")),
      erro: r.conflitos.length ? null : t(r.erro ?? "Não foi possível marcar."),
      ok: false,
    };
  }
  return { avisos: [], conflitos: [], erro: null, ok: true, texto: ficha.criado ? t("Marcado! Ficha de {nome} criada.", { nome: ficha.nome }) : t("Marcado!") };
}

"use server";

import { marcarNaAgenda, marcarEstaLigado, prepararNovaMarcacao } from "@/lib/agenda/marcar";
import { contextoMovel } from "@/lib/movel/contexto";
import { partesNoFuso } from "@/lib/movel/formato";

export type ResultadoMarcarMovel = { ok: boolean; erro: string | null; avisos: string[]; conflitos: string[] };

/**
 * Marcar pelo app: a mesma validação e o mesmo caminho do painel
 * (lib/agenda/marcar.ts). A empresa vem da sessão; o contacto e o serviço são
 * conferidos contra a base dessa empresa antes de qualquer escrita.
 */
export async function marcarMovel(formData: FormData): Promise<ResultadoMarcarMovel> {
  const c = await contextoMovel();
  if (!c) return { avisos: [], conflitos: [], erro: "Sessão inválida.", ok: false };
  if (!marcarEstaLigado()) return { avisos: [], conflitos: [], erro: c.t("Marcar pelo app ainda não está ligado."), ok: false };

  const texto = (campo: string) => String(formData.get(campo) ?? "");
  const { avisos, erro, marcacao } = await prepararNovaMarcacao({
    campos: {
      contactoId: texto("contacto_id"),
      dataBruto: texto("data"),
      duracaoBruto: texto("duracao"),
      executorBruto: texto("executor"),
      horaBruto: texto("hora"),
      observacoesBruto: "",
      servicoIdBruto: texto("servico_id"),
      tituloBruto: "",
      valorBruto: texto("valor"),
      viaturaBruto: "",
    },
    clienteSlug: c.clienteSlug,
  });
  if (erro || !marcacao) return { avisos: [], conflitos: [], erro: c.t(erro ?? "Faltam dados para agendar."), ok: false };
  if (avisos.length && texto("confirmado") !== "sim") return { avisos: avisos.map((a) => c.t(a.texto)), conflitos: [], erro: null, ok: false };

  const r = await marcarNaAgenda({ clienteSlug: c.clienteSlug, ignorarConflito: texto("ignorar_conflito") === "sim", marcacao });
  return {
    avisos: [],
    conflitos: r.conflitos.map((x) => [x.inicio && x.fim ? `${partesNoFuso(x.inicio, c.fuso).hora}–${partesNoFuso(x.fim, c.fuso).hora}` : "", x.titulo ?? ""].filter(Boolean).join(" · ")),
    erro: r.ok ? null : c.t(r.erro ?? "Não foi possível marcar."),
    ok: r.ok,
  };
}

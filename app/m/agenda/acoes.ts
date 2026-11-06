"use server";

import { marcarNaAgenda, marcarEstaLigado, prepararNovaMarcacao } from "@/lib/agenda/marcar";
import { contextoMovel } from "@/lib/movel/contexto";
import { ehContaDemo, instanteNoFuso, SERVICOS_DEMO } from "@/lib/movel/demo";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (ehContaDemo(c.clienteSlug)) return marcarDemo(formData, c.clienteSlug, c.fuso, c.t);
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

/** Conta demo: grava a marcação só na base da Lexia (sem Google), para o revisor ver o fluxo inteiro. */
async function marcarDemo(formData: FormData, clienteSlug: string, fuso: string, t: (s: string) => string): Promise<ResultadoMarcarMovel> {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  const servico = SERVICOS_DEMO.find((s) => s.id === texto("servico_id"));
  const exec = servico?.executores.find((e) => e.chave === texto("executor"));
  const inicio = instanteNoFuso(texto("data"), texto("hora"), fuso);
  if (!servico || !exec || inicio === null) return { avisos: [], conflitos: [], erro: t("Faltam dados para agendar."), ok: false };
  const base = createAdminClient();
  const { data: contacto } = await base.from("lexia_contactos").select("nome, telefone").eq("cliente_slug", clienteSlug).eq("id", texto("contacto_id")).maybeSingle();
  if (!contacto) return { avisos: [], conflitos: [], erro: t("Faltam dados para agendar."), ok: false };
  const agora = new Date().toISOString();
  const { error } = await base.from("lexia_agendamentos").insert({
    cliente_slug: clienteSlug, calendario_id: `demo-${exec.chave}@demo.uselexia.app`, event_id: `demo-app-${crypto.randomUUID()}`,
    inicio: new Date(inicio).toISOString(), fim: new Date(inicio + exec.duracaoMinutos * 60_000).toISOString(), dia_inteiro: false, fuso,
    titulo: `${servico.nome} — ${contacto.nome ?? ""}`, estado: "confirmado", nome_cliente: contacto.nome, telefone: contacto.telefone,
    servico: servico.nome, origem: "manual", executor: exec.chave, valor_previsto: servico.precoBase,
    criado_no_google: agora, actualizado_no_google: agora, sincronizado_em: agora, dados: { demo: true },
  });
  return error ? { avisos: [], conflitos: [], erro: t("Não foi possível marcar."), ok: false } : { avisos: [], conflitos: [], erro: null, ok: true };
}

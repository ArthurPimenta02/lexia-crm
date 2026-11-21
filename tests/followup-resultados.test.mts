import assert from "node:assert/strict";
import { test } from "node:test";

import { calcularResultados, estimarValor, etapaPeloSilencio, textoParaTela } from "../lib/followups/resultados";

const H = 3_600_000;
const T0 = Date.parse("2026-11-01T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const msg = (id: string, ms: number, direccao: string, origem: string, conteudo = "oi") => ({
  conteudo,
  criado_em: iso(ms),
  direccao,
  identificador_conversa: id,
  origem,
});
const marc = (tel: string, ms: number, extra: Record<string, unknown> = {}) => ({
  criado_em: iso(ms),
  criado_no_google: iso(ms),
  estado: "confirmado",
  nome_cliente: "Ana",
  servico: "Full Detail",
  telefone_digitos: tel,
  valor_previsto: 200,
  ...extra,
});
const base = { agora: T0 + 10 * 24 * H, catalogo: null, config: { moeda: "EUR", mensalidade: 100 }, periodo: "tudo" as const };

test("marcação depois de um follow-up conta como recuperada; sem follow-up não conta", () => {
  const r = calcularResultados({
    ...base,
    marcacoes: [marc("351911111111", T0 + 3 * H), marc("351922222222", T0 + 3 * H)],
    mensagens: [
      msg("whatsapp:351911111111", T0, "recebida", "workflow"),
      msg("whatsapp:351911111111", T0 + 0.1 * H, "enviada", "workflow"),
      msg("whatsapp:351911111111", T0 + 1.1 * H, "enviada", "followup_agente", "Ainda quer marcar?"),
      msg("whatsapp:351911111111", T0 + 2 * H, "recebida", "workflow", "Sim, sábado"),
      msg("whatsapp:351922222222", T0, "recebida", "workflow"),
    ],
  });
  assert.equal(r.marcacoesAgente, 2);
  assert.equal(r.recuperadas, 1);
  assert.equal(r.valorRecuperado, 200);
  assert.equal(r.porEtapa["1h"], 1);
  assert.equal(r.clientesReanimados, 1);
  assert.equal(r.historias[0].resposta?.texto, "Sim, sábado");
});

test("marcação cancelada não conta; telefone sem 351 liga pelos 9 dígitos", () => {
  const msgs = [
    msg("whatsapp:351911111111", T0, "enviada", "workflow"),
    msg("whatsapp:351911111111", T0 + 30 * H, "enviada", "followup_agente"),
  ];
  const r = calcularResultados({
    ...base,
    marcacoes: [marc("911111111", T0 + 40 * H), marc("351911111111", T0 + 41 * H, { estado: "cancelado" })],
    mensagens: msgs,
  });
  assert.equal(r.marcacoesAgente, 1);
  assert.equal(r.recuperadas, 1);
  assert.equal(r.porEtapa["24h"], 1);
});

test("Instagram: liga pelo número que o cliente escreveu no chat", () => {
  const r = calcularResultados({
    ...base,
    marcacoes: [marc("351933333333", T0 + 5 * H)],
    mensagens: [
      msg("instagram:178000001", T0, "enviada", "workflow"),
      msg("instagram:178000001", T0 + 1.5 * H, "enviada", "followup_agente"),
      msg("instagram:178000001", T0 + 2 * H, "recebida", "workflow", "o meu número é 933 333 333"),
    ],
  });
  assert.equal(r.recuperadas, 1);
  assert.deepEqual(r.porCanal, { instagram: 1 });
});

test("as conversas da Área de testes não entram", () => {
  const r = calcularResultados({
    ...base,
    marcacoes: [marc("351944444444", T0 + 5 * H)],
    mensagens: [
      msg("teste:abc", T0, "recebida", "workflow", "944444444"),
      msg("teste:abc", T0 + 2 * H, "enviada", "followup_agente"),
    ],
  });
  assert.equal(r.recuperadas, 0);
  assert.equal(r.desde, null);
});

test("etapa pelo silêncio e textos de anexo", () => {
  assert.equal(etapaPeloSilencio(1 * H), "1h");
  assert.equal(etapaPeloSilencio(23 * H), "24h");
  assert.equal(etapaPeloSilencio(72 * H), "3d");
  assert.equal(etapaPeloSilencio(170 * H), "7d");
  assert.equal(textoParaTela("https://x.supabase.co/storage/v1/object/public/audios/fu.mp3"), "[áudio]");
  assert.equal(textoParaTela("Olá"), "Olá");
});

test("estimativa: avaliação vale o tratamento de que se falou; sem nenhum, o preço da consulta", () => {
  const catalogo = [
    { aliases: null, categoria: "avaliacao", nome: "Consulta de Avaliação", nome_en: null, nome_es: null, preco: 40 },
    { aliases: ["laser"], categoria: "laser", nome: "Depilação a Laser", nome_en: "Laser Hair Removal", nome_es: null, preco: 79 },
    { aliases: null, categoria: "facial", nome: "Limpeza de Pele Profunda", nome_en: "Deep Cleansing Facial", nome_es: null, preco: 120 },
  ];
  assert.equal(estimarValor("Consulta de Avaliação", [{ conteudo: "quero fazer depilação a laser" }], catalogo), 79);
  assert.equal(estimarValor("Consulta de Avaliação", [{ conteudo: "I want a deep cleansing facial" }], catalogo), 120);
  assert.equal(estimarValor("Consulta de Avaliação", [{ conteudo: "olá" }], catalogo), 40);
  assert.equal(estimarValor("Limpeza de Pele Profunda", [], catalogo), 120);
});

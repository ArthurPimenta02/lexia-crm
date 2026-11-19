/**
 * Painel de números do Analista Lexia (lib/ajudante/ferramentas/numeros.ts):
 * as contas são código e têm de dar sempre o mesmo, com cada empresa a ver só
 * as suas linhas, e os valores estimados marcados como estimados.
 * Tudo com dados falsos: nenhuma base real, nenhuma IA.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { FakeSupabase } from "./helpers/fake-supabase.mjs";

mock.module("server-only", { namedExports: {} });

const { numerosDoNegocio, numeros, ocupacao, periodoNumeros, MAX_DIAS_NUMEROS } = await import("@/lib/ajudante/ferramentas/numeros");

const A = "miranda_skin_experts"; // a empresa que pergunta
const B = "detail_by_cordeiro"; // a outra, com dados que colidem de propósito
const AGORA = new Date("2026-11-19T12:00:00.000Z");
const FUSO = "Europe/Lisbon"; // UTC+0 em novembro: as horas ISO são as locais
const escopo = (slug: string) => ({ clienteNome: slug, clienteSlug: slug, fuso: FUSO, locale: "pt-BR" });

const ficha = (slug: string, conversa: string, tel: string | null, origem: string | null, criado: string, extra: Record<string, unknown> = {}) => ({
  canal: conversa.split(":")[0], cliente_slug: slug, criado_em: criado, fundido_em: null, identificador_conversa: conversa, nome: null, origem_source_id: null, origem_tipo: origem, telefone_digitos: tel, ...extra,
});
const marc = (slug: string, id: string, o: Record<string, unknown>) => ({
  cliente_slug: slug, criado_em: o.criado_no_google, dia_inteiro: false, estado: "confirmado", executor: "Samuel", fim: null, id, servico: null, telefone_digitos: null, valor_previsto: null, ...o,
});
const msg = (slug: string, conversa: string, criado: string, origem = "workflow", direccao = "recebida") => ({ cliente_slug: slug, criado_em: criado, direccao, identificador_conversa: conversa, origem });

function cenario() {
  return new FakeSupabase({
    lexia_anuncios: [
      { anuncio_externo_id: "ad1", campanha_externa_id: "C1", campanha_nome: "Campanha Verão", cliente_slug: A },
      { anuncio_externo_id: "ad1", campanha_externa_id: "CB", campanha_nome: "Campanha da B", cliente_slug: B },
    ],
    lexia_campanha_custos: [
      { campanha_id: "uuid-c1", cliente_slug: A, dia: "2026-11-05", gasto: 100, moeda: "USD" },
      { campanha_id: "uuid-c1", cliente_slug: A, dia: "2026-11-10", gasto: "50.5", moeda: "USD" }, // numeric vem como texto
      { campanha_id: "uuid-c1", cliente_slug: A, dia: "2026-10-25", gasto: 40, moeda: "USD" }, // período anterior
      { campanha_id: "uuid-c1", cliente_slug: A, dia: "2026-11-17", gasto: 999, moeda: "USD" }, // depois do período
      { campanha_id: "uuid-c1", cliente_slug: B, dia: "2026-11-05", gasto: 1000, moeda: "EUR" }, // da outra empresa
    ],
    lexia_campanhas: [
      { campanha_externa_id: "C1", cliente_slug: A, id: "uuid-c1", nome: "Campanha Verão" },
      { campanha_externa_id: "CB", cliente_slug: B, id: "uuid-cb", nome: "Campanha da B" },
    ],
    lexia_contactos: [
      ficha(A, "whatsapp:351911000001", "351911000001", "ctwa", "2026-11-02T10:00:00.000Z", { origem_source_id: "ad1" }),
      ficha(A, "whatsapp:351911000002", "351911000002", "organico", "2026-11-03T10:00:00.000Z"),
      ficha(A, "instagram:999", null, "instagram_ad", "2026-11-04T10:00:00.000Z"),
      ficha(A, "whatsapp:351911000004", "351911000004", "ctwa", "2026-10-20T10:00:00.000Z", { origem_source_id: "ad1" }),
      ficha(A, "teste:xyz", "351911000009", "ctwa", "2026-11-05T10:00:00.000Z"), // Área de testes: não conta
      ficha(A, "whatsapp:351911000006", "351911000006", "ctwa", "2026-11-05T10:00:00.000Z", { fundido_em: "2026-11-06T00:00:00.000Z" }), // fundida: não conta
      // A outra empresa tem o MESMO telefone, mais antigo e orgânico: se vazasse, mudava a origem do f1.
      ficha(B, "whatsapp:351911000001", "351911000001", "organico", "2026-10-01T10:00:00.000Z"),
      ficha(B, "whatsapp:351922000001", "351922000001", "ctwa", "2026-11-03T10:00:00.000Z", { origem_source_id: "ad1" }),
    ],
    lexia_agendamentos: [
      marc(A, "m1", { criado_no_google: "2026-11-02T12:00:00.000Z", fim: "2026-11-06T11:00:00.000Z", inicio: "2026-11-06T10:00:00.000Z", servico: "Limpeza de Pele", telefone_digitos: "351911000001", valor_previsto: 80 }),
      marc(A, "m2", { criado_no_google: "2026-11-04T12:00:00.000Z", fim: "2026-11-08T11:00:00.000Z", inicio: "2026-11-08T10:00:00.000Z", servico: "Depilação a  laser", telefone_digitos: "911000002" }), // sem valor: estimado pela tabela; 9 dígitos sem indicativo
      marc(A, "m3", { criado_no_google: "2026-11-05T12:00:00.000Z", fim: "2026-11-09T11:00:00.000Z", inicio: "2026-11-09T10:00:00.000Z" }), // sem telefone, sem serviço
      marc(A, "m4", { criado_no_google: "2026-11-06T12:00:00.000Z", estado: "cancelado", fim: "2026-11-12T11:00:00.000Z", inicio: "2026-11-12T10:00:00.000Z", telefone_digitos: "351911000001", valor_previsto: 500 }),
      marc(A, "m5", { criado_no_google: "2026-11-10T12:00:00.000Z", fim: "2026-11-25T11:00:00.000Z", inicio: "2026-11-25T10:00:00.000Z", servico: "Consulta", telefone_digitos: "351911000002", valor_previsto: "50" }), // futura
      marc(A, "m6", { criado_no_google: "2026-10-22T12:00:00.000Z", fim: "2026-10-28T11:00:00.000Z", inicio: "2026-10-28T10:00:00.000Z", telefone_digitos: "351911000004", valor_previsto: 60 }), // período anterior
      marc(A, "m7", { criado_no_google: "2026-11-03T12:00:00.000Z", dia_inteiro: true, fim: "2026-11-07T00:00:00.000Z", inicio: "2026-11-06T00:00:00.000Z" }), // dia inteiro: não é marcação
      marc(B, "b1", { criado_no_google: "2026-11-03T12:00:00.000Z", executor: "martim", fim: "2026-11-06T15:00:00.000Z", inicio: "2026-11-06T14:00:00.000Z", servico: "Polimento", telefone_digitos: "351911000001", valor_previsto: 999 }),
      marc(B, "b2", { criado_no_google: "2026-11-03T12:00:00.000Z", executor: "martim", fim: "2026-11-07T15:00:00.000Z", inicio: "2026-11-07T14:00:00.000Z", servico: "Lavagem Express", telefone_digitos: "351922000001" }),
    ],
    lexia_eventos: [],
    lexia_mensagens: [
      msg(A, "whatsapp:351911000001", "2026-11-02T10:00:00.000Z"),
      msg(A, "whatsapp:351911000001", "2026-11-02T10:01:00.000Z", "workflow", "enviada"), // enviada: não é conversa
      msg(A, "whatsapp:351911000002", "2026-11-03T10:00:00.000Z", "recebida_na_pausa"),
      msg(A, "instagram:999", "2026-11-04T10:00:00.000Z"),
      msg(A, "teste:xyz", "2026-11-05T10:00:00.000Z"),
      msg(A, "whatsapp:351911000004", "2026-10-20T10:00:00.000Z"),
      // esperas de hoje (fora do período das contas)
      msg(A, "whatsapp:351911000002", "2026-11-19T07:00:00.000Z", "recebida_na_pausa"), // há 5 h, sem resposta
      msg(A, "whatsapp:351911000001", "2026-11-19T08:00:00.000Z", "recebida_na_pausa"),
      msg(A, "whatsapp:351911000001", "2026-11-19T09:00:00.000Z", "humano", "enviada"), // respondida
      msg(A, "instagram:999", "2026-11-19T11:30:00.000Z", "recebida_na_pausa"), // só há 30 min
      msg(B, "whatsapp:351911000001", "2026-11-04T10:00:00.000Z", "recebida_na_pausa"),
      msg(B, "whatsapp:351922000001", "2026-11-19T06:00:00.000Z", "recebida_na_pausa"),
    ],
  });
}

/** As bases próprias: a tabela de serviços da Miranda e as `marcacoes` + tabela do Detail. */
function basesProprias() {
  const pedidas: string[] = [];
  const miranda = new FakeSupabase({
    servicos_miranda: [
      { ativo: true, nome: "Depilação a Laser", preco: 120 },
      { ativo: false, nome: "Depilação a Laser", preco: 10 }, // inactivo repetido: perde para o activo
      { ativo: true, nome: "Consulta", preco: 30 },
    ],
  });
  const detail = new FakeSupabase({
    agendamento_servicos: [{ activo: true, nome: "Lavagem Express", preco_base: 35 }],
    marcacoes: [
      { cliente_slug: B, data_inicio: "2026-11-06T09:00:00.000Z", estado: "confirmada", telefone: "+351 911 000 001", valor_previsto: 300 },
      { cliente_slug: "outro", data_inicio: "2026-11-07T09:00:00.000Z", estado: "confirmada", telefone: "351922000001", valor_previsto: 7777 },
    ],
  });
  // `as never`: o duplo só tem o que estas leituras usam, não o tipo inteiro do cliente da Supabase.
  return { baseDoCliente: (prefixo: string) => { pedidas.push(prefixo); return (prefixo === "MIRANDA" ? miranda : prefixo === "DETAIL_BY_CORDEIRO" ? detail : null) as never; }, detail, miranda, pedidas };
}

const args = (o: Record<string, unknown> = {}) => ({ agrupar_por: "nenhum", ate: "2026-11-15", comparar_com_periodo_anterior: true, de: "2026-11-01", ...o });

test("contas certas no total: leads, marcados, realizados, cancelados, faturamento real+estimado, gasto, CPL e CAC", async () => {
  const base = cenario();
  const { baseDoCliente } = basesProprias();
  const r = await numerosDoNegocio(escopo(A), args(), { agora: AGORA, base: base as never, baseDoCliente });
  const t = r.numeros.total;
  assert.deepEqual(r.periodo, { ate: "2026-11-15", de: "2026-11-01", dias: 15 });
  assert.deepEqual(r.periodo_anterior, { ate: "2026-10-31", de: "2026-10-17" });
  assert.equal(t.leads_novos, 3); // sem a Área de testes e sem a fundida
  assert.equal(t.leads_de_anuncio, 2);
  assert.equal(t.leads_que_marcaram, 2);
  assert.equal(t.conversao_lead_para_agendamento_pct, 66.7);
  assert.equal(t.conversas, 3);
  assert.equal(t.conversas_com_pessoa, 1);
  assert.equal(t.agendamentos_marcados, 4); // m1, m2, m3, m5 (m4 cancelada, m7 dia inteiro)
  assert.equal(t.agendamentos_marcados_de_anuncio, 1);
  assert.equal(t.realizados, 3); // m5 é futura
  assert.equal(t.cancelados, 1);
  assert.equal(t.faltas, null);
  assert.deepEqual(t.faturamento_dos_realizados, { estimado: 120, marcacoes_com_valor_estimado: 1, marcacoes_com_valor_real: 1, marcacoes_sem_valor: 1, real: 80, total: 200 });
  assert.deepEqual(t.valor_dos_marcados, { estimado: 120, marcacoes_com_valor_estimado: 1, marcacoes_com_valor_real: 2, marcacoes_sem_valor: 1, real: 130, total: 250 });
  assert.equal(t.gasto_anuncios, 150.5);
  assert.equal(t.custo_por_lead_de_anuncio, 75.25);
  assert.equal(t.cac_por_agendamento_de_anuncio, 150.5);
  assert.equal(t.cac_sobre_todos_os_agendamentos, 37.63);
  assert.equal(t.custo_por_lead_todos, 50.17);
  assert.equal(r.moeda, "USD");
  const at = r.numeros.atribuicao_dos_agendamentos_marcados;
  assert.deepEqual({ ...at, nota: undefined }, { de_anuncio: 1, nota: undefined, organico: 2, origem_desconhecida: 0, sem_ficha: 1 });
  assert.match(at.nota, /MÍNIMO/);
  // variação face ao período anterior
  const v = r.numeros.variacao_total!;
  assert.deepEqual(v.leads_novos, { agora: 3, antes: 1, diferenca: 2, pct: 200 });
  assert.deepEqual(v.gasto_anuncios, { agora: 150.5, antes: 40, diferenca: 110.5, pct: 276.3 });
  assert.deepEqual(v.faturamento_dos_realizados, { agora: 200, antes: 60, diferenca: 140, pct: 233.3 });
});

test("o mesmo pedido dá sempre o mesmo número", async () => {
  const { baseDoCliente } = basesProprias();
  const a = await numerosDoNegocio(escopo(A), args({ agrupar_por: "origem" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const b = await numerosDoNegocio(escopo(A), args({ agrupar_por: "origem" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.deepEqual(a, b);
});

test("por origem: atribuído vs sem ficha, e o bloco das origens pagas com o gasto", async () => {
  const { baseDoCliente } = basesProprias();
  const r = await numerosDoNegocio(escopo(A), args({ agrupar_por: "origem" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const g = Object.fromEntries((r.numeros.grupos ?? []).map((x) => [x.grupo, x]));
  assert.equal(g.ctwa.leads_novos, 1);
  assert.equal(g.ctwa.agendamentos_marcados, 1);
  assert.equal(g.organico.agendamentos_marcados, 2);
  assert.equal(g.instagram_ad.leads_novos, 1);
  assert.equal(g.instagram_ad.agendamentos_marcados, 0);
  const semFicha = Object.keys(g).find((k) => k.startsWith("sem ficha"))!;
  assert.equal(g[semFicha].agendamentos_marcados, 1);
  assert.equal("gasto_anuncios" in g.ctwa, false, "o gasto da Meta não se divide por tipo de origem");
  assert.deepEqual(r.numeros.todas_as_origens_pagas, { agendamentos_marcados: 1, cac_por_agendamento_de_anuncio: 150.5, custo_por_lead_de_anuncio: 75.25, gasto_anuncios: 150.5, leads_novos: 2, origens: ["ctwa", "instagram_ad", "messenger_ad", "anuncio"] });
  // a soma dos grupos bate com o total
  const soma = (k: "agendamentos_marcados" | "realizados" | "cancelados") => (r.numeros.grupos ?? []).reduce((s, x) => s + x[k], 0);
  assert.equal(soma("agendamentos_marcados"), r.numeros.total.agendamentos_marcados);
  assert.equal(soma("realizados"), r.numeros.total.realizados);
  assert.equal(soma("cancelados"), r.numeros.total.cancelados);
});

test("por campanha: gasto e CAC só nas campanhas; o resto não leva gasto inventado", async () => {
  const { baseDoCliente } = basesProprias();
  const r = await numerosDoNegocio(escopo(A), args({ agrupar_por: "campanha" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const g = Object.fromEntries((r.numeros.grupos ?? []).map((x) => [x.grupo, x as Record<string, unknown>]));
  assert.equal(g["Campanha Verão"].gasto_anuncios, 150.5);
  assert.equal(g["Campanha Verão"].leads_novos, 1);
  assert.equal(g["Campanha Verão"].agendamentos_marcados, 1);
  assert.equal(g["Campanha Verão"].cac_por_agendamento_de_anuncio, 150.5);
  assert.equal(g["anúncio sem campanha identificada"].leads_novos, 1);
  assert.equal("gasto_anuncios" in g["anúncio sem campanha identificada"], false);
  assert.equal(g["Campanha da B"], undefined);
});

test("por serviço e por dia/semana", async () => {
  const { baseDoCliente } = basesProprias();
  const s = await numerosDoNegocio(escopo(A), args({ agrupar_por: "servico" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const g = Object.fromEntries((s.numeros.grupos ?? []).map((x) => [x.grupo, x as Record<string, unknown>]));
  assert.equal(g["Depilação a  laser"].realizados, 1);
  assert.equal((g["Depilação a  laser"].faturamento_dos_realizados as { estimado: number }).estimado, 120);
  assert.equal("leads_novos" in g["Consulta"], false, "um lead ainda não tem serviço");
  assert.equal(s.numeros.total.leads_novos, 3, "mas o total continua a ter os leads");
  const d = await numerosDoNegocio(escopo(A), args({ agrupar_por: "dia" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const dias = (d.numeros.grupos ?? []).map((x) => x.grupo);
  assert.deepEqual(dias, [...dias].sort());
  const dia5 = (d.numeros.grupos ?? []).find((x) => x.grupo === "2026-11-05") as Record<string, unknown>;
  assert.equal(dia5.gasto_anuncios, 100);
  const w = await numerosDoNegocio(escopo(A), args({ agrupar_por: "semana" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  const semana = (w.numeros.grupos ?? []).find((x) => x.grupo === "2026-11-02") as Record<string, unknown>; // segunda-feira
  assert.equal(semana.gasto_anuncios, 100);
  assert.equal(semana.leads_novos, 3);
});

test("isolamento: cada leitura central leva o filtro da empresa e nada da outra entra nas contas", async () => {
  const base = cenario();
  const { baseDoCliente } = basesProprias();
  await numerosDoNegocio(escopo(A), args({ agrupar_por: "campanha" }), { agora: AGORA, base: base as never, baseDoCliente });
  assert.ok(base.registos.length >= 7);
  for (const r of base.registos) {
    assert.ok(r.filtros.some((f) => f.coluna === "cliente_slug" && f.valor === A), `${r.tabela} sem filtro da empresa`);
    assert.ok(!r.filtros.some((f) => f.coluna === "cliente_slug" && f.valor !== A), `${r.tabela} com outra empresa`);
  }
  // E a B, com o mesmo cenário, vê só o que é dela.
  const rb = await numerosDoNegocio(escopo(B), args(), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.equal(rb.numeros.total.leads_novos, 1);
  assert.equal(rb.numeros.total.gasto_anuncios, 1000); // o custo é da B (cliente_slug), mesmo apontando para um id de campanha igual ao da A
  assert.equal(rb.numeros.total.agendamentos_marcados, 2);
  assert.equal(rb.moeda, "EUR");
});

test("isolamento do gasto: o custo conta pela empresa, nunca pelo id da campanha", async () => {
  const { baseDoCliente } = basesProprias();
  const rb = await numerosDoNegocio(escopo(B), args({ agrupar_por: "campanha" }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.equal(rb.numeros.total.gasto_anuncios, 1000);
  const ra = await numerosDoNegocio(escopo(A), args(), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.equal(ra.numeros.total.gasto_anuncios, 150.5);
});

test("Detail: valor real da base própria (marcacoes) pelo telefone e dia; estimado pela tabela; só as marcações dele", async () => {
  const { baseDoCliente, detail, pedidas } = basesProprias();
  const r = await numerosDoNegocio(escopo(B), args(), { agora: AGORA, base: cenario() as never, baseDoCliente });
  // b1 tem valor_previsto 999 no espelho: o real do espelho ganha. b2 não tem valor: a `marcacoes` com 7777 é de OUTRA empresa, por isso vai à tabela (35).
  assert.deepEqual(r.numeros.total.faturamento_dos_realizados, { estimado: 35, marcacoes_com_valor_estimado: 1, marcacoes_com_valor_real: 1, marcacoes_sem_valor: 0, real: 999, total: 1034 });
  assert.ok(pedidas.includes("DETAIL_BY_CORDEIRO"));
  const lidas = detail.registos.filter((x) => x.tabela === "marcacoes");
  assert.ok(lidas.length && lidas.every((x) => x.filtros.some((f) => f.coluna === "cliente_slug" && f.valor === B)));
  assert.match(r.tabela_de_precos, /ligada/);
});

test("Detail: sem valor no espelho, usa o valor da marcacoes da base própria (real, não estimado)", async () => {
  const base = cenario();
  base.substituir("lexia_agendamentos", [marc(B, "b1", { criado_no_google: "2026-11-03T12:00:00.000Z", executor: "martim", fim: "2026-11-06T15:00:00.000Z", inicio: "2026-11-06T14:00:00.000Z", servico: "Lavagem Express", telefone_digitos: "351911000001" })]);
  const { baseDoCliente } = basesProprias();
  const r = await numerosDoNegocio(escopo(B), args(), { agora: AGORA, base: base as never, baseDoCliente });
  assert.deepEqual(r.numeros.total.faturamento_dos_realizados, { estimado: 0, marcacoes_com_valor_estimado: 0, marcacoes_com_valor_real: 1, marcacoes_sem_valor: 0, real: 300, total: 300 });
});

test("sem credenciais da base própria: nada estimado, e o resultado diz porquê", async () => {
  const r = await numerosDoNegocio(escopo(A), args(), { agora: AGORA, base: cenario() as never, baseDoCliente: () => null });
  assert.equal(r.numeros.total.faturamento_dos_realizados.marcacoes_com_valor_estimado, 0);
  assert.equal(r.numeros.total.faturamento_dos_realizados.marcacoes_sem_valor, 2);
  assert.match(r.tabela_de_precos, /não disponível/);
});

test("leads quentes sem resposta: à espera há mais de X horas, respondidas fora, só da empresa", async () => {
  const { baseDoCliente } = basesProprias();
  const r = await numerosDoNegocio(escopo(A), args({ horas_sem_resposta: 2 }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.equal(r.leads_quentes_sem_resposta.total, 1);
  assert.equal(r.leads_quentes_sem_resposta.conversas[0].conversa, "whatsapp:351911000002");
  assert.equal(r.leads_quentes_sem_resposta.conversas[0].espera_ha_horas, 5);
  const r0 = await numerosDoNegocio(escopo(A), args({ horas_sem_resposta: 0 }), { agora: AGORA, base: cenario() as never, baseDoCliente });
  assert.equal(r0.leads_quentes_sem_resposta.total, 2); // + a do Instagram (30 min)
});

test("ocupação: horas abertas pelo horário de cada um, sobreposições contam uma vez, corta à janela", () => {
  const m = (executor: string, inicio: string, fim: string, extra: Record<string, unknown> = {}) => ({ criado_no_google: null, dia_inteiro: false, estado: "confirmado", executor, fim, id: `${executor}${inicio}`, inicio, servico: null, telefone_digitos: null, valor_previsto: null, ...extra });
  const o = ocupacao(B, [
    m("martim", "2026-11-16T10:00:00.000Z", "2026-11-16T12:00:00.000Z"),
    m("martim", "2026-11-16T11:00:00.000Z", "2026-11-16T13:00:00.000Z"), // sobrepõe 1 h
    m("martim", "2026-11-16T17:00:00.000Z", "2026-11-16T20:00:00.000Z"), // só 1 h dentro (fecha às 18)
    m("martim", "2026-11-16T14:00:00.000Z", "2026-11-16T15:00:00.000Z", { estado: "cancelado" }),
    m("roberto", "2026-11-16T00:00:00.000Z", "2026-11-17T00:00:00.000Z", { dia_inteiro: true }),
  ], FUSO, "2026-11-16", 1); // segunda-feira
  assert.equal(o.disponivel, true);
  if (!o.disponivel) return;
  const p = Object.fromEntries(o.por_profissional.map((x) => [x.profissional, x]));
  assert.deepEqual(p.martim, { horas_abertas: 9, horas_marcadas: 4, ocupacao_pct: 44.4, profissional: "martim" });
  assert.deepEqual(p.roberto, { horas_abertas: 8, horas_marcadas: 0, ocupacao_pct: 0, profissional: "roberto" });
  const domingo = ocupacao(B, [], FUSO, "2026-11-15", 1);
  assert.equal(domingo.disponivel && domingo.total_horas_abertas, 0);
  const semHorario = ocupacao("claudia_leite_spa", [], FUSO, "2026-11-16");
  assert.equal(semHorario.disponivel, false);
});

test("período: por omissão 30 dias, no máximo 180, nunca invertido nem no futuro", () => {
  assert.deepEqual(periodoNumeros({}, "2026-11-19"), { ate: "2026-11-19", de: "2026-10-21" });
  assert.deepEqual(periodoNumeros({ ate: "2026-01-01", de: "2026-11-19" }, "2026-11-19"), { ate: "2026-11-19", de: "2026-05-24" });
  assert.equal(MAX_DIAS_NUMEROS, 180);
  assert.deepEqual(periodoNumeros({ ate: "2027-01-01", de: "2026-11-10" }, "2026-11-19"), { ate: "2026-11-19", de: "2026-11-10" });
});

test("a definição segue o formato das outras ferramentas", () => {
  const f = numeros.numeros_do_negocio;
  assert.equal(typeof f.executar, "function");
  assert.equal(typeof f.descricao, "string");
  assert.equal(typeof f.rotulo, "string");
  assert.equal(f.parametros.type, "object");
  assert.equal(f.parametros.additionalProperties, false);
  assert.deepEqual(f.parametros.properties.agrupar_por.enum, ["canal", "origem", "campanha", "servico", "dia", "semana", "nenhum"]);
});

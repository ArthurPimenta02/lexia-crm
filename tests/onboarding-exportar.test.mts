/**
 * A passagem automática da Etapa 3: a ficha do onboarding vira as 5 tabelas da base PRÓPRIA do agente do cliente.
 *
 * O que se guarda aqui (regras do Arthur, 24/11/2026):
 *  - não perder NADA: cada resposta resolvida tem destino; uma sem destino faz a exportação falhar com a lista;
 *    a ficha inteira vai sempre para a config como JSON;
 *  - só entra o que a cliente confirmou (rascunho não; pulado/vago/não se aplica tratados à parte);
 *  - correr duas vezes não duplica nem muda ids; item removido → ativo=false; nada é apagado;
 *  - cada cliente é separado: a gravação só vai para a conexão `supabase_cliente` do próprio slug;
 *  - só a equipe da Lexia faz prévia ou grava.
 * Sem IA real e sem rede: a IA é um duplo injetado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

// ------------------------------------------------------------------ duplos (antes de importar o código)

process.env.LEXIA_CONEXOES_CHAVE = Buffer.alloc(32, 7).toString("base64");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://central.supabase.co";

/** As bases dos clientes, por URL: o `criarCliente` injetado devolve a base desse URL (nunca há rede). */
const basesPorUrl = new Map<string, FakeSupabase>();
const abertas: string[] = [];
const criarCliente = (url: string, chave: string) => {
  abertas.push(url);
  const b = basesPorUrl.get(url);
  if (!b) throw new Error(`base inesperada: ${url}`);
  assert.equal(chave, `chave-${url === "https://kglow.supabase.co" ? SLUG : "?"}`, "a chave decifrada é a do próprio cliente");
  return b as never;
};
let perfil: { role: string; cliente_slug: string | null; status: string } | null = null;
let central: FakeSupabase = new FakeSupabase();

mock.module("server-only", { defaultExport: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/i18n/servidor", { namedExports: { getT: async () => (s: string) => s } });
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => (perfil ? { user: { id: "u1" }, profile: perfil } : { user: null, profile: null }),
    isClientRole: (r: string) => r === "cliente_admin" || r === "cliente_operador",
  },
});
mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => central } });

const { converter, exportar, limparNomeDoServico, minutos, numero, precoFalado, clienteDaExportacao } = await import("@/lib/onboarding/exportar");
type IaDaExportacao = import("@/lib/onboarding/exportar").IaDaExportacao;
const { gravarExportacao, gravarNaBaseDoAgente, previaDaBaseDoAgente, abrirBaseDoCliente } = await import("@/lib/onboarding/exportar-base");
const { cifrar } = await import("@/lib/conexoes/cifra");
const { montarCaderno, resumir } = await import("@/lib/onboarding/caderno");
const { ESQUEMA_ONBOARDING } = await import("@/lib/onboarding/esquema");
type LinhaDoCaderno = import("@/lib/onboarding/caderno").LinhaDoCaderno;
type ItemDoCaderno = import("@/lib/onboarding/caderno").ItemDoCaderno;

// ------------------------------------------------------------------ a cópia real da Kelly (24/11), como se ela tivesse confirmado tudo

const COPIA = JSON.parse(readFileSync(new URL("./fixtures/onboarding-kglow-2026-11-24.json", import.meta.url), "utf8")) as { etapa1: { notas: string; site: string }; itens: ItemDoCaderno[]; linhas: LinhaDoCaderno[] };
const SLUG = "kglow_aesthetics";
const HOJE = "2026-11-24";
const AGORA = "2026-11-24T15:00:00.000Z";
const confirmadas = (): LinhaDoCaderno[] => COPIA.linhas.map((l) => ({ ...l, estado: "confirmado" }));
const itens = (): ItemDoCaderno[] => COPIA.itens.map((i) => ({ ...i }));
const entrada = (linhas = confirmadas(), its = itens()) => ({ clienteSlug: SLUG, linhas, itens: its, etapa1: COPIA.etapa1, hoje: HOJE, agora: AGORA });
const idDoServico = (ex: ReturnType<typeof converter>, nome: string) => ex.servicos.find((s) => s.nome === nome)!.origem_item_id;

/** Responde a tudo o que é obrigatório e ainda falta (como se a entrevista tivesse acabado), até a ficha poder ser aprovada. */
function completar(linhas: LinhaDoCaderno[], its: ItemDoCaderno[]): LinhaDoCaderno[] {
  const out = [...linhas];
  for (let volta = 0; volta < 6; volta++) {
    const r = resumir(montarCaderno(out, its), its);
    if (!r.bloqueiam.length) break;
    for (const c of r.bloqueiam) {
      const f = c.campo;
      const opcoes = (f.opcoes ?? []).filter((o) => !/^outr/i.test(o) && !/texto próprio|___/i.test(o));
      const valor =
        f.tipo === "multi" ? [opcoes[0] ?? "x"]
        : f.tipo === "radio" || f.tipo === "select" ? (f.chave === "idioma_padrao" ? "Inglês" : f.chave === "avaliacao_paga" ? "Gratuita" : f.chave === "tipo_de_validade" ? "Data" : opcoes[0] ?? "x")
        : f.tipo === "number" ? "100"
        : f.tipo === "phone" ? "+12155550100"
        : f.tipo === "date" ? "2026-12-31"
        : f.tipo === "duracao" ? "30 min"
        : f.tipo === "horarios" ? { Seg: ["10:00", "16:00"] }
        : `resposta de teste: ${f.chave}`;
      const i = out.findIndex((l) => l.campo === f.chave && l.item_id === c.itemId);
      const nova = { campo: f.chave, item_id: c.itemId, valor, estado: "respondido" as const, fonte: "cliente", perguntas: 1 };
      if (i >= 0) out[i] = nova;
      else out.push(nova);
    }
  }
  return out;
}

// ------------------------------------------------------------------ regras soltas

test("regras: nome limpo, número, duração, preço falado", () => {
  assert.equal(limparNomeDoServico("✨ Precision Tox  — Glabella (Frown / 11s)").nome, "Precision Tox — Glabella (Frown / 11s)");
  assert.equal(limparNomeDoServico("Lip Filler 💋").nome, "Lip Filler");
  const longo = limparNomeDoServico("✨ Glow Duo -2 Areas... Glabella (11s/frown lines) paired with either the forehead (frontalis) or crow’s feet.");
  assert.equal(longo.nome, "Glow Duo -2 Areas");
  assert.match(longo.original ?? "", /paired with/);
  assert.equal(numero("1,100"), 1100);
  assert.equal(numero("1.100"), 1100);
  assert.equal(numero("US$ 9 por unidade"), 9);
  assert.equal(numero("9,50"), 9.5);
  assert.deepEqual(minutos("45 min"), { min: 45, exato: true });
  assert.equal(minutos("1h").min, 60);
  assert.equal(minutos("1h10").min, 70);
  assert.equal(minutos("1h30").min, 90);
  assert.deepEqual(minutos("30–45 min"), { min: 45, exato: false });
  assert.equal(minutos("menos de 30 minutos").min, null);
  assert.equal(precoFalado({ preco: 9, tipo_preco: "por_unidade", modo_preco: "se_perguntar", variacao_preco: null }), "US$ 9 por unidade (só se perguntarem)");
  assert.equal(precoFalado({ preco: 0, tipo_preco: "fixo", modo_preco: "se_perguntar", variacao_preco: null }), "gratuita (só se perguntarem)");
});

test("só clientes do mapa explícito têm sufixo: a Jessica e um slug qualquer são recusados", () => {
  assert.equal(clienteDaExportacao(SLUG)?.sufixo, "kglow");
  assert.equal(clienteDaExportacao("jessica_beauty"), null);
  assert.equal(clienteDaExportacao("constructor"), null);
  assert.throws(() => converter({ ...entrada(), clienteSlug: "jessica_beauty" }), /não tem tabelas configuradas/);
});

// ------------------------------------------------------------------ a cópia real da Kelly

test("Kelly (tudo confirmado): linhas-chave dos serviços", () => {
  const ex = converter(entrada());
  assert.equal(ex.tabelas.servicos, "servicos_kglow");
  assert.equal(ex.servicos.length, 51);
  assert.equal(ex.removidos.servicos.length, 9);
  assert.ok(!ex.servicos.some((s) => s.nome === "Dysport"), "removido não entra");

  const glabella = ex.servicos.find((s) => s.nome === "Precision Tox — Glabella (Frown / 11s)")!;
  assert.equal(glabella.preco, 210);
  // Na cópia de 24/11 o tipo deste serviço é "A partir de (preço mínimo)" (vem do Moxie, ainda por confirmar).
  assert.equal(glabella.tipo_preco, "a_partir");
  assert.equal(glabella.duracao_min, 45);
  assert.equal(glabella.nome_en, glabella.nome);
  assert.equal(glabella.profissional, "Kelly Soares");
  assert.equal(glabella.modo_preco, "se_perguntar");
  assert.equal(ex.precoFalado[glabella.origem_item_id], "a partir de US$ 210 (só se perguntarem)");
  assert.match(glabella.preparo_e_cuidados ?? "", /maquiagem/);

  const brow = ex.servicos.find((s) => s.nome === "Brow lift")!;
  assert.deepEqual([brow.preco, brow.tipo_preco, brow.duracao_min], [110, "fixo", 20]);

  const oferta = ex.servicos.find((s) => s.nome.startsWith("FB/IG New Patient"))!;
  assert.equal(oferta.tipo_preco, "por_unidade");
  assert.equal(oferta.preco, 9);
  assert.match(oferta.observacoes ?? "", /US\$ 9 por unidade/);
  assert.equal(ex.precoFalado[oferta.origem_item_id], "US$ 9 por unidade (só se perguntarem)");

  const lip = ex.servicos.find((s) => s.nome === "Lip Filler")!;
  assert.equal(lip.duracao_min, 70);
  const consulta = ex.servicos.find((s) => s.nome === "Consultation")!;
  assert.equal(consulta.categoria, "Avaliação");
  assert.equal(consulta.requer_avaliacao, false);
  // "menos de 30 minutos": sem número seguro, fica vazio com aviso (não se inventa).
  assert.equal(ex.servicos.find((s) => s.nome === "Botox")!.duracao_min, null);
  assert.ok(ex.avisos.some((a) => /Botox: duração/.test(a)));
});

test("Kelly: o sábado, a política, as FAQs e a config", () => {
  const ex = converter(entrada());
  const info = new Map(ex.info.map((l) => [l.chave, l.valor]));
  assert.match(info.get("horário de funcionamento")!, /sábado 11:00–15:00/);
  assert.match(info.get("horário de funcionamento")!, /quinta 10:00–20:00/);
  assert.match(info.get("horário de funcionamento")!, /Fechado: domingo\./);
  assert.match(info.get("política de cancelamento")!, /menos de 24 h.*US\$ 20/);
  assert.equal(info.get("site"), "https://www.k-glowaesthetics.com/");
  assert.equal(info.get("parcelamento"), "Sim. Financiamento pela Cherry.");
  assert.equal([...info.keys()].filter((k) => k.startsWith("FAQ ")).length, 8);
  assert.ok(info.has("FAQ 02: Does it hurt?"));
  assert.equal([...info.keys()].filter((k) => k.startsWith("objeção ")).length, 4);
  assert.ok(ex.info.every((l) => l.origem.startsWith("onboarding:")));

  const config = new Map(ex.config.map((l) => [l.chave, l.valor]));
  assert.equal(config.get("antecedencia_maxima"), "90 dias");
  assert.equal(config.get("link_reserva_moxie"), "https://app.joinmoxie.com/booking/k-glow-aesthetics");
  assert.equal(config.get("preco_so_se_perguntar"), "sim");
  assert.equal(config.get("oferecer_horarios_depois_do_preco"), "sim");
  assert.equal(config.get("pausa_quando_equipe_escreve_min"), "60");

  const kelly = ex.profissionais[0];
  assert.equal(ex.profissionais.length, 1);
  assert.equal(kelly.nome, "Kelly Soares");
  assert.deepEqual(kelly.horario?.["6"], ["11:00", "15:00"]);
  assert.equal(kelly.servicos.length, 51);
  assert.equal(ex.removidos.profissionais.length, 1);
});

test("Kelly: promoções com fim 2026-11-30, preço do pacote e a oferta de US$ 9", () => {
  const ex = converter(entrada());
  assert.equal(ex.promocoes.length, 7);
  const comData = ex.promocoes.filter((p) => p.fim === "2026-11-30");
  assert.equal(comData.length, 6);
  assert.ok(comData.every((p) => p.ativo && !p.ate_acabar));
  assert.equal(ex.promocoes.find((p) => p.nome === "BioRePeel Glow Series of 4")!.preco_promocional, 599);
  assert.equal(ex.promocoes.find((p) => p.nome.startsWith("K-Glow Collagen Revival"))!.preco_promocional, 1100);
  const nova = ex.promocoes.find((p) => p.nome.startsWith("NEW CLIENT SPECIAL"))!;
  assert.equal(nova.preco_promocional, 9);
  assert.match(nova.observacoes ?? "", /por unidade/);
  // Esta não tem validade respondida: é erro (a base exige fim ou "até acabar"), não se grava assim.
  assert.ok(ex.erros.some((e) => /NEW CLIENT SPECIAL.*sem data de fim/.test(e)));
});

test("Kelly: nada fica sem destino, e a ficha inteira vai para a config", () => {
  const ex = converter(entrada());
  assert.deepEqual(ex.semDestino, []);
  assert.equal(ex.contagem.resolvidas, ex.contagem.comDestino);
  assert.ok(ex.contagem.resolvidas > 400);
  const ficha = JSON.parse(ex.config.find((c) => c.chave === "ficha_onboarding_completa")!.valor);
  assert.equal(ficha.linhas.length, COPIA.linhas.length);
  assert.equal(ficha.itens.length, COPIA.itens.length);
  assert.equal(ficha.cliente_slug, SLUG);
  assert.equal(ex.config.find((c) => c.chave === "ficha_onboarding_completa_em")!.valor, AGORA);
  // A cópia é um rascunho: faltam obrigatórios, logo não se grava.
  assert.ok(ex.faltamObrigatorios.length > 0);
});

test("só entra o que ela confirmou: a cópia como está (tudo rascunho) não põe nenhum serviço", () => {
  const ex = converter(entrada(COPIA.linhas.map((l) => ({ ...l }))));
  assert.equal(ex.servicos.length, 0);
  assert.equal(ex.promocoes.length, 0);
  assert.ok(!ex.info.some((l) => l.chave === "endereço"));
  assert.ok(ex.contagem.rascunho > 300);
  assert.equal(ex.contagem.resolvidas, 0);
  // Mas a ficha completa vai na mesma (com os rascunhos e o estado de cada um).
  const ficha = JSON.parse(ex.config.find((c) => c.chave === "ficha_onboarding_completa")!.valor);
  assert.equal(ficha.linhas[0].estado, "rascunho");
});

test("pulado, vago e não se aplica: tratados à parte, nunca como resposta", () => {
  const linhas = confirmadas().map((l) =>
    !l.item_id && l.campo === "endereco_completo" ? { ...l, estado: "pulado" as const }
    : !l.item_id && l.campo === "politica_de_cancelamento" ? { ...l, estado: "vago" as const }
    : !l.item_id && l.campo === "estacionamento_ou_acesso" ? { ...l, estado: "nao_se_aplica" as const }
    : l,
  );
  const ex = converter(entrada(linhas));
  const info = new Map(ex.info.map((l) => [l.chave, l.valor]));
  assert.ok(!info.has("endereço"));
  assert.ok(!info.has("política de cancelamento"));
  assert.ok(!info.has("estacionamento e acesso"));
  assert.deepEqual(ex.pendencias.map((p) => p.campo).sort(), ["endereco_completo", "politica_de_cancelamento"]);
  assert.equal(ex.contagem.naoSeAplica, 1);
  assert.deepEqual(ex.semDestino, []);
});

// ------------------------------------------------------------------ anti-perda

test("anti-perda: uma resposta sem destino faz a exportação falhar com a lista", () => {
  const linhas = [...confirmadas(), { campo: "pergunta_que_ninguem_mapeou", item_id: null, valor: "algo importante", estado: "respondido" as const, fonte: "cliente", perguntas: 1 }];
  const ex = converter(entrada(linhas));
  assert.equal(ex.semDestino.length, 1);
  assert.equal(ex.semDestino[0].campo, "pergunta_que_ninguem_mapeou");
  assert.match(ex.erros[0], /sem destino.*pergunta_que_ninguem_mapeou/);
});

test("anti-perda: uma pergunta NOVA no esquema que a conversão não conhece também falha", () => {
  const esquema = structuredClone(ESQUEMA_ONBOARDING);
  esquema[0].campos.push({ chave: "pergunta_nova_sem_mapa", pergunta: "?", tipo: "text", obrigatorio: false, modo: "conversa" });
  const linhas = [...confirmadas(), { campo: "pergunta_nova_sem_mapa", item_id: null, valor: "resposta", estado: "respondido" as const, fonte: "cliente", perguntas: 1 }];
  const ex = converter({ ...entrada(linhas), esquema });
  assert.deepEqual(ex.semDestino.map((p) => p.campo), ["pergunta_nova_sem_mapa"]);
  assert.ok(ex.erros.length > 0);
});

test("gravar recusa uma exportação com resposta sem destino (nada é escrito)", async () => {
  const linhas = completar([...confirmadas(), { campo: "pergunta_que_ninguem_mapeou", item_id: null, valor: "x", estado: "respondido", fonte: "cliente", perguntas: 1 }], itens());
  const ex = converter(entrada(linhas));
  const base = new BaseComIds();
  const r = await gravarExportacao(base as never, ex);
  assert.equal(r.ok, false);
  assert.equal(base.registos.length, 0);
});

// ------------------------------------------------------------------ as perguntas de 24/11

const raiz = (campo: string, valor: unknown): LinhaDoCaderno => ({ campo, item_id: null, valor, estado: "respondido", fonte: "cliente", perguntas: 1 });
const doItem = (item: string, campo: string, valor: unknown): LinhaDoCaderno => ({ campo, item_id: item, valor, estado: "respondido", fonte: "cliente", perguntas: 1 });
const trocar = (linhas: LinhaDoCaderno[], novas: LinhaDoCaderno[]) => [...linhas.filter((l) => !novas.some((n) => n.campo === l.campo && n.item_id === l.item_id)), ...novas];

test("perguntas novas: consulta antes, lembretes, para quem vale, por unidade, retoque e valor da avaliação", () => {
  const base = converter(entrada());
  const sculptra = idDoServico(base, "Sculptra");
  const lip = idDoServico(base, "Lip Filler");
  const microneedling = idDoServico(base, "Microneedling");
  const promo = base.promocoes.find((p) => p.nome.startsWith("NEW CLIENT SPECIAL"))!.origem_item_id;
  const loyalty = base.promocoes.find((p) => p.nome.startsWith("The K-Glow Loyalty"))!.origem_item_id;
  const linhas = trocar(confirmadas(), [
    raiz("servicos_com_consulta_antes", ["Sculptra", "Lip Filler 💋"]),
    raiz("quem_manda_lembretes", "Sim, e basta: a assistente não precisa mandar"),
    raiz("retoque_cobrado", "Lip Filler: retoque em até 14 dias custa US$ 150."),
    raiz("avaliacao_paga", "Paga"),
    raiz("valor_da_avaliacao", "50"),
    raiz("duracao_da_avaliacao", "30 min"),
    raiz("avaliacao_vira_credito", "Sim"),
    doItem(promo, "para_quem_vale", "Só para clientes novas"),
    doItem(promo, "tipo_de_validade", "Até acabar"),
    doItem(loyalty, "para_quem_vale", "Só para quem já é cliente"),
    doItem(microneedling, "tipo_de_preco", "Por unidade (ex.: botox, cobrado por unidade aplicada)"),
    doItem(microneedling, "valor", "12"),
  ]);
  const ex = converter(entrada(linhas));
  const s = (id: string) => ex.servicos.find((x) => x.origem_item_id === id)!;
  assert.equal(s(sculptra).requer_avaliacao, true);
  assert.equal(s(sculptra).proximo_passo, "avaliacao");
  assert.equal(s(lip).requer_avaliacao, true);
  assert.equal(ex.servicos.find((x) => x.nome === "Brow lift")!.requer_avaliacao, false);
  assert.equal(s(lip).preco_retoque, 150);
  assert.equal(s(lip).dias_retoque, 14);
  assert.equal(s(microneedling).tipo_preco, "por_unidade");
  assert.equal(s(microneedling).preco, 12);

  const config = new Map(ex.config.map((l) => [l.chave, l.valor]));
  assert.equal(config.get("lembretes_quem_manda"), "Sim, e basta: a assistente não precisa mandar");
  assert.equal(config.get("lembretes_assistente_manda"), "nao");
  assert.equal(config.get("duracao_avaliacao_min"), "30");

  const info = new Map(ex.info.map((l) => [l.chave, l.valor]));
  assert.equal(info.get("valor_avaliacao"), "50");
  assert.match(info.get("avaliação")!, /Paga: US\$ 50.*30 min.*vira crédito/);
  assert.match(info.get("retoque cobrado à parte")!, /14 dias/);
  assert.equal(info.get("serviços que pedem consulta antes"), "Sculptra, Lip Filler 💋");

  const consulta = ex.servicos.find((x) => x.nome === "Consultation")!;
  assert.deepEqual([consulta.preco, consulta.tipo_preco, consulta.duracao_min], [50, "fixo", 45]);

  const p = (id: string) => ex.promocoes.find((x) => x.origem_item_id === id)!;
  assert.equal(p(promo).publico, "novos");
  assert.equal(p(promo).ate_acabar, true);
  assert.equal(p(promo).fim, null);
  assert.equal(p(promo).ativo, true);
  assert.equal(p(loyalty).publico, "atuais");
  assert.deepEqual(ex.semDestino, []);
});

test("consulta gratuita: preço 0 na linha da consulta e valor_avaliacao = 0", () => {
  const ex = converter(entrada(trocar(confirmadas(), [raiz("avaliacao_paga", "Gratuita"), raiz("duracao_da_avaliacao", "1h")])));
  const consulta = ex.servicos.find((x) => x.nome === "Consultation")!;
  assert.equal(consulta.preco, 0);
  assert.equal(consulta.duracao_min, 60);
  assert.equal(ex.precoFalado[consulta.origem_item_id], "gratuita (só se perguntarem)");
  assert.equal(ex.info.find((l) => l.chave === "valor_avaliacao")!.valor, "0");
  assert.ok(!ex.erros.some((e) => /Consultation/.test(e)));
});

test("retoque sem regra segura (dois valores): guarda o texto e não inventa preço", () => {
  const ex = converter(entrada(trocar(confirmadas(), [raiz("retoque_cobrado", "Lip Filler US$ 150 e Sculptra US$ 200, em 14 dias")])));
  assert.ok(ex.servicos.every((s) => s.preco_retoque === undefined));
  assert.ok(ex.info.some((l) => l.chave === "retoque cobrado à parte"));
  assert.ok(ex.avisos.some((a) => /Retoque/.test(a)));
});

test("tipo 'Outro' sem unidade num serviço comum: erro claro para decidir na revisão", () => {
  const ex0 = converter(entrada());
  const id = idDoServico(ex0, "Sculptra");
  const ex = converter(entrada(trocar(confirmadas(), [doItem(id, "tipo_de_preco", "Outro"), doItem(id, "outro_tipo_de_preco", "Depende da quantidade de frascos")])));
  assert.ok(ex.erros.some((e) => /Sculptra: tipo de preço "Outro"/.test(e)));
  assert.deepEqual(ex.semDestino, []);
});

test("pode informar preço mínimo = Não: serviços 'a partir de' ficam com modo_preco nunca", () => {
  const ex = converter(entrada(trocar(confirmadas(), [raiz("pode_informar_preco_minimo", "Não")])));
  assert.equal(ex.servicos.find((s) => s.nome === "Lip Filler")!.modo_preco, "nunca");
  assert.equal(ex.servicos.find((s) => s.nome === "Brow lift")!.modo_preco, "se_perguntar");
});

// ------------------------------------------------------------------ a IA (duplo)

const iaFalsa = (falhar = false): IaDaExportacao & { chamadas: number } => {
  const ia = {
    chamadas: 0,
    async servicos(lista: { id: string; nome: string }[]) {
      ia.chamadas++;
      if (falhar) throw new Error("sem créditos");
      return lista.map((s) => ({ id: s.id, nome_es: `${s.nome} (es)`, aliases: ["tox", "botox"], categoria: s.nome.includes("Laser") ? "laser_depilacao" : "categoria_inventada", preparo_pre: "Antes: sem maquiagem.", cuidados_pos: "Depois: não deitar 4 h." }));
    },
    async promocoes(p: { promocoes: { id: string }[]; catalogo: { id: string; nome: string }[] }) {
      ia.chamadas++;
      if (falhar) throw new Error("sem créditos");
      const lip = p.catalogo.find((c) => c.nome === "Lip Filler")!.id;
      return p.promocoes.map((x) => ({ id: x.id, campanha: "Holiday", servico_ids: [lip, "id-que-nao-existe"], brinde_pt: "", brinde_en: "", brinde_es: "", apelidos: ["promo"] }));
    },
  };
  return ia;
};

test("IA: preenche só os campos de IA, conferidos em código (categoria fora da lista e id inventado não entram)", async () => {
  const ia = iaFalsa();
  const ex = await exportar(entrada(), ia);
  assert.equal(ex.ia.usada, true);
  assert.equal(ia.chamadas, 2);
  const laser = ex.servicos.find((s) => s.nome === "Laser Hair Removal Back")!;
  assert.equal(laser.categoria, "Depilação a laser");
  assert.equal(laser.nome_es, "Laser Hair Removal Back (es)");
  assert.equal(ex.servicos.find((s) => s.nome === "Brow lift")!.categoria, undefined);
  assert.equal(ex.servicos.find((s) => s.nome === "Consultation")!.categoria, "Avaliação");
  const glabella = ex.servicos.find((s) => s.nome.startsWith("Precision Tox — Glabella"))!;
  assert.equal(glabella.preparo_pre, "Antes: sem maquiagem.");
  assert.match(glabella.preparo_e_cuidados ?? "", /maquiagem/, "o texto inteiro continua guardado");
  const lip = idDoServico(ex, "Lip Filler");
  assert.deepEqual(ex.promocoes[0].servicos_origem, [lip]);
  assert.equal(ex.promocoes[0].brinde_pt, undefined, "brinde vazio não se grava");
});

test("IA com erro: a conversão continua, sem os campos de IA e com aviso", async () => {
  const ex = await exportar(entrada(), iaFalsa(true));
  assert.equal(ex.servicos.length, 51);
  assert.match(ex.ia.erro ?? "", /sem créditos/);
  assert.ok(ex.servicos.every((s) => s.nome_es === undefined && s.categoria !== "Depilação a laser"));
  assert.ok(ex.avisos.some((a) => /A IA falhou/.test(a)));
});

test("sem IA: continua e avisa", async () => {
  const ex = await exportar(entrada(), null);
  assert.equal(ex.ia.usada, false);
  assert.equal(ex.servicos.length, 51);
});

// ------------------------------------------------------------------ gravação: idempotência e nunca apagar

/** A base do cliente em memória, com ids gerados como a identity do Postgres. */
class BaseComIds extends FakeSupabase {
  private proximo = 1;
  private readonly marcadas = new WeakSet<Linha[]>();
  linhasDe(tabela: string) {
    const linhas = super.linhasDe(tabela);
    if (!this.marcadas.has(linhas)) {
      this.marcadas.add(linhas);
      const push = linhas.push.bind(linhas);
      linhas.push = (...novas: Linha[]) => {
        for (const n of novas) if (n.id === undefined && !/^(info|config)_/.test(tabela)) n.id = this.proximo++;
        return push(...novas);
      };
    }
    return linhas;
  }
}

const completa = () => {
  const its = itens();
  return { linhas: completar(confirmadas(), its), its };
};

test("gravar: as 5 tabelas, ids estáveis e nada duplicado ao correr duas vezes", async () => {
  const { linhas, its } = completa();
  const ex = await exportar(entrada(linhas, its), iaFalsa());
  assert.deepEqual(ex.erros, []);
  const base = new BaseComIds();
  const r1 = await gravarExportacao(base as never, ex);
  assert.equal(r1.ok, true, r1.erro);
  assert.equal(r1.tabelas!.servicos_kglow.criadas, 51);
  const ids1 = new Map(base.linhasDe("servicos_kglow").map((l) => [l.origem_item_id, l.id]));
  assert.equal(base.linhasDe("info_kglow").length, ex.info.length);
  assert.equal(base.linhasDe("config_kglow").length, ex.config.length);
  assert.equal(base.linhasDe("profissionais_kglow").length, 1);
  assert.equal(base.linhasDe("promocoes_kglow").length, 7);
  const lip = base.linhasDe("servicos_kglow").find((l) => l.nome === "Lip Filler")!;
  assert.deepEqual(base.linhasDe("promocoes_kglow")[0].servico_ids, [lip.id], "promoção aponta para o id numérico do serviço");
  assert.ok(!("inicio" in base.linhasDe("promocoes_kglow")[0]), "início fica no default da base (dia da gravação)");
  assert.ok(base.registos.every((r) => r.operacao !== "delete"), "nunca apaga");

  const r2 = await gravarExportacao(base as never, await exportar(entrada(linhas, its), iaFalsa()));
  assert.equal(r2.ok, true);
  assert.equal(r2.tabelas!.servicos_kglow.criadas, 0);
  assert.equal(r2.tabelas!.servicos_kglow.atualizadas, 51);
  assert.equal(base.linhasDe("servicos_kglow").length, 51);
  assert.equal(base.linhasDe("promocoes_kglow").length, 7);
  assert.equal(base.linhasDe("info_kglow").length, ex.info.length);
  assert.deepEqual(new Map(base.linhasDe("servicos_kglow").map((l) => [l.origem_item_id, l.id])), ids1, "os ids não mudam");
});

test("gravar: item removido no onboarding fica ativo=false; chave antiga do onboarding desativa; chave escrita à mão fica", async () => {
  const { linhas, its } = completa();
  const base = new BaseComIds({ info_kglow: [{ chave: "nota da equipe", valor: "escrita à mão", origem: null, ativo: true }] });
  await gravarExportacao(base as never, await exportar(entrada(linhas, its), null));
  const sculptra = base.linhasDe("servicos_kglow").find((l) => l.nome === "Sculptra")!;
  // A Kelly tira o Sculptra e uma FAQ.
  const its2 = its.map((i) => (i.id === sculptra.origem_item_id ? { ...i, removido: true } : i));
  const faq = its2.filter((i) => i.grupo === "faqs").sort((a, b) => b.ordem - a.ordem)[0];
  const its3 = its2.map((i) => (i.id === faq.id ? { ...i, removido: true } : i));
  const ex2 = await exportar(entrada(linhas, its3), null);
  assert.deepEqual(ex2.erros, []);
  const r = await gravarExportacao(base as never, ex2);
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.tabelas!.servicos_kglow.desativadas, 1);
  assert.equal(base.linhasDe("servicos_kglow").length, 51, "não apagou");
  assert.equal(base.linhasDe("servicos_kglow").find((l) => l.nome === "Sculptra")!.ativo, false);
  assert.equal(base.linhasDe("info_kglow").find((l) => l.chave === "FAQ 08: What do I need to know post neurotoxin treatment?")!.ativo, false);
  assert.equal(base.linhasDe("info_kglow").find((l) => l.chave === "nota da equipe")!.ativo, true);
  assert.ok(base.registos.every((x) => x.operacao !== "delete"));
});

test("gravar: tabela que não existe na base da cliente dá 'falta criar as tabelas', sem gravar nada", async () => {
  const { linhas, its } = completa();
  const base = new BaseComIds();
  base.falhas.set("select:promocoes_kglow", { code: "PGRST205", message: "Could not find the table 'public.promocoes_kglow' in the schema cache" });
  const r = await gravarExportacao(base as never, await exportar(entrada(linhas, its), null));
  assert.equal(r.ok, false);
  assert.match(r.erro!, /Falta criar as tabelas.*kglow_tabelas\.sql/);
  assert.ok(base.registos.every((x) => x.operacao === "select"));
});

// ------------------------------------------------------------------ isolamento por cliente e só admin

function centralCom(conexoes: { slug: string; url: string }[], linhas: LinhaDoCaderno[], its: ItemDoCaderno[], slug = SLUG) {
  return new FakeSupabase({
    lexia_conexoes: conexoes.map((c) => ({ cliente_slug: c.slug, tipo: "supabase_cliente", campos: { url: c.url }, segredos: cifrar({ service_role_key: `chave-${c.slug}` }) })),
    lexia_onboardings: [{ id: "onb-1", cliente_slug: slug, estado: "aprovado", etapa1: COPIA.etapa1, achados: {}, cursor: {}, criado_em: AGORA, atualizado_em: AGORA, aprovado_em: AGORA }],
    lexia_onboarding_itens: its.map((i) => ({ id: i.id, grupo: i.grupo, ordem: i.ordem, removido_em: i.removido ? AGORA : null, cliente_slug: slug, onboarding_id: "onb-1" })),
    lexia_onboarding_campos_atual: linhas.map((l) => ({ ...l, evidencia: {}, cliente_slug: slug, onboarding_id: "onb-1" })),
  });
}

test("isolamento: grava SÓ na base do próprio cliente (a da Jessica fica intocada)", async () => {
  const { linhas, its } = completa();
  const kglow = new BaseComIds();
  const jessica = new BaseComIds({ servicos_jessica: [{ id: 1, nome: "Brow" }] });
  basesPorUrl.clear();
  basesPorUrl.set("https://kglow.supabase.co", kglow);
  basesPorUrl.set("https://jessica.supabase.co", jessica);
  abertas.length = 0;
  central = centralCom([{ slug: "jessica_beauty", url: "https://jessica.supabase.co" }, { slug: SLUG, url: "https://kglow.supabase.co" }], linhas, its);
  const r = await gravarNaBaseDoAgente({ admin: central as never, clienteSlug: SLUG, lexia: true }, { ia: null, agora: new Date(AGORA), criarCliente });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(abertas, ["https://kglow.supabase.co"]);
  assert.equal(jessica.registos.length, 0);
  assert.equal(kglow.linhasDe("servicos_kglow").length, 51);
  // Cada leitura do onboarding no central levou o slug da K-Glow.
  for (const reg of central.registos.filter((x) => x.tabela.startsWith("lexia_onboarding"))) assert.ok(reg.filtros.some((f) => f.coluna === "cliente_slug" && f.valor === SLUG), reg.tabela);
});

test("isolamento: a Jessica (sem sufixo configurado) é recusada mesmo com base ligada", async () => {
  const { linhas, its } = completa();
  const jessica = new BaseComIds();
  basesPorUrl.clear();
  basesPorUrl.set("https://jessica.supabase.co", jessica);
  central = centralCom([{ slug: "jessica_beauty", url: "https://jessica.supabase.co" }], linhas, its, "jessica_beauty");
  const r = await gravarNaBaseDoAgente({ admin: central as never, clienteSlug: "jessica_beauty", lexia: true }, { ia: null, criarCliente });
  assert.equal(r.ok, false);
  assert.match(r.erro!, /não tem as tabelas/);
  assert.equal(jessica.registos.length, 0);
});

test("isolamento: base ligada também a outro cliente, ou à base central, é recusada", async () => {
  basesPorUrl.clear();
  let c = centralCom([{ slug: "jessica_beauty", url: "https://mesma.supabase.co/" }, { slug: SLUG, url: "https://mesma.supabase.co" }], [], []);
  let a = await abrirBaseDoCliente(c as never, SLUG, criarCliente);
  assert.equal(a.ok, false);
  assert.match((a as { erro: string }).erro, /outro cliente \(jessica_beauty\)/);
  c = centralCom([{ slug: SLUG, url: "https://central.supabase.co" }], [], []);
  a = await abrirBaseDoCliente(c as never, SLUG, criarCliente);
  assert.match((a as { erro: string }).erro, /base central/);
  c = centralCom([{ slug: "jessica_beauty", url: "https://jessica.supabase.co" }], [], []);
  a = await abrirBaseDoCliente(c as never, SLUG, criarCliente);
  assert.match((a as { erro: string }).erro, /não tem a base ligada/);
});

test("só a equipe da Lexia: prévia e gravação recusam conta de cliente e pedido sem acesso", async () => {
  const { linhas, its } = completa();
  central = centralCom([{ slug: SLUG, url: "https://kglow.supabase.co" }], linhas, its);
  const kglow = new BaseComIds();
  basesPorUrl.clear();
  basesPorUrl.set("https://kglow.supabase.co", kglow);
  for (const acesso of [null, { admin: central as never, clienteSlug: SLUG, lexia: false }]) {
    assert.equal((await previaDaBaseDoAgente(acesso, { ia: null })).ok, false);
    assert.equal((await gravarNaBaseDoAgente(acesso, { ia: null, criarCliente })).ok, false);
  }
  assert.equal(kglow.registos.length, 0);

  // As ações da tela: a conta da própria cliente não passa (só lexia_admin).
  const acoes = await import("@/app/admin/clientes/[slug]/onboarding/actions");
  perfil = { role: "cliente_admin", cliente_slug: SLUG, status: "ativo" };
  assert.deepEqual(await acoes.previaDaBase(SLUG), { ok: false, erro: "Só a equipe da Lexia." });
  assert.deepEqual(await acoes.gravarNaBase(SLUG), { ok: false, erro: "Só a equipe da Lexia." });
  assert.equal(kglow.registos.length, 0);
});

test("prévia (admin): mostra tudo sem gravar nada e resume a ficha completa", async () => {
  const { linhas, its } = completa();
  central = centralCom([{ slug: SLUG, url: "https://kglow.supabase.co" }], linhas, its);
  const kglow = new BaseComIds();
  basesPorUrl.clear();
  basesPorUrl.set("https://kglow.supabase.co", kglow);
  abertas.length = 0;
  const p = await previaDaBaseDoAgente({ admin: central as never, clienteSlug: SLUG, lexia: true }, { ia: null, agora: new Date(AGORA) });
  assert.equal(p.ok, true, p.erro);
  assert.equal(p.exportacao!.servicos.length, 51);
  assert.equal(p.exportacao!.hoje, "2026-11-24");
  assert.match(p.exportacao!.config.find((c) => c.chave === "ficha_onboarding_completa")!.valor, /^\(JSON com a ficha inteira/);
  assert.deepEqual(abertas, [], "a prévia nem abre a base do cliente");
  assert.equal(kglow.registos.length, 0);
});

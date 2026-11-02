/**
 * Controle do agente (/admin/turnos).
 *
 * 1. Cada passo gravado cai na etapa certa; um nó desconhecido herda a etapa
 *    do anterior; o caminho escolhido (atendimento/agendamento/indefinido)
 *    acende só o que correu.
 * 2. O `ms` gravado é o instante em que o passo acabou: a duração é a
 *    diferença para o anterior do mesmo workflow, e a chamada ao Cérebro não
 *    conta duas vezes.
 * 3. Um turno que parou fica amarelo na última etapa que correu, com o motivo.
 * 4. A página só deixa entrar lexia_admin.
 *
 * Dados inventados: este repositório é público.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { agruparConversas, turnoEscolhido } from "../lib/turnos/controle";
import { acoesVisiveis, comDuracao, legivelFollowup, montarFluxo, type Fase } from "../lib/turnos/mapa";

const p = (workflow: string, no: string, ms: number) => ({ workflow, no, ms, saida: null });

function turno(extra: Record<string, unknown>) {
  return {
    id: "t1", cliente_slug: "x", agente: "x", modo: "sombra", identificador_conversa: "whatsapp:1", canal: "whatsapp",
    estado: "respondido", motivo: null, erro: null, mensagem_cliente: "oi", mensagens: ["Olá!"], custo_usd: 0,
    duracao_ms: 1000, criado_em: "2026-01-01T00:00:00Z", run_id: null, rota: "atendimento", handoff: null,
    resumo: { assunto: "servicos", idioma: "pt", briefing: { objectivo: "responder", factos: ["a", "b"] } },
    ia: [], ferramentas: [], passos: [], custo_sem_preco: [], tokens: null, versao: "v", iniciado_em: null,
    ...extra,
  } as never;
}

function fases(linhas: ReturnType<typeof montarFluxo>) {
  const todas: Fase[] = [];
  for (const l of linhas ?? []) todas.push(...(l.tipo === "fase" ? [l.fase] : l.fases));
  return Object.fromEntries(todas.map((f) => [f.id, f]));
}

const RESPONDIDO = [
  p("omnichannel", "Webhook WhatsApp Omnichannel", 0),
  p("omnichannel", "Ver Status Agente", 100),
  p("omnichannel", "Redis_Buffer2", 60100),
  p("omnichannel", "Nó Novo Qualquer", 60150),
  p("omnichannel", "Buscar Histórico da Conversa", 60200),
  p("omnichannel", "Agente de Contexto", 68200),
  p("omnichannel", "Chamar Cérebro do Cliente", 90000),
  p("omnichannel", "Enviar Mensagem Cliente - Texto Genérico", 91000),
  p("cerebro", "Rotear por Assunto", 500),
  p("cerebro", "Orquestrador de Atendimento", 15500),
  p("cerebro", "Redator — Voz do Cliente", 20000),
];

test("cada passo cai na sua etapa e só o caminho usado acende", () => {
  const f = fases(montarFluxo(turno({ passos: RESPONDIDO })));
  assert.equal(f.chegou.estado, "feito");
  assert.equal(f.filtros.estado, "feito");
  assert.deepEqual(f.buffer.passos.map((x) => x.no), ["Redis_Buffer2", "Nó Novo Qualquer"]);
  assert.equal(f.atendimento.estado, "feito");
  assert.equal(f.agendamento.estado, "nao_usado");
  assert.equal(f.indefinido.estado, "nao_usado");
  assert.equal(f.followup.estado, "nao_usado");
  assert.ok(f.entendeu.linhas.includes("Assunto: servicos"));
  assert.ok(f.atendimento.linhas.includes("Decidiu: responder"));
});

test("duração = diferença para o passo anterior do mesmo workflow; o Cérebro não conta duas vezes", () => {
  const d = comDuracao(RESPONDIDO);
  const ms = (no: string) => d.find((x) => x.no === no)!.ms;
  assert.equal(ms("Redis_Buffer2"), 60000);
  assert.equal(ms("Agente de Contexto"), 8000);
  assert.equal(ms("Chamar Cérebro do Cliente"), 0);
  assert.equal(ms("Orquestrador de Atendimento"), 15000);
  assert.equal(ms("Redator — Voz do Cliente"), 4500);
});

test("turno que parou: amarelo na última etapa que correu, com o motivo", () => {
  const f = fases(
    montarFluxo(turno({ estado: "parado", motivo: "o Samuel respondeu", mensagens: [], passos: RESPONDIDO.slice(0, 2) })),
  );
  assert.equal(f.filtros.estado, "parou");
  assert.ok(f.filtros.linhas.some((l) => l.includes("o Samuel respondeu")));
  assert.equal(f.leu.estado, "nao_usado");
});

test("turno com erro fica vermelho; sem passos não há desenho", () => {
  const f = fases(montarFluxo(turno({ estado: "erro", erro: "timeout da IA", passos: RESPONDIDO.slice(0, 6) })));
  assert.equal(f.entendeu.estado, "erro");
  assert.equal(montarFluxo(turno({ passos: [] })), null);
});

test("follow-up: o envio conta pela ação, porque não deixa passo", () => {
  const f = fases(
    montarFluxo(
      turno({
        rota: "followup",
        passos: [p("followup", "Schedule Trigger", 0), p("followup", "Redator de Follow-up", 3000)],
        resumo: { acoes: [{ tipo: "enviar_mensagem", resumo: "enviar" }] },
      }),
    ),
  );
  assert.equal(f.fu_escreveu.estado, "feito");
  assert.equal(f.fu_enviou.estado, "feito");
  assert.equal(f.fu_juiz.estado, "nao_usado");
});

test("ações em linguagem simples; as internas ficam de fora", () => {
  const a = acoesVisiveis([
    { tipo: "enviar_mensagem", resumo: "x" },
    { tipo: "enviar_mensagem", resumo: "y" },
    { tipo: "redis_escrever", resumo: "eco" },
    { tipo: "gravar_tabela", resumo: "guardar a mensagem enviada no histórico" },
    { tipo: "gravar_tabela", resumo: "armar o follow-up para 2026-11-02T07:00:00.000-05:00 (etapa 1)" },
    { tipo: "google_evento", resumo: "Consulta · qui 05/11 18:00", recusada: "guarda do n8n" },
  ]);
  assert.deepEqual(
    a.map((x) => x.texto),
    [
      "Enviou 2 balões ao cliente",
      "Marcou um follow-up para 02/11 às 07:00 (tentativa 1), caso o cliente não responda",
      "Consulta · qui 05/11 18:00",
    ],
  );
  assert.equal(a[2].recusada, "guarda do n8n");
  assert.equal(legivelFollowup("outra coisa"), "outra coisa");
});

test("conversas agrupadas pela mais recente; a resposta aberta por omissão é a última enviada", () => {
  const t = (id: string, conv: string, estado = "respondido") => ({ ...(turno({ id, identificador_conversa: conv, estado }) as object) }) as never;
  const r = agruparConversas([t("3", "a", "erro"), t("2", "b"), t("1", "a")]);
  assert.deepEqual(r.map((x) => [x.id, x.turnos, x.erros]), [["a", 2, 1], ["b", 1, 0]]);
  assert.deepEqual(agruparConversas([t("3", "a", "erro"), t("2", "b")], true).map((x) => x.id), ["a"]);
  const daConversa = [t("1", "a"), t("2", "a"), t("3", "a", "parado")];
  assert.equal(turnoEscolhido(daConversa, ""), "2");
  assert.equal(turnoEscolhido(daConversa, "3"), "3");
  assert.equal(turnoEscolhido(daConversa, "de-outra-conversa"), "2");
});

test("a página só abre para lexia_admin", () => {
  const src = readFileSync(new URL("../app/admin/turnos/page.tsx", import.meta.url), "utf8");
  assert.match(src, /profile\.role !== "lexia_admin"\) redirect\("\/app"\)/);
});

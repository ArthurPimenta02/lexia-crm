// Synthetic scenarios for the OMNI v2 test workflows. Companies, accounts,
// conversations and texts are fictitious. They run through the n8n workflow
// JSON (scenario runner) and through the local executor in the tests.

import type { ContextAgentConfig } from "../../lib/omnichannel/contracts";
import {
  createMasterStore,
  type ConversationSelector,
  type MasterEvent,
  type MasterStore,
  type ProviderBinding,
  type RawProviderEvent,
  type ScenarioFixture,
} from "../../lib/omnichannel/master-runtime";
import type { CompanyOmnichannelPolicy } from "../../lib/omnichannel/policy";

export type ScenarioStep = { label: string; event: MasterEvent; fixtures?: ScenarioFixture[] };
export type Scenario = { id: string; title: string; initial_store: MasterStore; steps: ScenarioStep[] };

const ENV = "isolated_test" as const;

const binding = (
  provider: ProviderBinding["provider"],
  ref: string,
  slug: string,
  channel: ProviderBinding["channel"],
  account: string,
): ProviderBinding => ({
  provider,
  provider_account_ref: ref,
  environment: ENV,
  cliente_slug: slug,
  channel,
  account_ref: account,
  delivery_owner: "v2",
  delivery_mode: "deliver",
});

const policy = (slug: string, pause: boolean): CompanyOmnichannelPolicy => ({
  environment: ENV,
  cliente_slug: slug,
  policy_version: `${slug}-v1`,
  status: "active",
  policy: {
    resumeMode: "await_new_message",
    humanInterventionDurationMs: 15 * 60 * 1000,
    bufferWindowMs: 60_000,
    appointment: { pauseAfterConfirmation: pause, cancellationKeepsBlock: true, cancelledReminderAllowed: false },
  },
});

const contextConfig = (slug: string, version: string): ContextAgentConfig => ({
  schema_version: "lexia.context.agent.config.v1",
  environment: ENV,
  cliente_slug: slug,
  config_version: version,
  status: "active",
  prompt_template: `Extraia contexto operacional sintético de ${slug}.`,
  common_schema_version: "lexia.context.result.v1",
  company_fields_schema: {
    type: "object",
    additionalProperties: false,
    required: ["service_interest"],
    properties: { service_interest: { type: "string" } },
  },
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  model_policy_ref: "context-policy-test-v1",
});

export const ACCOUNTS = {
  aWhatsapp: binding("zapi", "zapi-a-001", "empresa_sintetica_a", "whatsapp", "11111111-1111-4111-8111-111111111111"),
  aMessenger: binding("meta", "meta-a-msg-001", "empresa_sintetica_a", "messenger", "11111111-1111-4111-8111-111111111112"),
  bInstagram: binding("meta", "meta-b-ig-001", "empresa_sintetica_b", "instagram", "22222222-2222-4222-8222-222222222222"),
  cWhatsapp: binding("zapi", "zapi-c-001", "empresa_sintetica_c", "whatsapp", "33333333-3333-4333-8333-333333333333"),
};

export function initialStore() {
  return createMasterStore({
    bindings: Object.values(ACCOUNTS),
    policies: [
      policy("empresa_sintetica_a", true),
      policy("empresa_sintetica_b", false),
      policy("empresa_sintetica_c", false),
    ],
    // Company C has no context configuration on purpose.
    contextConfigs: [contextConfig("empresa_sintetica_a", "context-a-v1"), contextConfig("empresa_sintetica_b", "context-b-v1")],
    brainBindings: ["empresa_sintetica_a", "empresa_sintetica_b", "empresa_sintetica_c"].map((slug) => ({
      environment: ENV,
      cliente_slug: slug,
      brain_ref: `fake_brain_${slug}`,
      capabilities: ["appointment.confirmed", "appointment.cancelled", "handoff.requested"],
    })),
  });
}

function selector(account: ProviderBinding, conversation: string): ConversationSelector {
  return { provider: account.provider, provider_account_ref: account.provider_account_ref, conversation_external_id: conversation };
}

function message(
  account: ProviderBinding,
  conversation: string,
  id: string,
  at: string,
  text: string,
  options: Partial<RawProviderEvent> = {},
): MasterEvent {
  return {
    type: "inbound",
    raw: {
      provider: account.provider,
      provider_account_ref: account.provider_account_ref,
      provider_event_id: `evt-${id}`,
      provider_message_id: `msg-${id}`,
      conversation_external_id: conversation,
      at,
      from_business: false,
      text,
      ...options,
    },
  };
}

const tick = (account: ProviderBinding, conversation: string, at: string, execution: string, seq: number | "latest" = "latest"): MasterEvent => ({
  type: "buffer_tick",
  selector: selector(account, conversation),
  candidate_seq: seq,
  at,
  execution_id: execution,
});

const reminder = (account: ProviderBinding, conversation: string, id: string, ref: string, at: string): MasterEvent => ({
  type: "automation",
  selector: selector(account, conversation),
  request_id: `aaaaaaaa-0000-4000-8000-${id.padStart(12, "0")}`,
  kind: "appointment_reminder",
  source_ref: ref,
  text: `Lembrete sintético ${id}`,
  at,
  execution_id: `exec-reminder-${id}`,
});

const command = (
  account: ProviderBinding | null,
  conversation: string | null,
  body: Extract<MasterEvent, { type: "command" }>["command"],
): MasterEvent => ({
  type: "command",
  ...(account && conversation ? { selector: selector(account, conversation) } : {}),
  command: body,
});

const adminA = { role: "cliente_admin" as const, cliente_slug: "empresa_sintetica_a" };
const lexiaAdmin = { role: "lexia_admin" as const, cliente_slug: null };

const BOOK_A = { appointment_ref: "appt-a-1", starts_at: "2026-10-09T15:00:00.000Z", ends_at: "2026-10-09T16:00:00.000Z", timezone: "America/New_York" };

export function buildScenarios(): Scenario[] {
  const A = ACCOUNTS.aWhatsapp;
  const AM = ACCOUNTS.aMessenger;
  const B = ACCOUNTS.bInstagram;
  const C = ACCOUNTS.cWhatsapp;
  const shared = "lead-shared-001";

  return [
    {
      id: "pause_on_booking",
      title: "A (pausa ligada): só a confirmação sai, pausa até o fim, lembrete do próprio agendamento, outros bloqueios valem, outra conversa do lead não pausa",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead pede agendamento",
          event: message(A, shared, "a1", "2026-10-08T12:00:00.000Z", "Quero agendar amanhã."),
          fixtures: [{ selector: selector(A, shared), brain_scripts: [{ bubbles: ["Perfeito, vou reservar."], book: BOOK_A, confirmation: "Agendamento confirmado (sintético)." }] }],
        },
        { label: "buffer fecha e o cérebro agenda", event: tick(A, shared, "2026-10-08T12:01:01.000Z", "exec-a-1") },
        { label: "lead escreve durante a pausa", event: message(A, shared, "a2", "2026-10-08T12:05:00.000Z", "Obrigado!") },
        { label: "buffer recusa: bloqueado antes do cérebro", event: tick(A, shared, "2026-10-08T12:06:01.000Z", "exec-a-2") },
        { label: "lembrete antes do início passa pelo bloco do próprio agendamento", event: reminder(A, shared, "1", "appt-a-1", "2026-10-09T10:00:00.000Z") },
        { label: "pausa manual pela empresa", event: command(A, shared, { command: "manual_pause.start", ref: "p1", at: "2026-10-09T10:30:00.000Z", actor: adminA }) },
        { label: "lembrete bloqueado pela pausa manual", event: reminder(A, shared, "2", "appt-a-1", "2026-10-09T11:00:00.000Z") },
        { label: "mesma pessoa no Messenger da empresa A", event: message(AM, shared, "am1", "2026-10-08T12:10:00.000Z", "Oi pelo Messenger.") },
        { label: "conversa do Messenger não herda a pausa", event: tick(AM, shared, "2026-10-08T12:11:01.000Z", "exec-am-1") },
      ],
    },
    {
      id: "pause_off_booking",
      title: "B (pausa desligada): resposta e confirmação saem, sem pausa; lembrete antes do início; recusado depois do início",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead pede agendamento",
          event: message(B, shared, "b1", "2026-10-08T12:00:00.000Z", "Quero marcar."),
          fixtures: [{ selector: selector(B, shared), brain_scripts: [
            { bubbles: ["Perfeito!"], book: { ...BOOK_A, appointment_ref: "appt-b-1" }, confirmation: "Confirmado (sintético)." },
            { bubbles: ["Claro, posso ajudar."] },
          ] }],
        },
        { label: "buffer fecha", event: tick(B, shared, "2026-10-08T12:01:01.000Z", "exec-b-1") },
        { label: "lead continua", event: message(B, shared, "b2", "2026-10-08T12:05:00.000Z", "Posso levar acompanhante?") },
        { label: "sem pausa: responde", event: tick(B, shared, "2026-10-08T12:06:01.000Z", "exec-b-2") },
        { label: "lembrete antes do início", event: reminder(B, shared, "3", "appt-b-1", "2026-10-09T10:00:00.000Z") },
        { label: "lembrete no início é recusado", event: reminder(B, shared, "4", "appt-b-1", "2026-10-09T15:00:00.000Z") },
      ],
    },
    {
      id: "intervention_during_buffer",
      title: "Intervenção durante o buffer: cérebro não é chamado; áudio da equipe com falha preserva mensagem e pausa",
      initial_store: initialStore(),
      steps: [
        { label: "lead escreve", event: message(A, "lead-a-002", "c1", "2026-10-08T12:00:00.000Z", "Qual o preço?") },
        { label: "equipe responde pelo celular", event: message(A, "lead-a-002", "c2", "2026-10-08T12:00:30.000Z", "Oi, aqui é a equipe.", { from_business: true }) },
        { label: "buffer recusa: bloqueado", event: tick(A, "lead-a-002", "2026-10-08T12:01:01.000Z", "exec-c-1") },
        { label: "áudio da equipe com falha de transcrição", event: message(A, "lead-a-002", "c3", "2026-10-08T12:02:00.000Z", "", { from_business: true, media: { kind: "audio", provider_media_ref: "media-c3", simulate_failure: true } }) },
        { label: "lead volta depois do prazo", event: message(A, "lead-a-002", "c4", "2026-10-08T12:30:00.000Z", "Ainda tem horário?") },
        { label: "await_new_message: responde só a partir da nova mensagem", event: tick(A, "lead-a-002", "2026-10-08T12:31:01.000Z", "exec-c-2") },
      ],
    },
    {
      id: "intervention_during_generation",
      title: "Intervenção durante a geração: efeito da tool preservado, resposta suprimida",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead pede agendamento",
          event: message(B, "lead-b-003", "d1", "2026-10-08T12:00:00.000Z", "Quero marcar sexta."),
          fixtures: [{ selector: selector(B, "lead-b-003"), brain_scripts: [{
            bubbles: ["Reservado!"], book: { ...BOOK_A, appointment_ref: "appt-b-gen" }, confirmation: "Confirmação (sintética).",
            during_generation: [{ provider: "meta", provider_account_ref: B.provider_account_ref, provider_event_id: "evt-d2", provider_message_id: "msg-d2", conversation_external_id: "lead-b-003", at: "2026-10-08T12:01:10.000Z", from_business: true, is_echo: true, text: "Equipe assumindo." }],
          }] }],
        },
        { label: "buffer fecha; equipe intervém enquanto o cérebro gera", event: tick(B, "lead-b-003", "2026-10-08T12:01:01.000Z", "exec-d-1") },
      ],
    },
    {
      id: "new_message_before_send",
      title: "Mensagem nova antes do envio: descarta o restante, reprocessa sem repetir bolha enviada nem tool",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead pede agendamento",
          event: message(B, "lead-b-004", "e1", "2026-10-08T12:00:00.000Z", "Quero marcar."),
          fixtures: [{
            selector: selector(B, "lead-b-004"),
            brain_scripts: [
              { bubbles: ["Bolha 1", "Bolha 2", "Bolha 3"], book: { ...BOOK_A, appointment_ref: "appt-b-r" }, confirmation: "Confirmação única" },
              { bubbles: ["Bolha nova considerando tudo"], book: { ...BOOK_A, appointment_ref: "appt-b-r" }, confirmation: "Confirmação única" },
            ],
            provider_scripts: [{ outcome: "sent", after: [{ provider: "meta", provider_account_ref: B.provider_account_ref, provider_event_id: "evt-e2", provider_message_id: "msg-e2", conversation_external_id: "lead-b-004", at: "2026-10-08T12:01:05.000Z", from_business: false, text: "Ah, e prefiro de manhã." }] }],
          }],
        },
        { label: "primeira bolha sai; lead escreve antes da segunda", event: tick(B, "lead-b-004", "2026-10-08T12:01:01.000Z", "exec-e-1") },
        { label: "reprocessa o lote com as duas mensagens", event: tick(B, "lead-b-004", "2026-10-08T12:02:06.000Z", "exec-e-2") },
      ],
    },
    {
      id: "partial_delivery_failure",
      title: "Entrega parcial: falha definitiva para o plano; retry não repete o já enviado",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead escreve",
          event: message(B, "lead-b-005", "f1", "2026-10-08T12:00:00.000Z", "Me explica o serviço?"),
          fixtures: [{ selector: selector(B, "lead-b-005"), brain_scripts: [{ bubbles: ["P1", "P2", "P3"] }], provider_scripts: [{ outcome: "sent" }, { outcome: "failed" }] }],
        },
        { label: "P1 enviada, P2 falha, P3 aguarda", event: tick(B, "lead-b-005", "2026-10-08T12:01:01.000Z", "exec-f-1") },
        { label: "retry de P2 retoma o plano", event: { type: "recovery", selector: selector(B, "lead-b-005"), operation: "retry", action_text: "P2", at: "2026-10-08T12:03:00.000Z", execution_id: "exec-f-2" } },
      ],
    },
    {
      id: "cancellation_keeps_pause",
      title: "Cancelamento: pausa mantida até o fim, lembrete negado; remoção manual encerra só esse bloco",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead agenda",
          event: message(A, "lead-a-006", "g1", "2026-10-08T12:00:00.000Z", "Quero marcar."),
          fixtures: [{ selector: selector(A, "lead-a-006"), brain_scripts: [{ bubbles: [], book: { ...BOOK_A, appointment_ref: "appt-a-cancel" }, confirmation: "Confirmado." }] }],
        },
        { label: "confirmação única sai", event: tick(A, "lead-a-006", "2026-10-08T12:01:01.000Z", "exec-g-1") },
        { label: "empresa cancela", event: command(A, "lead-a-006", { command: "appointment.cancel", ref: "appt-a-cancel", at: "2026-10-08T13:00:00.000Z", actor: adminA }) },
        { label: "lembrete de cancelado é recusado", event: reminder(A, "lead-a-006", "5", "appt-a-cancel", "2026-10-09T10:00:00.000Z") },
        { label: "lead escreve: continua pausado", event: message(A, "lead-a-006", "g2", "2026-10-08T13:10:00.000Z", "Posso remarcar?") },
        { label: "buffer recusa", event: tick(A, "lead-a-006", "2026-10-08T13:11:01.000Z", "exec-g-2") },
        { label: "empresa remove a pausa do agendamento", event: command(A, "lead-a-006", { command: "appointment.remove_block", ref: "appt-a-cancel", at: "2026-10-08T13:20:00.000Z", actor: adminA }) },
        { label: "nova mensagem é respondida", event: message(A, "lead-a-006", "g3", "2026-10-08T13:25:00.000Z", "Então?") },
        { label: "responde", event: tick(A, "lead-a-006", "2026-10-08T13:26:01.000Z", "exec-g-3") },
      ],
    },
    {
      id: "manual_removal_reminders",
      title: "Remoção manual da pausa mantém lembretes até o início",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead agenda",
          event: message(A, "lead-a-007", "h1", "2026-10-08T12:00:00.000Z", "Quero marcar."),
          fixtures: [{ selector: selector(A, "lead-a-007"), brain_scripts: [{ bubbles: [], book: { ...BOOK_A, appointment_ref: "appt-a-rem" }, confirmation: "Confirmado." }] }],
        },
        { label: "confirmação", event: tick(A, "lead-a-007", "2026-10-08T12:01:01.000Z", "exec-h-1") },
        { label: "empresa remove a pausa", event: command(A, "lead-a-007", { command: "appointment.remove_block", ref: "appt-a-rem", at: "2026-10-08T12:30:00.000Z", actor: adminA }) },
        { label: "lembrete antes do início sai", event: reminder(A, "lead-a-007", "6", "appt-a-rem", "2026-10-09T10:00:00.000Z") },
        { label: "lembrete depois do início é recusado", event: reminder(A, "lead-a-007", "7", "appt-a-rem", "2026-10-09T15:30:00.000Z") },
      ],
    },
    {
      id: "timeout_and_duplicates",
      title: "Timeout vira incerto, sem retry cego; duplicatas de entrada, buffer, entrega e eco",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead escreve",
          event: message(B, "lead-b-008", "i1", "2026-10-08T12:00:00.000Z", "Oi!"),
          fixtures: [{ selector: selector(B, "lead-b-008"), brain_scripts: [{ bubbles: ["T1"] }], provider_scripts: [{ outcome: "timeout" }] }],
        },
        { label: "retry do provedor: mesma mensagem", event: message(B, "lead-b-008", "i1", "2026-10-08T12:00:00.000Z", "Oi!") },
        { label: "execução antiga com sequência velha", event: tick(B, "lead-b-008", "2026-10-08T12:01:01.000Z", "exec-old", 0) },
        { label: "buffer fecha; provedor não responde", event: tick(B, "lead-b-008", "2026-10-08T12:01:02.000Z", "exec-i-1") },
        { label: "retry cego é recusado", event: { type: "recovery", selector: selector(B, "lead-b-008"), operation: "retry", action_text: "T1", at: "2026-10-08T12:02:00.000Z", execution_id: "exec-i-2" } },
        { label: "reconciliação confirma o envio", event: { type: "recovery", selector: selector(B, "lead-b-008"), operation: "reconcile", action_text: "T1", status: "sent", provider_message_id: "fake-reconciled-1", at: "2026-10-08T12:03:00.000Z", execution_id: "exec-i-3" } },
        { label: "segunda tentativa de entrega não encontra ação", event: { type: "recovery", selector: selector(B, "lead-b-008"), operation: "retry", action_text: "T1", at: "2026-10-08T12:04:00.000Z", execution_id: "exec-i-4" } },
        { label: "eco da própria IA não vira intervenção", event: message(B, "lead-b-008", "i-echo", "2026-10-08T12:05:00.000Z", "T1", { from_business: true, is_echo: true, provider_message_id: "fake-reconciled-1" }) },
      ],
    },
    {
      id: "handoff_requires_resume",
      title: "Handoff do cérebro: bloqueia; resolver não retoma; retomada explícita libera",
      initial_store: initialStore(),
      steps: [
        {
          label: "lead pede atendimento humano",
          event: message(B, "lead-b-009", "k1", "2026-10-08T12:00:00.000Z", "Quero falar com alguém."),
          fixtures: [{ selector: selector(B, "lead-b-009"), brain_scripts: [
            { bubbles: ["Vou transferir para a equipe."], handoff: { reason: "pedido_do_lead", summary: "Lead pediu atendimento humano.", priority: "high" } },
            { bubbles: ["De volta com a IA."] },
          ] }],
        },
        { label: "handoff bloqueia antes do envio", event: tick(B, "lead-b-009", "2026-10-08T12:01:01.000Z", "exec-k-1") },
        { label: "lead escreve durante o handoff", event: message(B, "lead-b-009", "k2", "2026-10-08T12:10:00.000Z", "Alguém aí?") },
        { label: "empresa resolve o handoff", event: { type: "command", selector: selector(B, "lead-b-009"), command: { command: "handoff.resolve", ref: "$latest_handoff", at: "2026-10-08T12:20:00.000Z", actor: { role: "cliente_admin", cliente_slug: "empresa_sintetica_b" } } } },
        { label: "resolver não retoma: continua bloqueado", event: tick(B, "lead-b-009", "2026-10-08T12:21:01.000Z", "exec-k-2") },
        { label: "retomada explícita", event: { type: "command", selector: selector(B, "lead-b-009"), command: { command: "handoff.resume", ref: "$latest_handoff", at: "2026-10-08T12:30:00.000Z", actor: { role: "cliente_admin", cliente_slug: "empresa_sintetica_b" } } } },
        { label: "nova mensagem do lead", event: message(B, "lead-b-009", "k3", "2026-10-08T12:35:00.000Z", "Voltei.") },
        { label: "IA responde de novo", event: tick(B, "lead-b-009", "2026-10-08T12:36:01.000Z", "exec-k-3") },
      ],
    },
    {
      id: "isolation_and_policy",
      title: "Isolamento: tenant forjado recusado, empresa sem configuração falha fechado, política só pelo admin",
      initial_store: initialStore(),
      steps: [
        { label: "payload tenta trocar a empresa", event: message(A, shared, "j1", "2026-10-08T12:00:00.000Z", "Oi", { claimed_cliente_slug: "empresa_sintetica_b" }) },
        { label: "empresa C sem configuração de contexto", event: message(C, shared, "j2", "2026-10-08T12:00:00.000Z", "Oi C") },
        { label: "C falha fechado antes do cérebro", event: tick(C, shared, "2026-10-08T12:01:01.000Z", "exec-j-1") },
        { label: "cliente da A tenta mudar a política", event: command(null, null, { command: "policy.set_appointment_pause", environment: ENV, cliente_slug: "empresa_sintetica_a", pause_after_appointment: false, at: "2026-10-08T12:02:00.000Z", actor: adminA }) },
        { label: "cliente da A tenta ler a política da B", event: command(null, null, { command: "policy.read", environment: ENV, cliente_slug: "empresa_sintetica_b", at: "2026-10-08T12:02:00.000Z", actor: adminA }) },
        { label: "cliente da A lê a própria política", event: command(null, null, { command: "policy.read", environment: ENV, cliente_slug: "empresa_sintetica_a", at: "2026-10-08T12:02:00.000Z", actor: adminA }) },
        { label: "admin Lexia liga a pausa da B", event: command(null, null, { command: "policy.set_appointment_pause", environment: ENV, cliente_slug: "empresa_sintetica_b", pause_after_appointment: true, at: "2026-10-08T12:03:00.000Z", actor: lexiaAdmin }) },
        {
          label: "B agenda com a nova política",
          event: message(B, shared, "j3", "2026-10-08T12:10:00.000Z", "Quero marcar."),
          fixtures: [{ selector: selector(B, shared), brain_scripts: [{ bubbles: ["Ok"], book: { ...BOOK_A, appointment_ref: "appt-b-new" }, confirmation: "Confirmado B." }] }],
        },
        { label: "B agora pausa", event: tick(B, shared, "2026-10-08T12:11:01.000Z", "exec-j-2") },
      ],
    },
  ];
}

// JSON-only copy embedded in the scenario runner workflow.
export function buildScenarioBundle() {
  return buildScenarios().map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    initial_store: scenario.initial_store,
    steps: scenario.steps,
  }));
}

import "server-only";

import { createHash } from "node:crypto";

import {
  getAutonomyMetrics,
  getFirstResponseMetrics,
  getFollowupRecoveryMetrics,
  getFollowupsSentCount,
  getOutOfHoursMetrics,
  getUniqueConversationCount,
  isMessageInRange,
  type DashboardMessageMetricRow,
} from "@/lib/dashboard/operational-metrics";
import { getDateInputValue } from "@/lib/dashboard/date-range";
import { getExternalClientMetrics } from "@/lib/metrics/external-client-metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

import type {
  AnalystCoverage,
  AnalystScope,
  AnalystSource,
  AnalystToolExecution,
  AnalystToolName,
  AnalystWorkflowSource,
  AnalystWorkflowSourceInput,
  ConversationObjection,
} from "./types";

export type AnalystContactRow = {
  canal: string | null;
  criado_em: string | null;
  identificador_conversa: string;
  nome: string | null;
  telefone: string | null;
  atualizado_em: string | null;
};

export type AnalystMessageRow = DashboardMessageMetricRow & {
  conteudo: string | null;
  contacto_id: string | null;
  tipo: string | null;
};

type AnalystInsightRow = {
  analisado_ate: string | null;
  analisado_em: string | null;
  canal: string | null;
  confianca: number | string | null;
  evidencias: unknown;
  identificador_conversa: string;
  intencao: string | null;
  objecoes: unknown;
  oportunidades: unknown;
  pontos_fortes: unknown;
  quantidade_mensagens: number | null;
  resultado: string | null;
  resumo: string | null;
  hash_fonte: string;
};

export type AnalystConversationCandidate = {
  canal: string | null;
  contact: AnalystContactRow | null;
  firstInboundAt: string;
  identifier: string;
  lastMessageAt: string;
  messages: AnalystMessageRow[];
};

export type AnalystConversationBatch = {
  conversations: {
    canal: string | null;
    first_message_at: string;
    last_message_at: string;
    message_count: number;
    messages: {
      content: string;
      direction: string | null | undefined;
      id: string | null;
      origin: string | null;
      sent_at: string | null;
      type: string | null;
    }[];
    reference: string;
    transcript_truncated: boolean;
  }[];
  limit: number;
  next_offset: number | null;
  offset: number;
  total: number;
};

type LoadedAnalystData = {
  contactsByConversation: Map<string, AnalystContactRow>;
  messages: AnalystMessageRow[];
  messagesByConversation: Map<string, AnalystMessageRow[]>;
  messagesInRange: AnalystMessageRow[];
  startedConversationIds: Set<string>;
};

const maxToolSources = 12;

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return String(error.code);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function redactConversationText(value: string, maxLength = 700) {
  const sanitized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[telefone]")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.length > maxLength
    ? `${sanitized.slice(0, maxLength - 1).trimEnd()}…`
    : sanitized;
}

function getConversationFirstInbound(
  messages: AnalystMessageRow[],
): string | null {
  return (
    messages.find(
      (message) => message.direccao === "recebida" && message.criado_em,
    )?.criado_em ?? null
  );
}

function getConversationLastMessage(
  messages: AnalystMessageRow[],
): string | null {
  return messages.at(-1)?.criado_em ?? null;
}

function formatConversationLabel(
  contact: AnalystContactRow | undefined,
  identifier: string,
) {
  if (contact?.nome?.trim()) {
    return contact.nome.trim();
  }

  const compact = identifier.length > 24 ? identifier.slice(-18) : identifier;
  return `Conversa ${compact}`;
}

function getTimezoneValue(timezone: string) {
  if (timezone === "Europe/Lisbon") return "lisboa";
  if (timezone === "America/New_York") return "new_york";
  return "brasil";
}

export class AnalystDataContext {
  private dataPromise: Promise<LoadedAnalystData> | null = null;
  private insightsPromise: Promise<AnalystInsightRow[]> | null = null;
  private readonly identifiersByReference = new Map<string, string>();
  private readonly referencesByIdentifier = new Map<string, string>();

  constructor(private readonly scope: AnalystScope) {}

  private async load(): Promise<LoadedAnalystData> {
    if (!this.dataPromise) {
      this.dataPromise = this.loadFromDatabase();
    }

    return this.dataPromise;
  }

  private async loadFromDatabase(): Promise<LoadedAnalystData> {
    const admin = createAdminClient();
    const [contactsResult, messagesResult] = await Promise.all([
      fetchAllSupabaseRows<AnalystContactRow>(async (from, to) => {
        const result = await admin
          .from("lexia_contactos")
          .select(
            "canal, criado_em, identificador_conversa, nome, telefone, atualizado_em",
          )
          .eq("cliente_slug", this.scope.clienteSlug)
          .not("identificador_conversa", "like", "teste:%")
          .order("criado_em", { ascending: true })
          .range(from, to);

        return {
          data: (result.data ?? []) as AnalystContactRow[],
          error: result.error,
        };
      }),
      fetchAllSupabaseRows<AnalystMessageRow>(async (from, to) => {
        const result = await admin
          .from("lexia_mensagens")
          .select(
            "id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em",
          )
          .eq("cliente_slug", this.scope.clienteSlug)
          .not("identificador_conversa", "like", "teste:%")
          .lt("criado_em", this.scope.range.end.toISOString())
          .order("criado_em", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);

        return {
          data: (result.data ?? []) as AnalystMessageRow[],
          error: result.error,
        };
      }),
    ]);

    if (contactsResult.error || messagesResult.error) {
      throw new Error("Não foi possível consultar as conversas deste cliente.");
    }

    const contactsByConversation = new Map(
      contactsResult.data.map((contact) => [
        contact.identificador_conversa,
        contact,
      ]),
    );
    const allowedConversationIds = new Set(
      contactsResult.data
        .filter(
          (contact) =>
            this.scope.channel === "todos" ||
            contact.canal?.toLowerCase() === this.scope.channel,
        )
        .map((contact) => contact.identificador_conversa),
    );
    const messages =
      this.scope.channel === "todos"
        ? messagesResult.data
        : messagesResult.data.filter((message) =>
            allowedConversationIds.has(message.identificador_conversa),
          );
    const messagesByConversation = new Map<string, AnalystMessageRow[]>();

    for (const message of messages) {
      const conversationMessages =
        messagesByConversation.get(message.identificador_conversa) ?? [];
      conversationMessages.push(message);
      messagesByConversation.set(
        message.identificador_conversa,
        conversationMessages,
      );
    }

    const startedConversationIds = new Set<string>();

    for (const [identifier, conversationMessages] of messagesByConversation) {
      const firstInbound = getConversationFirstInbound(conversationMessages);

      if (!firstInbound) continue;

      const firstInboundDate = new Date(firstInbound);
      if (
        firstInboundDate >= this.scope.range.start &&
        firstInboundDate < this.scope.range.end
      ) {
        startedConversationIds.add(identifier);
      }
    }

    return {
      contactsByConversation,
      messages,
      messagesByConversation,
      messagesInRange: messages.filter((message) =>
        isMessageInRange(message, this.scope.range),
      ),
      startedConversationIds,
    };
  }

  private buildSource(
    identifier: string,
    excerpt: string | null,
    messageIds: string[] = [],
  ): AnalystSource {
    const contact = this.cachedContact(identifier);
    const basePath =
      this.scope.role === "lexia_admin"
        ? `/admin/conversas?cliente=${encodeURIComponent(this.scope.clienteSlug)}`
        : "/app/conversas?";
    const separator = basePath.includes("?") && !basePath.endsWith("?") ? "&" : "";
    const rangeQuery = new URLSearchParams({
      conversa: identifier,
      fim: getDateInputValue(
        new Date(this.scope.range.end.getTime() - 1),
        this.scope.timezone,
      ),
      fuso: getTimezoneValue(this.scope.timezone),
      inicio: getDateInputValue(this.scope.range.start, this.scope.timezone),
      periodo: "personalizado",
    });

    if (this.scope.channel !== "todos") {
      rangeQuery.set("canal", this.scope.channel);
    }

    return {
      canal: contact?.canal ?? null,
      conversationId: identifier,
      excerpt: excerpt ? redactConversationText(excerpt, 220) : null,
      href: `${basePath}${separator}${rangeQuery.toString()}`,
      label: formatConversationLabel(contact, identifier),
      messageIds,
    };
  }

  private cachedData: LoadedAnalystData | null = null;

  private initializeConversationReferences(data: LoadedAnalystData) {
    if (this.referencesByIdentifier.size > 0) return;

    Array.from(data.messagesByConversation.keys())
      .sort()
      .forEach((identifier) => {
        const digest = createHash("sha256")
          .update(`${this.scope.clienteSlug}\0${identifier}`)
          .digest("hex")
          .slice(0, 20);
        const reference = `conversa_${digest}`;
        this.referencesByIdentifier.set(identifier, reference);
        this.identifiersByReference.set(reference, identifier);
      });
  }

  private getConversationReference(identifier: string) {
    return this.referencesByIdentifier.get(identifier) ?? "conversa";
  }

  private cachedContact(identifier: string) {
    return this.cachedData?.contactsByConversation.get(identifier);
  }

  private async data() {
    const data = await this.load();
    this.cachedData = data;
    this.initializeConversationReferences(data);
    return data;
  }

  private async insights() {
    if (!this.insightsPromise) {
      const admin = createAdminClient();
      this.insightsPromise = fetchAllSupabaseRows<AnalystInsightRow>(
        async (from, to) => {
          const result = await admin
            .from("lexia_conversation_insights")
            .select(
              "identificador_conversa, canal, resumo, intencao, resultado, objecoes, pontos_fortes, oportunidades, evidencias, confianca, analisado_ate, analisado_em, quantidade_mensagens, hash_fonte",
            )
            .eq("cliente_slug", this.scope.clienteSlug)
            .gte("primeira_mensagem_em", this.scope.range.start.toISOString())
            .lt("primeira_mensagem_em", this.scope.range.end.toISOString())
            .order("primeira_mensagem_em", { ascending: true })
            .range(from, to);

          return {
            data: (result.data ?? []) as AnalystInsightRow[],
            error: result.error,
          };
        },
      ).then((result) => {
        if (result.error) {
          const errorCode = getErrorCode(result.error);
          if (errorCode === "42P01" || errorCode === "PGRST205") {
            throw new Error(
              "A migration do Analista Lexia ainda não foi aplicada.",
            );
          }
          throw new Error("Não foi possível consultar a base analítica.");
        }

        return result.data;
      });
    }

    return this.insightsPromise;
  }

  /**
   * Descarta só o cache da base analítica, mantendo conversas e mensagens
   * já carregadas. Usado depois de gravar insights novos: recalcular a
   * cobertura não pode custar outra leitura do histórico inteiro do cliente.
   */
  invalidateInsights() {
    this.insightsPromise = null;
  }

  private isInsightCurrent(
    insight: AnalystInsightRow,
    data: LoadedAnalystData,
  ) {
    const messages =
      data.messagesByConversation.get(insight.identificador_conversa) ?? [];
    const lastMessageAt = getConversationLastMessage(messages);

    return Boolean(
      insight.analisado_ate &&
        lastMessageAt &&
        new Date(insight.analisado_ate).getTime() >=
          new Date(lastMessageAt).getTime() &&
        Number(insight.quantidade_mensagens ?? 0) >= messages.length,
    );
  }

  async getCoverage(): Promise<AnalystCoverage> {
    const data = await this.data();
    const identifiers = Array.from(data.startedConversationIds);

    if (identifiers.length === 0) {
      return {
        analyzedConversations: 0,
        coveragePercentage: null,
        pendingConversations: 0,
        totalConversations: 0,
        updatedAt: null,
      };
    }

    const insights = await this.insights();

    let analyzedConversations = 0;
    let updatedAt: string | null = null;
    const insightMap = new Map(
      insights.map((insight) => [
        insight.identificador_conversa,
        insight,
      ]),
    );

    for (const identifier of identifiers) {
      const insight = insightMap.get(identifier);
      const isCurrent = insight
        ? this.isInsightCurrent(insight, data)
        : false;

      if (isCurrent) analyzedConversations += 1;

      if (
        insight?.analisado_em &&
        (!updatedAt ||
          new Date(insight.analisado_em).getTime() >
            new Date(updatedAt).getTime())
      ) {
        updatedAt = insight.analisado_em;
      }
    }

    const totalConversations = identifiers.length;

    return {
      analyzedConversations,
      coveragePercentage:
        totalConversations > 0
          ? Math.round((analyzedConversations / totalConversations) * 1000) / 10
          : null,
      pendingConversations: Math.max(
        totalConversations - analyzedConversations,
        0,
      ),
      totalConversations,
      updatedAt,
    };
  }

  async getAnalysisCandidates(
    limit: number,
  ): Promise<AnalystConversationCandidate[]> {
    const data = await this.data();
    const identifiers = Array.from(data.startedConversationIds);
    if (identifiers.length === 0) return [];

    const insights = await this.insights();

    const insightMap = new Map(
      insights.map((insight) => [
        insight.identificador_conversa,
        insight,
      ]),
    );
    const candidates: AnalystConversationCandidate[] = [];

    for (const identifier of identifiers) {
      const messages = data.messagesByConversation.get(identifier) ?? [];
      const firstInboundAt = getConversationFirstInbound(messages);
      const lastMessageAt = getConversationLastMessage(messages);
      if (!firstInboundAt || !lastMessageAt || messages.length === 0) continue;

      const insight = insightMap.get(identifier);
      const isCurrent = Boolean(
        insight?.analisado_ate &&
          new Date(insight.analisado_ate).getTime() >=
            new Date(lastMessageAt).getTime() &&
          Number(insight.quantidade_mensagens ?? 0) >= messages.length,
      );

      if (isCurrent) continue;

      const contact = data.contactsByConversation.get(identifier) ?? null;
      candidates.push({
        canal: contact?.canal ?? null,
        contact,
        firstInboundAt,
        identifier,
        lastMessageAt,
        messages,
      });
    }

    return candidates
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      )
      .slice(0, Math.max(1, Math.min(limit, 8)));
  }

  async getConversationBatch(
    requestedOffset = 0,
    requestedLimit = 4,
  ): Promise<AnalystConversationBatch> {
    const data = await this.data();
    const offset = Math.max(0, Math.floor(requestedOffset) || 0);
    const limit = Math.max(1, Math.min(Math.floor(requestedLimit) || 4, 4));
    const candidates = Array.from(data.startedConversationIds)
      .map((identifier) => {
        const messages = data.messagesByConversation.get(identifier) ?? [];
        const firstMessageAt = getConversationFirstInbound(messages);
        const lastMessageAt = getConversationLastMessage(messages);

        return firstMessageAt && lastMessageAt
          ? { firstMessageAt, identifier, lastMessageAt, messages }
          : null;
      })
      .filter((candidate) => candidate !== null)
      .sort(
        (a, b) =>
          new Date(b.firstMessageAt).getTime() -
          new Date(a.firstMessageAt).getTime(),
      );
    const page = candidates.slice(offset, offset + limit);

    return {
      conversations: page.map((candidate) => {
        const selectedMessages: AnalystMessageRow[] = [];
        let transcriptSize = 0;

        for (const message of candidate.messages.slice(-120).reverse()) {
          const content = redactConversationText(message.conteudo ?? "", 900);
          const lineSize = content.length + 120;

          if (
            selectedMessages.length >= 120 ||
            transcriptSize + lineSize > 24000
          ) {
            break;
          }

          selectedMessages.unshift(message);
          transcriptSize += lineSize;
        }

        return {
          canal:
            data.contactsByConversation.get(candidate.identifier)?.canal ?? null,
          first_message_at: candidate.firstMessageAt,
          last_message_at: candidate.lastMessageAt,
          message_count: candidate.messages.length,
          messages: selectedMessages.map((message) => ({
            content: redactConversationText(message.conteudo ?? "", 900),
            direction: message.direccao,
            id: message.id ?? null,
            origin: message.origem,
            sent_at: message.criado_em,
            type: message.tipo,
          })),
          reference: this.getConversationReference(candidate.identifier),
          transcript_truncated:
            selectedMessages.length < candidate.messages.length,
        };
      }),
      limit,
      next_offset:
        offset + page.length < candidates.length
          ? offset + page.length
          : null,
      offset,
      total: candidates.length,
    };
  }

  toWorkflowSources(sources: AnalystSource[]): AnalystWorkflowSource[] {
    return sources.slice(0, maxToolSources).map((source) => ({
      canal: source.canal,
      conversation_reference: this.getConversationReference(
        source.conversationId,
      ),
      excerpt: source.excerpt,
      message_ids: source.messageIds.slice(0, 80),
    }));
  }

  async resolveWorkflowSources(
    sourceInputs: AnalystWorkflowSourceInput[],
  ): Promise<AnalystSource[]> {
    const data = await this.data();
    const resolved = new Map<string, AnalystSource>();

    for (const sourceInput of sourceInputs.slice(0, maxToolSources)) {
      const reference = String(
        sourceInput.conversation_reference ?? "",
      ).trim();
      const identifier = this.identifiersByReference.get(reference);

      if (!identifier || resolved.has(identifier)) continue;

      const conversationMessages =
        data.messagesByConversation.get(identifier) ?? [];
      const hasActivityInRange = data.messagesInRange.some(
        (message) => message.identificador_conversa === identifier,
      );

      if (!hasActivityInRange) continue;

      const allowedMessageIds = new Set(
        conversationMessages.flatMap((message) =>
          message.id ? [message.id] : [],
        ),
      );
      const requestedMessageIds = Array.isArray(sourceInput.message_ids)
        ? sourceInput.message_ids
            .map((value) => String(value))
            .filter((value) => allowedMessageIds.has(value))
            .slice(0, 80)
        : [];
      const requestedExcerpt =
        typeof sourceInput.excerpt === "string"
          ? sourceInput.excerpt
          : null;
      const fallbackExcerpt = conversationMessages.find((message) =>
        requestedMessageIds.includes(message.id ?? ""),
      )?.conteudo;

      resolved.set(
        identifier,
        this.buildSource(
          identifier,
          requestedExcerpt || fallbackExcerpt || null,
          requestedMessageIds,
        ),
      );
    }

    return Array.from(resolved.values());
  }

  async getPerformanceOverview(): Promise<AnalystToolExecution> {
    const data = await this.data();
    const externalMetrics =
      this.scope.channel === "todos"
        ? await getExternalClientMetrics(
            this.scope.clienteSlug,
            this.scope.range,
          )
        : null;
    const autonomy = getAutonomyMetrics(
      data.messagesInRange,
      this.scope.range,
    );
    const followupRecovery = getFollowupRecoveryMetrics(
      data.messages,
      this.scope.range,
    );
    const firstResponse = getFirstResponseMetrics(
      data.messages,
      this.scope.range,
    );
    const outOfHours = getOutOfHoursMetrics(
      data.messagesInRange,
      this.scope.timezone,
    );
    const received = data.messagesInRange.filter(
      (message) => message.direccao === "recebida",
    ).length;
    const sent = data.messagesInRange.filter(
      (message) => message.direccao === "enviada",
    ).length;

    return {
      name: "obter_desempenho",
      result: {
        agendamentos: externalMetrics?.appointments ?? null,
        agendamentos_configurados: externalMetrics?.isConfigured ?? false,
        agendamentos_observacao:
          this.scope.channel === "todos"
            ? "Métrica agregada do banco externo; não atribui agendamento a uma conversa específica."
            : "Indisponível por canal porque os agendamentos externos não têm vínculo confiável com a conversa.",
        autonomia: {
          conversas_autonomas: autonomy.autonomousConversations,
          conversas_com_intervencao: autonomy.interventionConversations,
          dados_disponiveis: autonomy.dataAvailable,
          limitada_desde_2026_08_01: autonomy.limitedByDataStart,
          percentual: autonomy.percentage,
        },
        conversas_ativas: getUniqueConversationCount(data.messagesInRange),
        conversas_iniciadas: data.startedConversationIds.size,
        followups_enviados: getFollowupsSentCount(data.messagesInRange),
        recuperacao_followup: followupRecovery,
        mensagens_recebidas: received,
        mensagens_enviadas: sent,
        periodo: this.scope.range.label,
        respostas_fora_horario: outOfHours,
        tempo_primeira_resposta: firstResponse,
      },
      sources: [],
    };
  }

  async getObjectionAnalysis(limit = 8): Promise<AnalystToolExecution> {
    const data = await this.data();
    const coverage = await this.getCoverage();
    const identifiers = Array.from(data.startedConversationIds);

    if (identifiers.length === 0) {
      return {
        name: "analisar_objecoes",
        result: { coverage, objecoes: [] },
        sources: [],
      };
    }

    const insights = await this.insights();

    const objectionMap = new Map<
      string,
      {
        conversations: Set<string>;
        evidenceIds: Set<string>;
        label: string;
        summaries: Set<string>;
      }
    >();

    for (const insight of insights) {
      if (
        !data.startedConversationIds.has(insight.identificador_conversa) ||
        !this.isInsightCurrent(insight, data)
      ) {
        continue;
      }
      const objections = asArray<ConversationObjection>(insight.objecoes);
      const seenInConversation = new Set<string>();

      for (const objection of objections) {
        const category = String(objection.categoria || "outra").trim();
        if (!category || seenInConversation.has(category)) continue;
        seenInConversation.add(category);

        const current = objectionMap.get(category) ?? {
          conversations: new Set<string>(),
          evidenceIds: new Set<string>(),
          label: objection.rotulo || category,
          summaries: new Set<string>(),
        };
        current.conversations.add(insight.identificador_conversa);
        if (objection.resumo) current.summaries.add(objection.resumo);
        for (const id of objection.evidence_message_ids ?? []) {
          current.evidenceIds.add(id);
        }
        objectionMap.set(category, current);
      }
    }

    const ranked = Array.from(objectionMap.entries())
      .map(([category, item]) => ({
        categoria: category,
        conversas: item.conversations.size,
        exemplos: Array.from(item.summaries).slice(0, 3),
        label: item.label,
        percentual:
          coverage.analyzedConversations > 0
            ? Math.round(
                (item.conversations.size / coverage.analyzedConversations) *
                  1000,
              ) / 10
            : null,
        sourceConversationIds: Array.from(item.conversations),
        sourceMessageIds: Array.from(item.evidenceIds),
      }))
      .sort((a, b) => b.conversas - a.conversas)
      .slice(0, Math.max(1, Math.min(limit, 12)));

    const sources = ranked
      .flatMap((objection) =>
        objection.sourceConversationIds.slice(0, 2).map((identifier) =>
          this.buildSource(
            identifier,
            objection.exemplos[0] ?? null,
            objection.sourceMessageIds,
          ),
        ),
      )
      .slice(0, maxToolSources);

    return {
      name: "analisar_objecoes",
      result: {
        cobertura: coverage,
        observacao:
          coverage.coveragePercentage === 100
            ? "Todas as conversas iniciadas no período foram analisadas."
            : "Os percentuais representam apenas as conversas já analisadas; informe a cobertura na resposta.",
        objecoes: ranked.map((item) => ({
          categoria: item.categoria,
          conversas: item.conversas,
          exemplos: item.exemplos.map((example) =>
            redactConversationText(example, 350),
          ),
          label: item.label,
          percentual: item.percentual,
        })),
      },
      sources,
    };
  }

  async getQualityAnalysis(limit = 8): Promise<AnalystToolExecution> {
    const data = await this.data();
    const coverage = await this.getCoverage();
    const identifiers = Array.from(data.startedConversationIds);

    if (identifiers.length === 0) {
      return {
        name: "analisar_qualidade",
        result: { cobertura: coverage, conversas_analisadas: [] },
        sources: [],
      };
    }

    const insights = await this.insights();
    const rows = insights
      .filter((insight) =>
        data.startedConversationIds.has(insight.identificador_conversa) &&
        this.isInsightCurrent(insight, data),
      )
      .sort(
        (a, b) =>
          new Date(b.analisado_em ?? 0).getTime() -
          new Date(a.analisado_em ?? 0).getTime(),
      )
      .slice(0, Math.max(1, Math.min(limit, 12)));
    const sources = rows.slice(0, maxToolSources).map((insight) =>
      this.buildSource(
        insight.identificador_conversa,
        insight.resumo,
        [
          ...asArray<{ evidence_message_ids?: string[] }>(
            insight.pontos_fortes,
          ),
          ...asArray<{ evidence_message_ids?: string[] }>(
            insight.oportunidades,
          ),
        ].flatMap((item) => item.evidence_message_ids ?? []),
      ),
    );

    return {
      name: "analisar_qualidade",
      result: {
        cobertura: coverage,
        conversas_analisadas: rows.map((insight) => ({
          confianca: Number(insight.confianca ?? 0),
          intencao: redactConversationText(insight.intencao ?? "", 300),
          oportunidades: asArray<{ texto?: string }>(insight.oportunidades).map(
            (item) => ({ texto: redactConversationText(item.texto ?? "", 500) }),
          ),
          pontos_fortes: asArray<{ texto?: string }>(insight.pontos_fortes).map(
            (item) => ({ texto: redactConversationText(item.texto ?? "", 500) }),
          ),
          referencia: this.getConversationReference(
            insight.identificador_conversa,
          ),
          resultado: insight.resultado,
          resumo: redactConversationText(insight.resumo ?? "", 700),
        })),
        observacao:
          "Sintetize padrões, mas preserve a distinção entre evidência observada e recomendação.",
      },
      sources,
    };
  }

  async searchConversations(
    query: string,
    limit = 6,
  ): Promise<AnalystToolExecution> {
    const data = await this.data();
    const terms = normalizeSearchText(query)
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3)
      .slice(0, 8);

    if (terms.length === 0) {
      return {
        name: "buscar_conversas",
        result: { conversas: [], consulta: query },
        sources: [],
      };
    }

    const matches = new Map<
      string,
      { excerpts: string[]; messageIds: string[]; score: number }
    >();

    for (const message of data.messagesInRange) {
      const content = message.conteudo?.trim();
      if (!content) continue;
      const normalized = normalizeSearchText(content);
      const score = terms.reduce(
        (total, term) => total + (normalized.includes(term) ? 1 : 0),
        0,
      );
      if (score === 0) continue;

      const current = matches.get(message.identificador_conversa) ?? {
        excerpts: [],
        messageIds: [],
        score: 0,
      };
      current.score += score;
      if (current.excerpts.length < 3) current.excerpts.push(content);
      if (message.id) current.messageIds.push(message.id);
      matches.set(message.identificador_conversa, current);
    }

    const ranked = Array.from(matches.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, Math.max(1, Math.min(limit, 10)));
    const sources = ranked.map(([identifier, item]) =>
      this.buildSource(identifier, item.excerpts[0] ?? null, item.messageIds),
    );

    return {
      name: "buscar_conversas",
      result: {
        consulta: query,
        conversas: ranked.map(([identifier, item]) => ({
          mensagens_encontradas: item.excerpts.map((excerpt) =>
            redactConversationText(excerpt, 350),
          ),
          referencia: this.getConversationReference(identifier),
          relevancia_lexical: item.score,
        })),
        observacao:
          "Busca textual por termos dentro do período; ainda não é busca semântica.",
      },
      sources,
    };
  }

  async openConversation(reference: string): Promise<AnalystToolExecution> {
    const data = await this.data();
    const identifier = this.identifiersByReference.get(reference);

    if (!identifier) {
      return {
        name: "abrir_conversa",
        result: { erro: "Referência de conversa inválida para esta consulta." },
        sources: [],
      };
    }

    const hasActivityInRange = data.messagesInRange.some(
      (message) => message.identificador_conversa === identifier,
    );

    if (!hasActivityInRange) {
      return {
        name: "abrir_conversa",
        result: {
          erro:
            "A conversa solicitada não pertence ao cliente/canal ou não teve atividade no período selecionado.",
        },
        sources: [],
      };
    }

    const conversationMessages =
      data.messagesByConversation.get(identifier) ?? [];
    const messages: AnalystMessageRow[] = [];
    let transcriptSize = 0;

    for (const message of conversationMessages.slice(-100).reverse()) {
      const contentSize = Math.min(message.conteudo?.length ?? 0, 900);
      if (messages.length >= 80 || transcriptSize + contentSize > 30000) break;
      messages.unshift(message);
      transcriptSize += contentSize;
    }
    const source = this.buildSource(
      identifier,
      messages.find((message) => message.conteudo)?.conteudo ?? null,
      messages.flatMap((message) => (message.id ? [message.id] : [])),
    );

    return {
      name: "abrir_conversa",
      result: {
        canal: source.canal,
        mensagens: messages.map((message) => ({
          conteudo: redactConversationText(message.conteudo ?? "", 900),
          direcao: message.direccao,
          horario: message.criado_em,
          origem: message.origem,
          tipo: message.tipo,
        })),
        referencia: reference,
        observacao:
          messages.length < conversationMessages.length
            ? `Foram retornadas as ${messages.length} mensagens mais recentes que cabem com segurança no contexto.`
            : "Histórico completo disponível até o fim do período selecionado.",
      },
      sources: [source],
    };
  }

  async getFeedbackSummary(): Promise<AnalystToolExecution> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("lexia_feedbacks")
      .select("id, avaliacao, comentario, status, criado_em")
      .eq("cliente_slug", this.scope.clienteSlug)
      .gte("criado_em", this.scope.range.start.toISOString())
      .lt("criado_em", this.scope.range.end.toISOString())
      .order("criado_em", { ascending: false })
      .limit(100);

    if (error) {
      throw new Error("Não foi possível consultar os feedbacks.");
    }

    const counts: Record<string, number> = {};
    for (const feedback of data ?? []) {
      const key = feedback.avaliacao || "sem_avaliacao";
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return {
      name: "resumir_feedbacks",
      result: {
        comentarios_recentes: (data ?? [])
          .filter((feedback) => feedback.comentario)
          .slice(0, 15)
          .map((feedback) => ({
            avaliacao: feedback.avaliacao,
            comentario: redactConversationText(feedback.comentario, 500),
            criado_em: feedback.criado_em,
            status: feedback.status,
          })),
        contagens: counts,
        total: data?.length ?? 0,
      },
      sources: [],
    };
  }

  async executeTool(
    name: AnalystToolName,
    argumentsValue: Record<string, unknown>,
  ): Promise<AnalystToolExecution> {
    if (name === "obter_desempenho") return this.getPerformanceOverview();
    if (name === "analisar_objecoes") {
      return this.getObjectionAnalysis(Number(argumentsValue.limite ?? 8));
    }
    if (name === "analisar_qualidade") {
      return this.getQualityAnalysis(Number(argumentsValue.limite ?? 8));
    }
    if (name === "buscar_conversas") {
      return this.searchConversations(
        String(argumentsValue.consulta ?? ""),
        Number(argumentsValue.limite ?? 6),
      );
    }
    if (name === "abrir_conversa") {
      return this.openConversation(
        String(argumentsValue.referencia_conversa ?? ""),
      );
    }
    if (name === "resumir_feedbacks") return this.getFeedbackSummary();

    throw new Error("Ferramenta não permitida.");
  }
}

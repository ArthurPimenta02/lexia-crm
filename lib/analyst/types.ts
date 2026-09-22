import type { DashboardDateRange } from "@/lib/dashboard/date-range";
import type { LexiaUserRole } from "@/lib/auth/profile";

export const analystChannels = [
  "todos",
  "whatsapp",
  "instagram",
  "messenger",
] as const;

export type AnalystChannel = (typeof analystChannels)[number];

export type AnalystSource = {
  canal: string | null;
  conversationId: string;
  excerpt: string | null;
  href: string;
  label: string;
  messageIds: string[];
};

export type AnalystScopeInput = {
  canal?: string;
  clienteSlug?: string;
  fim?: string;
  inicio?: string;
  periodo?: string;
};

export type AnalystScope = {
  channel: AnalystChannel;
  clienteName: string;
  clienteSlug: string;
  range: DashboardDateRange;
  role: LexiaUserRole;
  timezone: string;
  userId: string;
};

export type AnalystCoverage = {
  analyzedConversations: number;
  coveragePercentage: number | null;
  pendingConversations: number;
  totalConversations: number;
  updatedAt: string | null;
};

export type AnalystChatMessage = {
  content: string;
  id: string;
  role: "user" | "assistant";
  sources?: AnalystSource[];
};

export type AnalystWorkflowSource = {
  canal: string | null;
  conversation_reference: string;
  excerpt: string | null;
  message_ids: string[];
};

export type AnalystWorkflowSourceInput = {
  conversation_reference?: unknown;
  excerpt?: unknown;
  message_ids?: unknown;
};

export type ConversationObjection = {
  categoria: string;
  evidence_message_ids: string[];
  resumo: string;
  rotulo: string;
};

export type ConversationInsightPayload = {
  confianca: number;
  etapa_comercial: string;
  evidencias: {
    message_ids: string[];
    nota: string;
  }[];
  intencao: string;
  objecoes: ConversationObjection[];
  oportunidades: {
    evidence_message_ids: string[];
    texto: string;
  }[];
  pontos_fortes: {
    evidence_message_ids: string[];
    texto: string;
  }[];
  resultado: string;
  resumo: string;
  sentimento: string;
};

export type AnalystToolName =
  | "obter_desempenho"
  | "analisar_objecoes"
  | "analisar_qualidade"
  | "buscar_conversas"
  | "abrir_conversa"
  | "resumir_feedbacks";

export type AnalystN8nToolName =
  | AnalystToolName
  | "listar_conversas"
  | "obter_cobertura";

export type AnalystToolExecution = {
  name: AnalystToolName;
  result: Record<string, unknown>;
  sources: AnalystSource[];
};

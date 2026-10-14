export type CapabilityDecision =
  | "preserve_master"
  | "preserve_adapter"
  | "separate_workflow"
  | "correct"
  | "defer";

export type OmnichannelCapability = {
  id: string;
  label: string;
  component: string;
  decisions: CapabilityDecision[];
  provisional: boolean;
};

export const omnichannelCapabilityMatrix = [
  {
    id: "trusted_scope",
    label: "Trusted company and account resolution",
    component: "Resolve Scope",
    decisions: ["correct"],
    provisional: true,
  },
  {
    id: "context_agent",
    label: "Shared context agent with tenant configuration",
    component: "Context Agent",
    decisions: ["preserve_master", "correct"],
    provisional: true,
  },
  {
    id: "human_audio",
    label: "Human team audio and transcription",
    component: "Ingress and Media Normalize",
    decisions: ["preserve_adapter", "correct"],
    provisional: true,
  },
  {
    id: "authorship",
    label: "Lead, human agent and AI authorship",
    component: "Ingest",
    decisions: ["preserve_master", "correct"],
    provisional: true,
  },
  {
    id: "history",
    label: "Scoped conversation history",
    component: "Buffer Context",
    decisions: ["preserve_master", "correct"],
    provisional: true,
  },
  ...["text", "audio", "image", "pdf"].map((kind) => ({
    id: `inbound_${kind}`,
    label: `Inbound ${kind}`,
    component: kind === "text" ? "Adapter Ingress" : "Media Normalize",
    decisions: ["preserve_adapter"] as CapabilityDecision[],
    provisional: true,
  })),
  {
    id: "inbound_video",
    label: "Inbound video",
    component: "Media Normalize",
    decisions: ["preserve_adapter", "defer"],
    provisional: true,
  },
  {
    id: "meta_events",
    label: "Meta events and filters",
    component: "Meta Adapter Ingress",
    decisions: ["preserve_adapter", "correct"],
    provisional: true,
  },
  {
    id: "zapi_events",
    label: "Z-API events and filters",
    component: "Z-API Adapter Ingress",
    decisions: ["preserve_adapter", "correct"],
    provisional: true,
  },
  {
    id: "contact_without_phone",
    label: "Provider contact without a phone number",
    component: "Ingest",
    decisions: ["correct"],
    provisional: true,
  },
  {
    id: "ad_origin",
    label: "Structured advertisement origin",
    component: "Adapter Ingress",
    decisions: ["preserve_adapter", "correct"],
    provisional: true,
  },
  {
    id: "brain_boundary",
    label: "Private brain boundary",
    component: "Invoke Brain",
    decisions: ["separate_workflow"],
    provisional: true,
  },
  {
    id: "tools_boundary",
    label: "Private tools boundary",
    component: "Brain workflow",
    decisions: ["separate_workflow"],
    provisional: true,
  },
  {
    id: "reminders",
    label: "Appointment reminders",
    component: "Automation workflow",
    decisions: ["separate_workflow"],
    provisional: true,
  },
  {
    id: "followups",
    label: "Follow-ups",
    component: "Automation workflow",
    decisions: ["separate_workflow", "correct"],
    provisional: true,
  },
  {
    id: "ordered_delivery",
    label: "Ordered text, image and caption delivery",
    component: "Delivery Gate and Provider Send",
    decisions: ["preserve_master", "correct"],
    provisional: true,
  },
] satisfies OmnichannelCapability[];

export function getOmnichannelCapability(id: string) {
  return omnichannelCapabilityMatrix.find((capability) => capability.id === id);
}

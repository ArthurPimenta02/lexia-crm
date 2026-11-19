import "server-only";

import OpenAI from "openai";

let openAIClient: OpenAI | null = null;

export const analystPromptVersion = "lexia_analyst_v1";
export const classifierPromptVersion = "lexia_conversation_classifier_v1";

export function getAnalystModel() {
  return process.env.OPENAI_ANALYST_MODEL?.trim() || "gpt-5-mini";
}

export function getClassifierModel() {
  return (
    process.env.OPENAI_ANALYST_CLASSIFIER_MODEL?.trim() || getAnalystModel()
  );
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no servidor.");
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({ apiKey });
  }

  return openAIClient;
}

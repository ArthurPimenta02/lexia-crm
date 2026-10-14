import assert from "node:assert/strict";
import test from "node:test";

import {
  detectLanguage,
  resolveLeadLanguage,
  validateResponseLanguages,
} from "../lib/omnichannel/language-policy";

test("detects Portuguese, English and Spanish lead messages", () => {
  assert.equal(
    detectLanguage("Olá, gostaria de conhecer os tratamentos para a pele.").language,
    "pt",
  );
  assert.equal(
    detectLanguage("Hello, I would like to know which skin treatments are available.").language,
    "en",
  );
  assert.equal(
    detectLanguage("Hola, quisiera saber qué tratamientos para la piel tienen disponibles.").language,
    "es",
  );
  assert.equal(detectLanguage("oi").language, "pt");
  assert.equal(detectLanguage("hello").language, "en");
  assert.equal(detectLanguage("hola").language, "es");
});

test("an explicit request changes language and an ambiguous reply keeps context", () => {
  assert.equal(resolveLeadLanguage("English, please.", "pt"), "en");
  assert.equal(
    resolveLeadLanguage("Gostaria de ser atendido em espanhol", "pt"),
    "es",
  );
  assert.equal(
    resolveLeadLanguage("Gostaria de ser atendido em espanol", "pt"),
    "es",
  );
  assert.equal(resolveLeadLanguage("ok", "es"), "es");
  assert.equal(resolveLeadLanguage("sim", "pt"), "pt");
});

test("response validation fails closed on a clearly different language", () => {
  assert.equal(
    validateResponseLanguages("en", ["Hello, how can I help you today?"]).allowed,
    true,
  );
  const mismatch = validateResponseLanguages("es", [
    "Olá, posso ajudar você a escolher um tratamento.",
  ]);
  assert.equal(mismatch.allowed, false);
  assert.equal(mismatch.reason, "response_language_mismatch");
});

test("neutral universal content does not invent a conflicting language", () => {
  const validation = validateResponseLanguages("pt", ["OK."]);
  assert.equal(validation.allowed, true);
  assert.equal(validation.reason, "neutral_text");
});

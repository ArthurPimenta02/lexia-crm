import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTestWorkflowPayload,
  parseWorkflowAllowedHosts,
  toWorkflowAdminSummary,
  toWorkflowPublic,
  validateWorkflowWebhookUrl,
} from "../lib/workflows/contracts";

test("workflow destination accepts only an exact allowlisted HTTPS host", () => {
  const hosts = parseWorkflowAllowedHosts("n8n.example.com, hooks.example.com");

  assert.equal(
    validateWorkflowWebhookUrl("https://n8n.example.com/webhook/test", hosts),
    "https://n8n.example.com/webhook/test",
  );
  assert.throws(
    () =>
      validateWorkflowWebhookUrl(
        "https://n8n.example.com.attacker.test/webhook/test",
        hosts,
      ),
    /não está autorizado/,
  );
  assert.throws(
    () => validateWorkflowWebhookUrl("http://n8n.example.com/test", hosts),
    /HTTPS/,
  );
  assert.throws(
    () =>
      validateWorkflowWebhookUrl(
        "https://user:secret@n8n.example.com/test",
        hosts,
      ),
    /credenciais/,
  );
  assert.throws(
    () =>
      validateWorkflowWebhookUrl(
        "https://n8n.example.com:8443/webhook/test",
        hosts,
      ),
    /porta personalizada/,
  );
});

test("workflow DTOs never expose webhook_url", () => {
  const row = {
    cliente_slug: "cliente_a",
    id: "workflow-1",
    nome: "Teste",
    status: "ativo",
    tipo: "whatsapp",
    webhook_url: "https://n8n.example.com/private/token",
  };

  const publicDto = toWorkflowPublic(row);
  const adminDto = toWorkflowAdminSummary(row);

  assert.equal("webhook_url" in publicDto, false);
  assert.equal("webhook_url" in adminDto, false);
  assert.equal(adminDto.webhookConfigured, true);
  assert.doesNotMatch(JSON.stringify([publicDto, adminDto]), /private\/token/);
});

test("test dispatch payload derives its correlation fields on the server", () => {
  assert.deepEqual(
    buildTestWorkflowPayload({
      message: "Olá",
      origin: "painel_cliente",
      runId: "run-server",
      sessionId: "session-server",
      workflow: { id: "workflow-server", tipo: "instagram" },
    }),
    {
      lexia_modo_teste: true,
      lexia_origem: "painel_cliente",
      lexia_run_id: "run-server",
      lexia_session_id: "session-server",
      lexia_teste_id: "",
      lexia_workflow_id: "workflow-server",
      lexia_workflow_tipo: "instagram",
      message: { text: "Olá", type: "text" },
    },
  );
});

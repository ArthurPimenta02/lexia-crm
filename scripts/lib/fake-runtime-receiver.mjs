import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:https";

function constantTimeEqual(actual, expected) {
  const left = Buffer.from(String(actual ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("request_too_large");
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export async function createFakeRuntimeReceiver({
  admin,
  analystSecret,
  certificate,
  key,
}) {
  const workflowRequests = [];
  const analystRequests = [];

  const server = createServer({ cert: certificate, key }, async (request, response) => {
    try {
      const host = String(request.headers.host ?? "").toLowerCase();
      const path = new URL(request.url ?? "/", "https://localhost").pathname;

      if (request.method !== "POST" || !host.startsWith("localhost:")) {
        sendJson(response, 404, { ok: false });
        return;
      }

      if (path === "/analyst") {
        if (
          !constantTimeEqual(
            request.headers.authorization,
            `Bearer ${analystSecret}`,
          )
        ) {
          sendJson(response, 401, { ok: false });
          return;
        }

        const body = await readJson(request);
        if (
          body?.event !== "lexia.analyst.question.created" ||
          typeof body?.execution_id !== "string" ||
          typeof body?.session_id !== "string"
        ) {
          sendJson(response, 400, { ok: false });
          return;
        }

        analystRequests.push({
          callback: body.endpoints?.callback,
          executionId: body.execution_id,
          sessionId: body.session_id,
          tool: body.endpoints?.tool,
        });
        sendJson(response, 202, { accepted: true });
        return;
      }

      if (path !== "/workflow/v1" && path !== "/workflow/v2") {
        sendJson(response, 404, { ok: false });
        return;
      }

      const body = await readJson(request);
      const runId = String(body?.lexia_run_id ?? "");
      const sessionId = String(body?.lexia_session_id ?? "");
      const workflowId = String(body?.lexia_workflow_id ?? "");
      const origin = String(body?.lexia_origem ?? "");
      const message = String(body?.message?.text ?? "").trim();

      if (
        body?.lexia_modo_teste !== true ||
        !runId ||
        !sessionId ||
        !workflowId ||
        !message ||
        !["painel_admin", "painel_cliente"].includes(origin)
      ) {
        sendJson(response, 400, { ok: false });
        return;
      }

      const { data: workflow, error: workflowError } = await admin
        .from("lexia_workflows")
        .select("id, cliente_slug, status")
        .eq("id", workflowId)
        .eq("status", "ativo")
        .maybeSingle();
      if (workflowError || !workflow) {
        sendJson(response, 409, { ok: false });
        return;
      }

      const { data: session, error: sessionError } = await admin
        .from("lexia_testes_sessoes")
        .select("id")
        .eq("cliente_slug", workflow.cliente_slug)
        .eq("session_id", sessionId)
        .eq("origem", origin)
        .maybeSingle();
      if (sessionError || !session) {
        sendJson(response, 409, { ok: false });
        return;
      }

      const version = path.endsWith("v1") ? "v1" : "v2";
      const answer = `Resposta sintética ${version} para ${origin}`;
      const { data: execution, error: executionError } = await admin
        .from("lexia_testes_execucoes")
        .insert({
          cliente_slug: workflow.cliente_slug,
          mensagem_teste: message,
          mensagens: [{ content: answer, role: "assistant" }],
          origem: origin,
          raw_agente: {
            fake_receiver: true,
            version,
          },
          resposta_obtida: answer,
          rota: "geral",
          run_id: runId,
          session_id: sessionId,
          teste_id: null,
        })
        .select("id")
        .single();

      if (executionError || !execution) {
        sendJson(response, 500, { ok: false });
        return;
      }

      workflowRequests.push({
        executionId: execution.id,
        origin,
        path,
        runId,
        sessionId,
        workflowId,
      });
      sendJson(response, 200, { accepted: true, run_id: runId });
    } catch {
      sendJson(response, 500, { ok: false });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fake HTTPS receiver did not expose a TCP port.");
  }

  return {
    analystRequests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    origin: `https://localhost:${address.port}`,
    workflowRequests,
  };
}

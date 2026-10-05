import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  assertIsolatedRemoteIdentity,
  validateIsolatedTestTarget,
} from "./lib/target-identity.mjs";

// This suite validates only the minimal database harness. It does not exercise
// the Next.js Server Actions or a successful HTTP workflow dispatch.
const localEnvironmentFile =
  process.env.LEXIA_LOTE1_ENV_FILE?.trim() || ".env.lote1.test.local";

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const url = process.env.LEXIA_TEST_SUPABASE_URL?.trim();
const anonKey = process.env.LEXIA_TEST_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey =
  process.env.LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim();
const confirmation = process.env.LEXIA_TEST_CONFIRM_ISOLATED?.trim();
const applicationUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const testProjectRef =
  process.env.LEXIA_TEST_SUPABASE_PROJECT_REF?.trim();
const productionProjectRef =
  process.env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF?.trim();
const protectedProjectRefs =
  process.env.LEXIA_PROTECTED_SUPABASE_PROJECT_REFS?.trim();

if (!url || !anonKey || !serviceRoleKey) {
  console.error(
    `Minimal database tests skipped: configure ${localEnvironmentFile} with ` +
      "LEXIA_TEST_SUPABASE_URL, " +
      "LEXIA_TEST_SUPABASE_ANON_KEY, LEXIA_TEST_SUPABASE_SERVICE_ROLE_KEY " +
      "and the explicit project identity variables documented in the runbook.",
  );
  process.exit(2);
}

let verifiedProjectRef;
try {
  ({ testProjectRef: verifiedProjectRef } = validateIsolatedTestTarget({
    anonKey,
    applicationUrl,
    confirmation,
    productionProjectRef,
    protectedProjectRefs,
    serviceRoleKey,
    testProjectRef,
    testUrl: url,
  }));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid isolated test target.",
  );
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const slugs = {
  a: `lote1_a_${suffix}`,
  b: `lote1_b_${suffix}`,
  inactive: `lote1_inactive_${suffix}`,
};
const createdUsers = [];
const cleanupFailures = [];

function userClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createUser(label) {
  const email = `lexia-lote1-${label}-${suffix}@example.com`;
  const password = `Lx!${randomUUID()}9a`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (error || !data.user) throw error ?? new Error("Auth user missing.");
  createdUsers.push(data.user.id);
  return { email, id: data.user.id, password };
}

async function signIn(credentials) {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return client;
}

async function cleanup() {
  const allSlugs = Object.values(slugs);

  const cleanupOperations = [
    [
      "lexia_user_link_pendencias",
      admin
        .from("lexia_user_link_pendencias")
        .delete()
        .in("cliente_slug", allSlugs),
    ],
    [
      "lexia_ai_mensagens",
      admin.from("lexia_ai_mensagens").delete().in("cliente_slug", allSlugs),
    ],
    [
      "lexia_ai_execucoes",
      admin.from("lexia_ai_execucoes").delete().in("cliente_slug", allSlugs),
    ],
    [
      "lexia_ai_sessoes",
      admin.from("lexia_ai_sessoes").delete().in("cliente_slug", allSlugs),
    ],
    [
      "lexia_conversation_insights",
      admin
        .from("lexia_conversation_insights")
        .delete()
        .in("cliente_slug", allSlugs),
    ],
    [
      "lexia_workflows",
      admin.from("lexia_workflows").delete().in("cliente_slug", allSlugs),
    ],
  ];

  for (const [resource, operation] of cleanupOperations) {
    const { error } = await operation;
    if (error) cleanupFailures.push({ code: error.code, resource });
  }

  if (createdUsers.length > 0) {
    const { error: profilesError } = await admin
      .from("lexia_usuarios_clientes")
      .delete()
      .in("user_id", createdUsers);
    if (profilesError) {
      cleanupFailures.push({
        code: profilesError.code,
        resource: "lexia_usuarios_clientes",
      });
    }
  }

  const { error: clientsError } = await admin
    .from("lexia_clientes")
    .delete()
    .in("slug", allSlugs);
  if (clientsError) {
    cleanupFailures.push({
      code: clientsError.code,
      resource: "lexia_clientes",
    });
  }

  for (const userId of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      cleanupFailures.push({
        code: error.code ?? "auth_cleanup_failed",
        resource: "auth.users",
      });
    }
  }
}

async function verifyRemoteIdentityBeforeWrites() {
  const { data: identity, error: identityError } = await admin
    .from("lexia_environment_identity")
    .select("project_ref, environment, disposable")
    .eq("id", true)
    .maybeSingle();

  if (identityError) {
    throw new Error(
      "Refused before writes: the remote disposable identity marker is missing or mismatched.",
    );
  }

  try {
    assertIsolatedRemoteIdentity(identity, verifiedProjectRef);
  } catch {
    throw new Error(
      "Refused before writes: the remote disposable identity marker is missing or mismatched.",
    );
  }

  for (const table of [
    "lexia_clientes",
    "lexia_usuarios_clientes",
    "lexia_workflows",
    "lexia_ai_sessoes",
    "lexia_ai_mensagens",
    "lexia_ai_execucoes",
    "lexia_user_link_pendencias",
  ]) {
    const { error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) {
      throw new Error(
        `Refused before writes: required isolated schema is missing (${table}).`,
      );
    }
  }

  const { data: policyUsesHelper, error: policyContractError } =
    await admin.rpc("lexia_test_client_policy_uses_access_helper");

  if (policyContractError || policyUsesHelper !== true) {
    throw new Error(
      "Refused before writes: lexia_clientes is not delegated to the shared access helper.",
    );
  }
}

await verifyRemoteIdentityBeforeWrites();

let suiteCompleted = false;

try {
  // Sequential creation keeps cleanup deterministic if one Auth request fails.
  const adminUser = await createUser("admin");
  const userA = await createUser("a");
  const userB = await createUser("b");
  const inactiveUser = await createUser("inactive");

  const { error: clientsError } = await admin.from("lexia_clientes").insert([
    { modo_teste: true, nome: "Lot 1 A", slug: slugs.a, status: "ativo" },
    { modo_teste: true, nome: "Lot 1 B", slug: slugs.b, status: "ativo" },
    {
      modo_teste: true,
      nome: "Lot 1 Inactive",
      slug: slugs.inactive,
      status: "inativo",
    },
  ]);
  assert.equal(clientsError, null);

  const { error: profilesError } = await admin
    .from("lexia_usuarios_clientes")
    .insert([
      {
        cliente_slug: null,
        role: "lexia_admin",
        status: "ativo",
        user_id: adminUser.id,
      },
      {
        cliente_slug: slugs.a,
        role: "cliente_admin",
        status: "ativo",
        user_id: userA.id,
      },
      {
        cliente_slug: slugs.b,
        role: "cliente_admin",
        status: "ativo",
        user_id: userB.id,
      },
      {
        cliente_slug: slugs.inactive,
        role: "cliente_admin",
        status: "ativo",
        user_id: inactiveUser.id,
      },
    ]);
  assert.equal(profilesError, null);

  const { error: workflowError } = await admin.from("lexia_workflows").insert([
    {
      cliente_slug: slugs.a,
      nome: "Workflow A",
      status: "ativo",
      tipo: "whatsapp",
      webhook_url: "https://isolated.invalid/private/a",
    },
    {
      cliente_slug: slugs.b,
      nome: "Workflow B",
      status: "ativo",
      tipo: "instagram",
      webhook_url: "https://isolated.invalid/private/b",
    },
  ]);
  assert.equal(workflowError, null);

  const [clientA, clientB, inactiveClient, adminUserClient] = await Promise.all([
    signIn(userA),
    signIn(userB),
    signIn(inactiveUser),
    signIn(adminUser),
  ]);

  const { data: helperOwnAccess, error: helperOwnAccessError } =
    await clientA.rpc("lexia_user_can_access_cliente", {
      p_cliente_slug: slugs.a,
    });
  assert.equal(helperOwnAccessError, null);
  assert.equal(helperOwnAccess, true);

  const { data: helperCrossAccess, error: helperCrossAccessError } =
    await clientA.rpc("lexia_user_can_access_cliente", {
      p_cliente_slug: slugs.b,
    });
  assert.equal(helperCrossAccessError, null);
  assert.equal(helperCrossAccess, false);

  const { data: helperInactiveAccess, error: helperInactiveAccessError } =
    await inactiveClient.rpc("lexia_user_can_access_cliente", {
      p_cliente_slug: slugs.inactive,
    });
  assert.equal(helperInactiveAccessError, null);
  assert.equal(helperInactiveAccess, false);

  const { data: helperAdminAccess, error: helperAdminAccessError } =
    await adminUserClient.rpc("lexia_user_can_access_cliente", {
      p_cliente_slug: slugs.inactive,
    });
  assert.equal(helperAdminAccessError, null);
  assert.equal(helperAdminAccess, true);

  const { data: visibleClientsA, error: visibleClientsAError } = await clientA
    .from("lexia_clientes")
    .select("slug")
    .in("slug", [slugs.a, slugs.b]);
  assert.equal(visibleClientsAError, null);
  assert.deepEqual(visibleClientsA, [{ slug: slugs.a }]);

  const { data: crossTenantWorkflow, error: crossTenantWorkflowError } =
    await clientA
      .from("lexia_workflows")
      .select("id, cliente_slug, nome, tipo, status")
      .eq("cliente_slug", slugs.b);
  assert.equal(crossTenantWorkflowError, null);
  assert.deepEqual(crossTenantWorkflow, []);

  const { data: ownWorkflow, error: ownWorkflowError } = await clientA
    .from("lexia_workflows")
    .select("id, cliente_slug, nome, tipo, status")
    .eq("cliente_slug", slugs.a)
    .single();
  assert.equal(ownWorkflowError, null);
  assert.equal(ownWorkflow.cliente_slug, slugs.a);

  const { error: clientWorkflowWriteError } = await clientA
    .from("lexia_workflows")
    .update({ nome: "Forged by client" })
    .eq("id", ownWorkflow.id);
  assert.ok(clientWorkflowWriteError);

  const { error: adminJwtWorkflowWriteError } = await adminUserClient
    .from("lexia_workflows")
    .update({ nome: "Forged by admin JWT" })
    .eq("id", ownWorkflow.id);
  assert.ok(adminJwtWorkflowWriteError);

  const { error: privateDestinationError } = await clientA
    .from("lexia_workflows")
    .select("webhook_url")
    .eq("cliente_slug", slugs.a);
  assert.ok(privateDestinationError);

  const { error: adminPrivateDestinationError } = await adminUserClient
    .from("lexia_workflows")
    .select("webhook_url")
    .eq("cliente_slug", slugs.a);
  assert.ok(adminPrivateDestinationError);

  const { data: inactiveVisibleClient, error: inactiveVisibleError } =
    await inactiveClient
      .from("lexia_clientes")
      .select("slug")
      .eq("slug", slugs.inactive);
  assert.equal(inactiveVisibleError, null);
  assert.deepEqual(inactiveVisibleClient, []);

  const { data: inactiveHistoricalSession, error: inactiveHistoryError } =
    await admin
      .from("lexia_ai_sessoes")
      .insert({
        cliente_slug: slugs.inactive,
        criado_por: inactiveUser.id,
        status: "ativa",
        titulo: "Lot 1 inactive history",
      })
      .select("id")
      .single();
  assert.equal(inactiveHistoryError, null);

  const { data: hiddenInactiveSessions, error: hiddenInactiveSessionsError } =
    await inactiveClient
      .from("lexia_ai_sessoes")
      .select("id")
      .eq("id", inactiveHistoricalSession.id);
  assert.equal(hiddenInactiveSessionsError, null);
  assert.deepEqual(hiddenInactiveSessions, []);

  const { error: inactiveSessionInsertError } = await inactiveClient
    .from("lexia_ai_sessoes")
    .insert({
      cliente_slug: slugs.inactive,
      criado_por: inactiveUser.id,
      status: "ativa",
      titulo: "Forbidden inactive session",
    });
  assert.ok(inactiveSessionInsertError);

  const { data: session, error: sessionError } = await clientA
    .from("lexia_ai_sessoes")
    .insert({
      cliente_slug: slugs.a,
      criado_por: userA.id,
      status: "ativa",
      titulo: "Lot 1 callback",
    })
    .select("id")
    .single();
  assert.equal(sessionError, null);

  const { error: userMessageError } = await clientA
    .from("lexia_ai_mensagens")
    .insert({
      cliente_slug: slugs.a,
      conteudo: "Pergunta sintética",
      criado_por: userA.id,
      papel: "usuario",
      sessao_id: session.id,
    });
  assert.equal(userMessageError, null);

  const { data: mismatchedExecution, error: mismatchedExecutionError } =
    await admin
      .from("lexia_ai_execucoes")
      .insert({
        cliente_slug: slugs.b,
        criado_por: userA.id,
        periodo_fim: new Date().toISOString(),
        periodo_inicio: new Date(Date.now() - 3_600_000).toISOString(),
        sessao_id: session.id,
        status: "iniciada",
        tipo: "chat",
      })
      .select("id")
      .single();
  assert.equal(mismatchedExecutionError, null);

  const mismatchedFinalization = await admin.rpc(
    "lexia_finalizar_execucao_analista",
    {
      p_execucao_id: mismatchedExecution.id,
      p_resposta: "Must not be stored",
      p_resposta_id: randomUUID(),
      p_status: "concluida",
    },
  );
  assert.equal(mismatchedFinalization.error, null);
  assert.equal(mismatchedFinalization.data, "invalida");

  const { error: forgedAssistantError } = await clientA
    .from("lexia_ai_mensagens")
    .insert({
      cliente_slug: slugs.a,
      conteudo: "Resposta forjada",
      criado_por: userA.id,
      papel: "assistente",
      sessao_id: session.id,
    });
  assert.ok(forgedAssistantError);

  const now = Date.now();
  const { data: execution, error: executionError } = await admin
    .from("lexia_ai_execucoes")
    .insert({
      cliente_slug: slugs.a,
      criado_por: userA.id,
      periodo_fim: new Date(now).toISOString(),
      periodo_inicio: new Date(now - 3_600_000).toISOString(),
      sessao_id: session.id,
      status: "iniciada",
      tipo: "chat",
    })
    .select("id")
    .single();
  assert.equal(executionError, null);

  // Reproduce the stale callback window: the callback observed no tools, a
  // tool claim committed, and only then did finalization reach the row lock.
  const toolClaimBeforeFinalization = await admin.rpc(
    "lexia_reivindicar_ferramenta_analista",
    {
      p_execucao_id: execution.id,
      p_ferramenta: "obter_cobertura",
    },
  );
  assert.equal(toolClaimBeforeFinalization.error, null);
  assert.equal(toolClaimBeforeFinalization.data, true);

  const responseId = randomUUID();
  const finalizePayload = {
    p_duracao_ms: 250,
    p_erro: null,
    p_execucao_id: execution.id,
    p_ferramentas: ["listar_conversas"],
    p_fontes: [],
    p_modelo: "isolated-test",
    p_resposta: "Resposta final sintética",
    p_resposta_id: responseId,
    p_status: "concluida",
    p_tokens_entrada: 10,
    p_tokens_saida: 12,
    p_versao_prompt: "isolated-v1",
  };
  const firstFinalization = await admin.rpc(
    "lexia_finalizar_execucao_analista",
    finalizePayload,
  );
  assert.equal(firstFinalization.error, null);
  assert.equal(firstFinalization.data, "finalizada");

  const repeatedFinalization = await admin.rpc(
    "lexia_finalizar_execucao_analista",
    finalizePayload,
  );
  assert.equal(repeatedFinalization.error, null);
  assert.equal(repeatedFinalization.data, "repetida");

  const conflictingFinalization = await admin.rpc(
    "lexia_finalizar_execucao_analista",
    { ...finalizePayload, p_resposta: "Outra resposta" },
  );
  assert.equal(conflictingFinalization.error, null);
  assert.equal(conflictingFinalization.data, "conflito");

  const { count: answerCount, error: answerCountError } = await admin
    .from("lexia_ai_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("id", responseId);
  assert.equal(answerCountError, null);
  assert.equal(answerCount, 1);

  const { data: finalizedExecution, error: finalizedExecutionError } =
    await admin
      .from("lexia_ai_execucoes")
      .select("ferramentas")
      .eq("id", execution.id)
      .single();
  assert.equal(finalizedExecutionError, null);
  assert.deepEqual(finalizedExecution.ferramentas, [
    "obter_cobertura",
    "listar_conversas",
  ]);

  const { data: answerMessage, error: answerMessageError } = await admin
    .from("lexia_ai_mensagens")
    .select("metadata")
    .eq("id", responseId)
    .single();
  assert.equal(answerMessageError, null);
  assert.deepEqual(
    answerMessage.metadata.ferramentas,
    finalizedExecution.ferramentas,
  );

  const { data: racingExecution, error: racingExecutionError } = await admin
    .from("lexia_ai_execucoes")
    .insert({
      cliente_slug: slugs.a,
      criado_por: userA.id,
      periodo_fim: new Date(now).toISOString(),
      periodo_inicio: new Date(now - 3_600_000).toISOString(),
      sessao_id: session.id,
      status: "iniciada",
      tipo: "chat",
    })
    .select("id")
    .single();
  assert.equal(racingExecutionError, null);

  const racingResponseId = randomUUID();
  const [racingClaim, racingFinalization] = await Promise.all([
    admin.rpc("lexia_reivindicar_ferramenta_analista", {
      p_execucao_id: racingExecution.id,
      p_ferramenta: "analisar_qualidade",
    }),
    admin.rpc("lexia_finalizar_execucao_analista", {
      ...finalizePayload,
      p_execucao_id: racingExecution.id,
      p_resposta: "Resposta da corrida sintética",
      p_resposta_id: racingResponseId,
    }),
  ]);
  assert.equal(racingClaim.error, null);
  assert.equal(racingFinalization.error, null);
  assert.equal(racingFinalization.data, "finalizada");

  const { data: racingStoredExecution, error: racingStoredExecutionError } =
    await admin
      .from("lexia_ai_execucoes")
      .select("ferramentas")
      .eq("id", racingExecution.id)
      .single();
  assert.equal(racingStoredExecutionError, null);
  assert.ok(racingStoredExecution.ferramentas.includes("listar_conversas"));
  assert.equal(
    racingStoredExecution.ferramentas.includes("analisar_qualidade"),
    racingClaim.data,
  );

  const { data: racingStoredMessage, error: racingStoredMessageError } =
    await admin
      .from("lexia_ai_mensagens")
      .select("metadata")
      .eq("id", racingResponseId)
      .single();
  assert.equal(racingStoredMessageError, null);
  assert.deepEqual(
    racingStoredMessage.metadata.ferramentas,
    racingStoredExecution.ferramentas,
  );

  const { error: duplicateProfileError } = await admin
    .from("lexia_usuarios_clientes")
    .insert({
      cliente_slug: slugs.b,
      role: "cliente_operador",
      status: "ativo",
      user_id: userA.id,
    });
  assert.equal(duplicateProfileError?.code, "23505");

  const { error: pendingError } = await admin
    .from("lexia_user_link_pendencias")
    .insert({
      cliente_slug: slugs.b,
      erro_codigo: "23505",
      erro_resumo: "Synthetic conflict",
      estado: "pendente",
      role: "cliente_operador",
      status_perfil: "ativo",
      user_id: userA.id,
    });
  assert.equal(pendingError, null);

  const { data: lateSession, error: lateSessionError } = await admin
    .from("lexia_ai_sessoes")
    .insert({
      cliente_slug: slugs.a,
      criado_por: userA.id,
      status: "ativa",
      titulo: "Lot 1 late callback",
    })
    .select("id")
    .single();
  assert.equal(lateSessionError, null);
  const { data: lateExecution, error: lateExecutionError } = await admin
    .from("lexia_ai_execucoes")
    .insert({
      cliente_slug: slugs.a,
      criado_por: userA.id,
      periodo_fim: new Date(now).toISOString(),
      periodo_inicio: new Date(now - 3_600_000).toISOString(),
      sessao_id: lateSession.id,
      status: "iniciada",
      tipo: "chat",
    })
    .select("id")
    .single();
  assert.equal(lateExecutionError, null);

  const { error: deactivateError } = await admin
    .from("lexia_clientes")
    .update({ status: "inativo" })
    .eq("slug", slugs.a);
  assert.equal(deactivateError, null);

  const { data: helperAccessAfterDeactivation, error: helperAfterError } =
    await clientA.rpc("lexia_user_can_access_cliente", {
      p_cliente_slug: slugs.a,
    });
  assert.equal(helperAfterError, null);
  assert.equal(helperAccessAfterDeactivation, false);

  const { data: clientRowAfterDeactivation, error: clientRowAfterError } =
    await clientA.from("lexia_clientes").select("slug").eq("slug", slugs.a);
  assert.equal(clientRowAfterError, null);
  assert.deepEqual(clientRowAfterDeactivation, []);

  const { data: adminHistoryAfterDeactivation, error: adminHistoryError } =
    await adminUserClient
      .from("lexia_clientes")
      .select("slug")
      .eq("slug", slugs.a);
  assert.equal(adminHistoryError, null);
  assert.deepEqual(adminHistoryAfterDeactivation, [{ slug: slugs.a }]);

  const lateFinalization = await admin.rpc(
    "lexia_finalizar_execucao_analista",
    {
      ...finalizePayload,
      p_execucao_id: lateExecution.id,
      p_resposta: "Resultado tardio preservado",
      p_resposta_id: randomUUID(),
    },
  );
  assert.equal(lateFinalization.error, null);
  assert.equal(lateFinalization.data, "finalizada");

  const closedToolClaim = await admin.rpc(
    "lexia_reivindicar_ferramenta_analista",
    {
      p_execucao_id: lateExecution.id,
      p_ferramenta: "obter_cobertura",
    },
  );
  assert.equal(closedToolClaim.error, null);
  assert.equal(closedToolClaim.data, false);

  // Both clients were exercised so this is not a one-sided tenant test.
  const { data: visibleClientsB, error: visibleClientsBError } = await clientB
    .from("lexia_clientes")
    .select("slug")
    .in("slug", [slugs.a, slugs.b]);
  assert.equal(visibleClientsBError, null);
  assert.deepEqual(visibleClientsB, [{ slug: slugs.b }]);

  suiteCompleted = true;
} finally {
  try {
    await cleanup();
  } catch {
    cleanupFailures.push({
      code: "cleanup_exception",
      resource: "cleanup_runner",
    });
  }

  if (cleanupFailures.length > 0) {
    console.error("Lot 1 minimal database cleanup failed independently:");
    for (const failure of cleanupFailures) {
      console.error(`- ${failure.resource}: ${failure.code}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Lot 1 minimal database cleanup passed.");
  }
}

if (suiteCompleted) {
  console.log("Lot 1 minimal database contract suite passed.");
  console.log(
    "Full application registration and dispatch smoke tests were not run by this suite.",
  );
  console.log(
    "site_feedback was intentionally not mutated: its external consumer remains unidentified.",
  );
}

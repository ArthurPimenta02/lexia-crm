import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";

function readSourceTree(relativeRoot: string) {
  const root = new URL(`../${relativeRoot}/`, import.meta.url);
  const files: string[] = [];

  function visit(directory: URL) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);

      if (entry.isDirectory()) visit(child);
      else if ([".ts", ".tsx"].includes(extname(entry.name))) {
        files.push(readFileSync(child, "utf8"));
      }
    }
  }

  visit(root);
  return files.join("\n");
}

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202610030002_lote1_authorization_and_private_workflows.sql",
    import.meta.url,
  ),
  "utf8",
);
const workflowRestriction = readFileSync(
  new URL(
    "../supabase/migrations/202610030003_lote1_restrict_workflow_destinations.sql",
    import.meta.url,
  ),
  "utf8",
);
const isolatedBaseline = readFileSync(
  new URL(
    "../supabase/isolated/000000000000_lote1_test_baseline.sql",
    import.meta.url,
  ),
  "utf8",
);
const isolatedClientPolicy = readFileSync(
  new URL(
    "../supabase/isolated/after_202610030002_lote1_test_client_policy.sql",
    import.meta.url,
  ),
  "utf8",
);

test("migration closes workflow destinations and keeps only safe columns", () => {
  assert.match(
    workflowRestriction,
    /alter table public\.lexia_workflows enable row level security/i,
  );
  assert.match(
    workflowRestriction,
    /create policy "workflows_admin_all"[\s\S]*?lexia_is_admin\(\)/i,
  );
  assert.match(
    workflowRestriction,
    /create policy "workflows_select"[\s\S]*?lexia_user_can_access_cliente\(cliente_slug\)/i,
  );
  assert.match(
    workflowRestriction,
    /revoke all on public\.lexia_workflows from public, anon, authenticated/i,
  );
  const safeGrant = workflowRestriction.match(
    /grant select \(([\s\S]*?)\) on public\.lexia_workflows to authenticated/i,
  )?.[1];

  assert.ok(safeGrant);
  assert.doesNotMatch(safeGrant, /webhook_url/i);
  assert.doesNotMatch(
    workflowRestriction,
    /grant\s+(?:select|insert|update|delete|all)\s+on\s+public\.lexia_workflows\s+to\s+(?:public|anon|authenticated)/i,
  );
});

test("direct analyst inserts are limited to user messages", () => {
  assert.match(
    migration,
    /create policy "lexia_ai_mensagens_insert"[\s\S]*?papel = 'usuario'/i,
  );
  assert.match(
    migration,
    /create or replace function public\.lexia_finalizar_execucao_analista/i,
  );
  assert.match(migration, /for update;/i);
  assert.match(migration, /return 'repetida';/i);
  assert.match(migration, /return 'conflito';/i);
});

test("profile uniqueness migration rejects partial or mismatched indexes", () => {
  assert.match(migration, /indisready/i);
  assert.match(migration, /indisvalid/i);
  assert.match(migration, /indisunique/i);
  assert.match(migration, /indpred is not null/i);
  assert.match(migration, /index_columns is distinct from user_id_attnum::text/i);
  assert.match(
    migration,
    /constraint_columns <> array\[user_id_attnum\]::smallint\[\]/i,
  );
});

test("inactive client access is checked by the shared database helper", () => {
  assert.match(
    migration,
    /join public\.lexia_clientes c on c\.slug = u\.cliente_slug/i,
  );
  assert.match(migration, /and c\.status = 'ativo'/i);

  for (const policy of [
    "lexia_ai_sessoes_select",
    "lexia_ai_sessoes_insert",
    "lexia_ai_sessoes_update",
    "lexia_ai_sessoes_delete",
    "lexia_ai_mensagens_select",
    "lexia_ai_mensagens_insert",
    "lexia_ai_insights_select",
    "lexia_ai_execucoes_select",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create policy "${policy}"[^;]*lexia_user_can_access_cliente[^;]*;`,
        "i",
      ),
    );
  }

  assert.match(
    migration,
    /create policy "Cliente pode ler ajustes do próprio cliente"[^;]*join public\.lexia_clientes[^;]*c\.status = 'ativo'[^;]*;/i,
  );

  assert.match(migration, /set search_path = ''/i);
});

test("isolated client reads exercise the shared access helper", () => {
  assert.doesNotMatch(
    isolatedBaseline,
    /create policy "clientes_select_authorized"/i,
  );
  assert.match(
    isolatedClientPolicy,
    /create policy "clientes_select_authorized"[\s\S]*?using \(public\.lexia_user_can_access_cliente\(slug\)\)/i,
  );
  assert.match(
    isolatedClientPolicy,
    /to_regprocedure\('public\.lexia_user_can_access_cliente\(text\)'\)/i,
  );
  assert.match(
    isolatedClientPolicy,
    /create or replace function public\.lexia_test_client_policy_uses_access_helper\(\)/i,
  );
  assert.match(
    isolatedClientPolicy,
    /revoke all on function[\s\S]*?lexia_test_client_policy_uses_access_helper\(\)[\s\S]*?from public, anon, authenticated/i,
  );
});

test("repository code does not automatically delete Auth users", () => {
  const productionSource = `${readSourceTree("app")}\n${readSourceTree("lib")}`;

  assert.doesNotMatch(productionSource, /auth\.admin\.deleteUser/);
  assert.match(productionSource, /recordPendingUserLink/);
});

test("workflow writes are admin-only and direct destinations stay server-side", () => {
  const accessContext = readFileSync(
    new URL("../lib/auth/access-context.ts", import.meta.url),
    "utf8",
  );
  const workflowDal = readFileSync(
    new URL("../lib/workflows/private-config.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    workflowDal,
    /createWorkflowAsAdmin[\s\S]*?requireLexiaAdmin\(\)/,
  );
  assert.match(
    workflowDal,
    /updateWorkflowAsAdmin[\s\S]*?requireLexiaAdmin\(\)/,
  );
  assert.match(
    workflowDal,
    /dispatchTestWorkflow[\s\S]*?requireActiveAdministrativeClientAccess/,
  );
  assert.doesNotMatch(workflowDal, /requireOperationalClientAccess/);
  assert.match(
    accessContext,
    /profile\.role !== "lexia_admin"[\s\S]*?profile\.cliente_slug !== null/,
  );
});

test("finalization merges locked tool claims into execution and message", () => {
  assert.match(
    migration,
    /execution_row\.ferramentas[\s\S]*?p_ferramentas[\s\S]*?into merged_tools/i,
  );
  assert.match(
    migration,
    /'ferramentas', merged_tools/i,
  );
  assert.match(
    migration,
    /ferramentas = merged_tools/i,
  );
  assert.doesNotMatch(
    migration,
    /ferramentas = coalesce\(p_ferramentas, '\[\]'::jsonb\)/i,
  );
});

test("Lot 1 leaves unresolved external consumers untouched", () => {
  assert.doesNotMatch(migration, /lexia_buscar_ajustes_agente/i);
  assert.doesNotMatch(migration, /site_feedback/i);
  assert.doesNotMatch(workflowRestriction, /site_feedback/i);
});

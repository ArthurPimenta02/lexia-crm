import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { resolvePsqlBinary, securePsqlEnvironment, validateSupabaseRootCertificate, safePsqlFailure } from './lib/psql-client.mjs';
import { getPostgresTarget, getSupabaseProjectRef } from './lib/target-identity.mjs';

const expected = 'gaofupndxgitonfmvpzi';
const env = parseEnv(readFileSync('.env.lote2.test.local', 'utf8'));
const database = getPostgresTarget(env.LEXIA_LOTE2_DB_URL);
if (env.LEXIA_LOTE2_ENVIRONMENT !== 'isolated_test' || env.LEXIA_LOTE2_SUPABASE_PROJECT_REF !== expected ||
    database.projectRef !== expected || database.hostname !== env.LEXIA_LOTE2_DB_EXPECTED_HOST ||
    getSupabaseProjectRef(env.LEXIA_LOTE2_SUPABASE_URL) !== expected || env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF === expected) {
  throw Error('refused_noncentral_audit_target');
}
const cert = validateSupabaseRootCertificate(env.LEXIA_LOTE2_DB_SSL_ROOT_CERT);
function query(sql) {
  const result = spawnSync(resolvePsqlBinary(process.env.LEXIA_PSQL_BIN), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'], {
    env: { ...securePsqlEnvironment(env.LEXIA_LOTE2_DB_URL, cert), PGOPTIONS: '-c default_transaction_read_only=on' },
    input: "BEGIN READ ONLY; SET LOCAL statement_timeout='15s';\n" + sql + '\nROLLBACK;',
    encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const state = result.stderr?.match(/ERROR:\s*([A-Z0-9]{5})/)?.[1];
    throw Error(state ? 'readonly_inventory_query_failed:' + state : safePsqlFailure(result.stderr));
  }
  return JSON.parse(result.stdout.trim());
}
const schema = query(`SELECT json_build_object(
  'read_only',current_setting('transaction_read_only'),
  'tables',(SELECT coalesce(json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity) ORDER BY c.relname),'[]')
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'lexia_%'),
  'columns',(SELECT coalesce(json_agg(json_build_object('table',table_name,'name',column_name,'type',data_type,'nullable',is_nullable)
    ORDER BY table_name,ordinal_position),'[]') FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'lexia_%'),
  'functions',(SELECT coalesce(json_agg(json_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'definition_md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.proname),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'lexia_%'),
  'policies',(SELECT coalesce(json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd)),'[]')
    FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'lexia_%')
);`);
const tables = new Set(schema.tables.map(t => t.name));
const configuration = {};
if (tables.has('lexia_environment_identity')) configuration.identity = query("SELECT coalesce(json_agg(json_build_object('project_ref',project_ref,'environment',environment)),'[]') FROM public.lexia_environment_identity;");
if (tables.has('lexia_channel_accounts')) configuration.virtual_accounts = query("SELECT coalesce(json_agg(json_build_object('id',id,'environment',environment,'cliente_slug',cliente_slug,'channel',channel,'provider',provider,'status',status,'delivery_mode',delivery_mode,'delivery_owner',delivery_owner)),'[]') FROM public.lexia_channel_accounts WHERE environment='isolated_test' AND provider='fake' AND cliente_slug IN ('miranda_skin_experts','empresa_sintetica_a','empresa_sintetica_b');");
if (tables.has('lexia_context_agent_configs')) configuration.context_configs = query("SELECT coalesce(json_agg(json_build_object('environment',environment,'cliente_slug',cliente_slug,'config_version',config_version,'status',status,'prompt_characters',length(prompt_template),'schema_defined',company_fields_schema IS NOT NULL)),'[]') FROM public.lexia_context_agent_configs WHERE environment='isolated_test' AND cliente_slug IN ('miranda_skin_experts','empresa_sintetica_a','empresa_sintetica_b');");
if (tables.has('lexia_omnichannel_policies')) configuration.policies = query("SELECT coalesce(json_agg(json_build_object('environment',environment,'cliente_slug',cliente_slug,'policy_version',policy_version,'status',status,'resume_mode',resume_mode,'human_intervention_ms',human_intervention_ms,'pause_after_appointment',pause_after_appointment)),'[]') FROM public.lexia_omnichannel_policies WHERE environment='isolated_test' AND cliente_slug IN ('miranda_skin_experts','empresa_sintetica_a','empresa_sintetica_b');");
const report = { project_ref: expected, scope: 'central read-only schema and synthetic configuration metadata; no message/contact data', schema, configuration };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ project_ref: expected, read_only: schema.read_only, tables: schema.tables.map(t => t.name),
  migration_functions: schema.functions.filter(f => /migration|calendar|brain/.test(f.name)).map(f => f.name), configuration }, null, 2) + '\n');

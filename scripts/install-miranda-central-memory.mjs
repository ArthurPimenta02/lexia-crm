import { readFileSync, mkdirSync, chmodSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { resolvePsqlBinary, securePsqlEnvironment, validateSupabaseRootCertificate } from './lib/psql-client.mjs';
import { getPostgresTarget, getSupabaseProjectRef } from './lib/target-identity.mjs';

const ref='gaofupndxgitonfmvpzi';
const env=parseEnv(readFileSync('.env.lote2.test.local','utf8'));
const target=getPostgresTarget(env.LEXIA_LOTE2_DB_URL);
if(target.projectRef!==ref||target.hostname!==env.LEXIA_LOTE2_DB_EXPECTED_HOST||env.LEXIA_LOTE2_ENVIRONMENT!=='isolated_test'||env.LEXIA_LOTE2_SUPABASE_PROJECT_REF!==ref||getSupabaseProjectRef(env.LEXIA_LOTE2_SUPABASE_URL)!==ref||env.LEXIA_PRODUCTION_SUPABASE_PROJECT_REF===ref)throw Error('central_install_target_refused');
const pgEnv=securePsqlEnvironment(env.LEXIA_LOTE2_DB_URL,validateSupabaseRootCertificate(env.LEXIA_LOTE2_DB_SSL_ROOT_CERT));
const dir=resolve(process.env.HOME,'.codex/private-backups/miranda-central-20261012');
const backup=resolve(dir,'central-before-memory.dump');
function run(bin,args,input,timeout=120000) {
  const r=spawnSync(bin,args,{env:pgEnv,input,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
  if(r.status!==0){const state=r.stderr?.match(/ERROR:\s*(?:[A-Z]+:\s*)?([A-Z0-9]{5})/)?.[1];writeFileSync('/tmp/lexia-central-install-error.log',r.stderr||'process_failed',{mode:0o600});throw Error('central_operation_failed:'+(state||'see_restricted_log'));}
  return r.stdout;
}
const mode=process.argv[2];
const guard=`SET LOCAL lexia.target_project_ref='${ref}';
DO $$ BEGIN IF (SELECT count(*) FROM public.lexia_environment_identity)<>1 OR NOT EXISTS(SELECT 1 FROM public.lexia_environment_identity WHERE project_ref='${ref}' AND environment='isolated_test') THEN RAISE EXCEPTION 'central_identity_mismatch'; END IF; END $$;`;
const psql=resolvePsqlBinary();
if(mode==='backup') {
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN READ ONLY;${guard}ROLLBACK;`);
  mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
  if(existsSync(backup))throw Error('backup_already_exists_preserved');
  run('/opt/homebrew/opt/libpq/bin/pg_dump',['-Fc','--no-owner','--no-acl','-f',backup]);chmodSync(backup,0o600);
  const toc=run('/opt/homebrew/opt/libpq/bin/pg_restore',['--list',backup]);
  if(!toc.includes('lexia_conversation_states')||!toc.includes('lexia_environment_identity'))throw Error('backup_toc_incomplete');
  console.log(JSON.stringify({backup,archive_verified:true,restoration_tested:false}));
} else if(mode==='regressions') {
  const source=readFileSync('supabase/checks/202610120009_central_memory_regression.sql','utf8').replace(/^\s*(?:begin|rollback);\s*$/gmi,'');
  const result=run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],`BEGIN;SET LOCAL statement_timeout='15s';${guard}${source}ROLLBACK;`);
  console.log(result.trim());
} else if(mode==='message-origins-upgrade') {
  if(!existsSync(backup))throw Error('backup_required');
  const source=readFileSync('supabase/review/miranda-migration/202610120008_message_origins.sql','utf8').replace(/^\s*(?:begin|commit);\s*$/gmi,'');
  const preflight=`DO $$ DECLARE definition text; BEGIN SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint WHERE conrelid='public.lexia_mensagens'::regclass AND conname='lexia_mensagens_origem_check'; IF definition NOT LIKE '%workflow%' OR definition NOT LIKE '%humano%' OR definition NOT LIKE '%recebida_na_pausa%' THEN RAISE EXCEPTION 'message_origins_preflight_mismatch'; END IF; END $$;`;
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN;${guard}${preflight}${source}ROLLBACK;`);
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN;${guard}${preflight}${source}COMMIT;`);
  console.log(JSON.stringify({mode,project_ref:ref}));
} else if(mode==='virtual-receipt-upgrade') {
  if(!existsSync(backup))throw Error('backup_required');
  const source=readFileSync('supabase/review/miranda-migration/202610120007_virtual_message_receipt.sql','utf8').replace(/^\s*(?:begin|commit);\s*$/gmi,'');
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN;${guard}${source}ROLLBACK;`);
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN;${guard}${source}COMMIT;`);
  console.log(JSON.stringify({mode,project_ref:ref}));
} else if(mode==='memory-scope-upgrade') {
  if(!existsSync(backup))throw Error('backup_required');
  const source=readFileSync('supabase/review/miranda-migration/202610120005_central_agent_memory.sql','utf8');
  const definition=source.match(/create function public\.lexia_agent_memory_scope\([\s\S]*?\n\$\$;/)?.[0];
  if(!definition)throw Error('memory_scope_definition_missing');
  run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1'],`BEGIN;${guard}${definition.replace('create function','create or replace function')}COMMIT;`);
  console.log(JSON.stringify({mode,project_ref:ref}));
} else if(['dry-run','apply'].includes(mode)) {
  if(!existsSync(backup))throw Error('backup_required');
  const files=['202610120001_calendar_tools_persistent.sql','202610120002_migration_control.sql','202610120003_runtime_consumers.sql','202610120004_team_notifications.sql','202610120005_central_agent_memory.sql','202610120006_miranda_crm_seed.sql','202610120007_virtual_message_receipt.sql','202610120008_message_origins.sql'];
  const body=files.map(f=>readFileSync('supabase/review/miranda-migration/'+f,'utf8').replace(/^\s*(?:begin|commit);\s*$/gmi,'')).join('\n');
  const result=run(psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],`BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';${guard}\n${body}\nSELECT 'central_schema_validated';${mode==='apply'?'COMMIT':'ROLLBACK'};`);
  console.log(JSON.stringify({mode,files:files.length,result:result.trim(),project_ref:ref}));
} else throw Error('use_backup_dry-run_or_apply');

import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {getPostgresTarget} from './lib/target-identity.mjs';
import {resolvePsqlBinary,securePsqlEnvironment,validateSupabaseRootCertificate} from './lib/psql-client.mjs';
const env=parseEnv(readFileSync('.env.lote2.test.local','utf8'));
if(getPostgresTarget(env.LEXIA_LOTE2_DB_URL).projectRef!=='gaofupndxgitonfmvpzi')throw Error('central_only');
const failures=[],checked=[];
for(const file of ['01-omnichannel','02-cerebro']) {
 const w=JSON.parse(readFileSync('n8n/miranda-migration-review/'+file+'.inactive.json'));
 for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres'&&!n.parameters.query.startsWith('='))) {
  const r=spawnSync(resolvePsqlBinary(),['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:securePsqlEnvironment(env.LEXIA_LOTE2_DB_URL,validateSupabaseRootCertificate(env.LEXIA_LOTE2_DB_SSL_ROOT_CERT)),input:'BEGIN READ ONLY;SET LOCAL statement_timeout=5000;PREPARE lexia_check AS '+n.parameters.query+';DEALLOCATE lexia_check;ROLLBACK;',encoding:'utf8',timeout:15000});
  if(r.status){failures.push({node:n.name,error:r.stderr.trim()});}else checked.push(n.name);
 }
}
writeFileSync('/tmp/lexia-native-sql-check.json',JSON.stringify({checked,failures},null,2),{mode:0o600});
console.log(JSON.stringify({checked:checked.length,failures},null,2));
if(failures.length)process.exitCode=1;

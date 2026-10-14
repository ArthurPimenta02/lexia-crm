import { resolve } from 'node:path';
import { bundleForN8n, replaceN8nBundles } from './n8n-code-bundle.mjs';

// Overlay only storage: preserve original agents, connections and positions.
export function centralMemoryBrain(workflow,root) {
  const w=structuredClone(workflow);
  const get=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw Error('missing_memory_node:'+name);return n;};
  const config=get('Config Cerebro Lexia').parameters.assignments.assignments;
  for(const [name,value]of Object.entries({memory_backend:'central',central_project_ref:'',catalog_read_only:true})) {
    const old=config.find(a=>a.name===name);if(old)old.value=value;
    else config.push({id:'central-'+name,name,type:typeof value==='boolean'?'boolean':'string',value});
  }
  const core=bundleForN8n(resolve(root,'scripts/lib/miranda-original-brain-runtime.mjs'),'Brain');
  for(const n of w.nodes)if(n.parameters.jsCode)n.parameters.jsCode=replaceN8nBundles(n.parameters.jsCode,{Brain:core});
  const ctx="$('LEXIA | Validar origem e limites').first().json";
  const saved="$('LEXIA | Gravar memoria privada').first().json";
  const pg=(name,query,args)=>{
    const n=get(name);n.type='n8n-nodes-base.postgres';n.typeVersion=2.6;
    n.parameters={operation:'executeQuery',query,options:{queryReplacement:'={{ '+args+' }}',largeNumbersOutput:'numbers'}};
    n.credentials={postgres:{name:'Lexia Central Postgres'}};n.alwaysOutputData=true;n.retryOnFail=false;
    n.notes='Memoria OPERACIONAL no central; nome/posicao legados preservados. Catalogo privado somente GET. Escopo completo, invocacao e CAS conferidos no servidor.';
  };
  pg('LEXIA | Identidade do Supabase privado',`SELECT i.project_ref,i.environment,EXISTS(SELECT 1 FROM public.lexia_channel_accounts a WHERE a.id=($1::jsonb->>'account_ref')::uuid AND a.environment=$1::jsonb->>'environment' AND a.cliente_slug=$1::jsonb->>'cliente_slug' AND a.status='active' AND a.provider='fake') AS authorized FROM public.lexia_environment_identity i WHERE i.id;`, `[JSON.stringify(${ctx}.scope)]`);
  pg('LEXIA | Ler memoria privada','SELECT * FROM public.lexia_agent_memory_read($1::jsonb,$2::uuid);',`[JSON.stringify(${ctx}.scope),${ctx}.payload.invocation_id]`);
  for(const name of ['LEXIA | Criar memoria privada','LEXIA | Atualizar memoria por versao'])pg(name,'SELECT * FROM public.lexia_agent_memory_write($1::jsonb,$2::integer);',`[JSON.stringify(${saved}.expected),${saved}.ctx.memory?.version||0]`);
  for(const n of w.nodes)if(n.type.startsWith('n8n-nodes-base.supabase')) {
    if(n.parameters.operation!=='getAll')throw Error('catalog_write_forbidden');
    n.credentials={supabaseApi:{name:'Lexia Catalogo Miranda Somente Leitura'}};
  }
  return w;
}

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { organizeMirandaCanvas } from './lib/miranda-original-layout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uuid = (value) => {
  const h = createHash('sha256').update(value).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const expr = (value) => `={{ ${value} }}`;
const get = (name) => `$(${JSON.stringify(name)}).first().json`;
const REG = get('LEXIA | Registro individual confirmado');
const CFG = get('Config Cliente Lexia');
const OP = get('Normalizar Dados Operacionais');
const CLAIM = get('LEXIA | Lote autorizado');
const PACK = get('Preparar Pacote de Contexto');
export function contextAgentPrompt() {
  // Spaces between nested closing braces avoid n8n's expression delimiters.
  return expr(`${PACK}.prompt_template + '\\nRetorne APENAS JSON, sem markdown. schema_version deve ser literalmente lexia.context.result.v1. Copie as identidades e IDs EXATOS do pacote. Formato completo obrigatorio: ' + JSON.stringify({schema_version:'lexia.context.result.v1',scope:${PACK}.scope,context_call_id:${PACK}.context_call_id,config_version:${PACK}.config_version,source_message_ids:${PACK}.source_message_ids,operational_context:{summary:'resumo factual e continuidade',language:'pt-BR ou en ou es conforme o lead',intent:'servicos ou agendamento ou promocoes ou indefinido',topic:{current:'assunto atual',changed:false,resumed_previous:false},confidence:0.9,missing_information:[],contact_updates:{},scheduling_intent:{} },company_fields:{} }) + '\\nOs valores descritivos do exemplo devem ser preenchidos com fatos, nao copiados literalmente. Use company_fields apenas conforme company_fields_schema. Nao omita schema_version nem campos comuns. Pedido explicito de idioma prevalece. Nao invente efeito confirmado.'`);
}
const LOOP = `$('Loop Over Items - Entregas').item.json`;
const item = `${LOOP}.entregas`;

export const runtime = {
  record: `
const op = $('Normalizar Dados Operacionais').first().json;
const cfg = $('Config Cliente Lexia').first().json;
const body = op.lexia_body_normalizado || {};
const message = body.message || {};
const transport = body._lexia_transport;
if (!['zapi','meta','test'].includes(transport)) throw new Error('ingress_transport_missing');
if (transport !== 'test' && op.modo_teste_workflow) throw new Error('test_flag_on_provider_ingress');
const account = transport === 'test' ? cfg.test_account_ref : cfg[op.canal + '_account_ref'];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(account || '')) throw new Error('configure_trusted_account_in_Config_Cliente_Lexia');
const sender = String(op.sender_id || '').trim();
const providerId = String(op.mensagem_id_externo || '').trim();
if (!sender || !providerId || providerId.length > 256) throw new Error('provider_identity_missing');
if (transport === 'test' && (!op.lexia_session_id || !op.lexia_run_id)) throw new Error('test_session_and_run_required');
let occurred = body._provider_timestamp ?? body._zapi?.momment ?? op.recebido_em;
if (typeof occurred === 'number') occurred = new Date(occurred > 1e12 ? occurred : occurred * 1000).toISOString();
if (typeof occurred !== 'string') throw new Error('provider_timestamp_invalid');
LexiaSchema.assertJsonSchemaValue({type:'string',format:'date-time'},occurred,'provider_timestamp');
const media = {texto:'text',audio:'audio',imagem:'image',documento:'pdf',video:'video'}[op.tipo_mensagem] || null;
const mediaUrl = media !== 'text' ? String(message.content?.URL || '') : '';
if (mediaUrl && (!mediaUrl.startsWith('https://') || mediaUrl.length > 4096)) throw new Error('media_url_invalid');
const conversation = transport === 'test' ? 'test:' + op.lexia_session_id : sender;
return [{json:{account_ref:account,environment:cfg.environment,cliente_slug:cfg.cliente_slug,channel:op.canal,
  provider:transport === 'test' ? 'fake' : transport, provider_account_ref:String(body._provider_account_ref || body._zapi?.instance_id || ''),
  conversation_ref:conversation,identificador_conversa:op.identificador_conversa,provider_message_id:providerId,
  occurred_at:new Date(occurred).toISOString(),from_me:op.from_me === true,text:String(op.conteudo_mensagem || '').slice(0,20000),
  tipo:op.tipo_mensagem,media_kind:media,media_url:mediaUrl,media_status:media && media !== 'text' ? 'pending' : 'completed',
  nome:String(op.nome_contacto || sender).slice(0,256),telefone:op.canal === 'whatsapp' ? String(op.telefone || '') : '',
  mode_test:transport === 'test',attribution:body._anuncio || null},pairedItem:{item:0}}];`,
  unwrap: `
const result = $input.first().json;
if (!result.data) throw new Error('trusted_account_or_policy_unavailable');
return [{json:typeof result.data === 'string' ? JSON.parse(result.data) : result.data,pairedItem:{item:0}}];`,
  media: `
const r = $('LEXIA | Registro individual confirmado').first().json;
const value = $input.first().json || {};
const text = value.text || value.output || value['0']?.content?.[0]?.text || value.candidates?.[0]?.content?.parts?.[0]?.text || '';
const failed = Boolean(value.error) || (r.media_kind !== 'text' && !String(text).trim());
const label = {audio:'Audio',image:'Imagem',pdf:'PDF',video:'Video'}[r.media_kind] || '';
const original = r.media_kind !== 'text' ? '\\nMidia original: '+r.media_url+(r.text&&r.text!==r.media_url?'\\nLegenda original: '+r.text:'') : '';
const content = r.media_kind === 'text' ? r.text : (failed ? '[' + label + ' indisponivel para analise]' : '[' + label + '] ' + String(text));
return [{json:{...r,
  media_status:failed?'failed':'completed',media_error_code:failed?'media_processing_failed':null,normalized_text:(content+original).slice(0,20000)},pairedItem:{item:0}}];`,
  batch: `
const data = $input.first().json;
const r = $('LEXIA | Registro individual confirmado').first().json;
const state = data.state || {};
if (data.out_claimed) return [{json:{...data,...r,state,invocation_id:data.out_batch_id},pairedItem:{item:0}}];
return [{json:{...data,...r,wait_again:['window_open','media_pending','batch_in_progress'].includes(data.out_reason),stop:!['window_open','media_pending','batch_in_progress'].includes(data.out_reason)},pairedItem:{item:0}}];`,
  package: `
const r = $('LEXIA | Registro individual confirmado').first().json;
const batch = $('LEXIA | Lote autorizado').first().json;
const rows = $('Agrupar Histórico').first().json.data || [];
const cfg = $('LEXIA | Configuracao de contexto').first().json;
const snapshot = $('LEXIA | Estado e contexto duraveis').first().json;
if (!cfg.prompt_template || cfg.environment !== r.environment || cfg.cliente_slug !== r.cliente_slug || cfg.status !== 'active') throw new Error('context_config_unavailable');
for (const m of rows) if (m.omni_conversation_id !== r.conversation_id || m.cliente_slug !== r.cliente_slug) throw new Error('history_scope_mismatch');
const messages = rows.filter(m => batch.out_mensagem_ids.includes(m.id));
if (messages.length !== batch.out_mensagem_ids.length) throw new Error('batch_source_messages_missing');
const previous = snapshot.context?.operational_context || {};
const legacy = {tipo_assunto:previous.intent || 'indefinido',confianca:previous.confidence ?? 0,resumo_contexto:previous.summary || '',dados:snapshot.context?.company_fields || {}};
return [{json:{scope:{environment:r.environment,cliente_slug:r.cliente_slug,channel:r.channel,account_ref:r.account_ref,conversation_ref:r.conversation_ref},
  context_call_id:batch.invocation_id,config_version:cfg.config_version,company_fields_schema:cfg.company_fields_schema,
  source_message_ids:messages.map(m=>m.id),state:snapshot.state,context_version:Number(snapshot.context?.context_version || 0),
  mensagem_actual:messages.map(m=>m.conteudo || '['+m.tipo+']').join('\\n\\n'),contacto_id:$('Unificar Contacto').first().json.id,nome_contacto:r.nome,telefone:r.telefone,
  identificador_conversa:r.identificador_conversa,historico_mensagens:rows,contexto_activo:JSON.stringify(legacy),prompt_template:cfg.prompt_template},pairedItem:{item:0}}];`,
  context: `
const p = $('Preparar Pacote de Contexto').first().json;
const raw = $input.first().json.output;
if (typeof raw !== 'string' && (!raw || typeof raw !== 'object')) throw new Error('context_output_missing');
const result = typeof raw === 'string' ? JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\\s*/i,'').replace(/\\s*\x60\x60\x60$/,'').trim()) : raw;
if (JSON.stringify(result.scope) !== JSON.stringify(p.scope) && ['environment','cliente_slug','channel','account_ref','conversation_ref'].some(k=>result.scope?.[k]!==p.scope[k])) throw new Error('context_scope_mismatch');
if (result.context_call_id !== p.context_call_id || result.config_version !== p.config_version || JSON.stringify(result.source_message_ids) !== JSON.stringify(p.source_message_ids)) throw new Error('context_origin_mismatch');
LexiaSchema.assertContractSchema('context-result',result);
LexiaSchema.assertJsonSchemaValue(p.company_fields_schema,result.company_fields,'company_fields');
const op=result.operational_context;
const language=String(op.language || '').toLowerCase().split('-')[0];
if (!['pt','en','es'].includes(language)) throw new Error('lead_language_unsupported');
return [{json:{...result,tipo_assunto:op.intent,confianca:op.confidence,resumo_contexto:op.summary,dados:{...result.company_fields,idioma:language,agendamento:op.scheduling_intent}},pairedItem:{item:0}}];`,
  payloadTail: `
const p = $('Preparar Pacote de Contexto').first().json;
const context = $('Preparar Contexto Activo').first().json;
const reg = $('LEXIA | Registro individual confirmado').first().json;
const snapshot = $('LEXIA | Estado e contexto duraveis').first().json;
for (const item of output) {
  item.json.historico = p.historico_mensagens.map(m=>({autor:m.omni_author==='human_agent'?'equipe_humana':m.omni_author==='ai'||m.origem==='teste_workflow'?'agente_ia':m.omni_author==='lead'?'cliente':'sistema',direccao:m.direccao,tipo:m.tipo,conteudo:m.conteudo || '',criado_em:m.provider_timestamp || m.criado_em})).sort((a,b)=>a.criado_em.localeCompare(b.criado_em));
  item.json.mensagem.actual = p.mensagem_actual;
  item.json.anuncio = reg.attribution || null;
  item.json.scope = p.scope;
  item.json.invocation_id = p.context_call_id;
  item.json.captured_state = {state_version:Number(p.state.state_version),delivery_epoch:Number(p.state.delivery_epoch)};
  item.json.contexto.dados = {...snapshot.context?.company_fields, ...context.dados,
    idioma:context.dados.idioma,apresentacao_ja_enviada:p.historico_mensagens.some(m=>(m.omni_author==='ai'||m.origem==='teste_workflow') && /(?:sou|soy|i am|i'm)\\s+(?:a\\s+)?carol/i.test(m.conteudo || ''))};
  item.json.operacao = {modo_teste:reg.mode_test,session_id:$('Normalizar Dados Operacionais').first().json.lexia_session_id,
    run_id:$('Normalizar Dados Operacionais').first().json.lexia_run_id,redis_namespace:reg.redis_namespace,
    permitir_envio_real:false,permitir_notificacao_handoff:false,tools_permitidas:!reg.mode_test || $('CENTRAL DE CONTROLE').first().json.permitir_tools_teste===true};
  item.json.instrucoes_continuidade = 'Responda no idioma '+context.dados.idioma+'. Use todo o historico entregue. Se ja se apresentou como Carol, nao se apresente novamente, inclusive apos trocar de idioma. Preserve o pedido anterior. Escreva mensagens curtas e naturais, uma pergunta por vez. Nunca afirme agendamento confirmado por texto: use o resultado real da tool.';
  item.pairedItem={item:0};
}
return output;`,
  delivery: `
const d = $('Loop Over Items - Entregas').item.json.entregas;
const claim = $('LEXIA | Claim antes de cada envio').item.json;
const response = $input.first().json;
const body = response.body || response;
const id = body.messageId || body.zapiMessageId || body.message_id || body.messages?.[0]?.id || '';
const confirmed = !response.error && Number(response.statusCode || 0)>=200 && Number(response.statusCode || 0)<300 && typeof id==='string' && id.length>0;
return [{json:{delivery:d,claim,status:confirmed?'sent':'delivery_unknown',provider_message_id:confirmed?id:null,
  reason:confirmed?null:'provider_result_requires_reconciliation'},pairedItem:{item:0}}];`,
  brainContext: `
const p=$('Preparar Pacote de Contexto').first().json;
const base=$('Preparar Contexto Activo').first().json;
const merged=$input.first().json;
const patch=merged.contexto_para_guardar?.dados || {};
const fields={...base.company_fields};
// Only tenant-approved operational facts may survive the brain boundary.
for(const key of Object.keys(p.company_fields_schema.properties || {}))if(Object.hasOwn(patch,key)&&!['agendamento','ultimo_agendamento','tool_state','memoria_privada'].includes(key))fields[key]=patch[key];
LexiaSchema.assertJsonSchemaValue(p.company_fields_schema,fields,'company_fields');
return [{json:{...merged,operational_context:base.operational_context,company_fields:fields,scope:p.scope,context_call_id:p.context_call_id,source_message_ids:p.source_message_ids,config_version:p.config_version},pairedItem:{item:0}}];`,
};

export const sql = {
  ingest: `WITH p AS (SELECT $1::jsonb AS v), a AS MATERIALIZED (
 SELECT ca.*, po.resume_mode,po.buffer_window_ms FROM public.lexia_channel_accounts ca
 JOIN p ON ca.id=(p.v->>'account_ref')::uuid AND ca.environment=p.v->>'environment'
 AND ca.cliente_slug=p.v->>'cliente_slug' AND ca.channel=p.v->>'channel' AND ca.provider=p.v->>'provider'
 AND (ca.provider='fake' OR ca.provider_account_ref=p.v->>'provider_account_ref')
 JOIN public.lexia_omnichannel_policies po ON po.environment=ca.environment AND po.cliente_slug=ca.cliente_slug AND po.status='active'
 WHERE ca.status='active'
), c AS MATERIALIZED (
 SELECT a.*,public.lexia_omni_resolve_conversation(a.id,p.v->>'conversation_ref',p.v->>'identificador_conversa') AS conversation_id FROM a,p
), e AS MATERIALIZED (
 SELECT c.*,r.out_ingress_id,r.out_duplicate AS ingress_duplicate FROM c,p CROSS JOIN LATERAL public.lexia_omni_register_ingress(c.id,p.v->>'provider_message_id','message',(p.v->>'occurred_at')::timestamptz,c.conversation_id) r
), known AS MATERIALIZED (
 SELECT e.*,o.id AS echo_action_id FROM e CROSS JOIN p LEFT JOIN public.lexia_outbound_actions o
 ON o.conversation_id=e.conversation_id AND o.provider_message_id=p.v->>'provider_message_id' AND o.status IN ('sent','delivery_unknown','claimed')
), m AS MATERIALIZED (
 SELECT known.*,r.* FROM known,p CROSS JOIN LATERAL public.lexia_omni_record_message(known.conversation_id,
 CASE WHEN known.echo_action_id IS NOT NULL THEN 'ai' WHEN (p.v->>'from_me')::boolean THEN 'human_agent' ELSE 'lead' END,
 p.v->>'provider_message_id',(p.v->>'occurred_at')::timestamptz,p.v->>'tipo',p.v->>'text',p.v->>'media_kind',p.v->>'media_status',known.echo_action_id) r
)
SELECT p.v || jsonb_build_object('conversation_id',m.conversation_id,'message_id',m.out_mensagem_id,
 'attribution_event_uuid',overlay(overlay(md5('attribution:'||m.out_ingress_id::text) placing '4' from 13) placing '8' from 17)::uuid,
 'duplicate',m.out_duplicate,'author',CASE WHEN m.echo_action_id IS NOT NULL THEN 'ai' WHEN (p.v->>'from_me')::boolean THEN 'human_agent' ELSE 'lead' END,
 'resume_mode',m.resume_mode,'buffer_window_ms',m.buffer_window_ms,'delivery_mode',m.delivery_mode,
 'redis_namespace','lexia:miranda:crm:'||m.environment||':'||m.cliente_slug||':'||m.channel||':'||m.id::text||':{'||m.conversation_id::text||'}') AS data FROM p,m;`,
  contact: `WITH p AS (SELECT $1::jsonb v), c AS (
 INSERT INTO public.lexia_contactos(cliente_slug,nome,telefone,identificador_conversa,omni_account_id,provider_contact_ref,criado_em,atualizado_em)
 SELECT p.v->>'cliente_slug',p.v->>'nome',nullif(p.v->>'telefone',''),
 (p.v->>'channel')||':'||(p.v->>'account_ref')||':'||(p.v->>'conversation_ref'),(p.v->>'account_ref')::uuid,p.v->>'conversation_ref',now(),now() FROM p
 ON CONFLICT(cliente_slug,identificador_conversa) DO UPDATE SET nome=coalesce(nullif(EXCLUDED.nome,''),lexia_contactos.nome),telefone=coalesce(EXCLUDED.telefone,lexia_contactos.telefone),atualizado_em=now()
 RETURNING *
), linked AS (UPDATE public.lexia_conversation_states s SET contacto_id=c.id FROM c,p WHERE s.id=(p.v->>'conversation_id')::uuid RETURNING s.id)
SELECT c.* FROM c,linked;`,
  lead: `SELECT * FROM public.lexia_omni_record_lead_message($1::uuid,$2::text,$3::uuid,$4::timestamptz);`,
  human: `SELECT * FROM public.lexia_omni_record_human_intervention($1::uuid,$2::text,$3::uuid,$4::timestamptz);`,
  check: `SELECT s.*,public.lexia_omni_has_active_block(s.id,clock_timestamp()) AS blocked FROM public.lexia_conversation_states s WHERE s.id=$1::uuid;`,
  media: `WITH changed AS (UPDATE public.lexia_mensagens SET conteudo=$2::text,media_processing_status=$3::text,media_error_code=$4::text WHERE id=$1::uuid AND omni_conversation_id=$5::uuid RETURNING id)
SELECT $6::jsonb AS data FROM changed;`,
  claim: `WITH latest AS (SELECT s.* FROM public.lexia_conversation_states s WHERE s.id=$1::uuid),
 readiness AS (SELECT EXISTS(SELECT 1 FROM public.lexia_inbound_buffer_entries e JOIN public.lexia_mensagens m ON m.id=e.mensagem_id
 WHERE e.conversation_id=$1::uuid AND e.disposition='buffered' AND e.batch_id IS NULL AND m.media_processing_status='pending') AS pending),
 claimed AS (SELECT b.* FROM latest,readiness CROSS JOIN LATERAL public.lexia_omni_claim_inbound_batch(latest.id,latest.lead_message_seq) b WHERE NOT readiness.pending)
SELECT claimed.*,to_jsonb(latest) AS state FROM claimed,latest
UNION ALL SELECT false,'media_pending',NULL::uuid,NULL::bigint,NULL::bigint,NULL::uuid[],NULL::uuid[],to_jsonb(latest) FROM latest,readiness WHERE readiness.pending;`,
  snapshot: `SELECT to_jsonb(s) AS state,to_jsonb(c) AS context FROM public.lexia_conversation_states s LEFT JOIN LATERAL (SELECT * FROM public.lexia_conversation_contexts WHERE conversation_id=s.id ORDER BY context_version DESC LIMIT 1) c ON true WHERE s.id=$1::uuid;`,
  context: `SELECT public.lexia_omni_store_context($1::uuid,$2::bigint,$3::uuid,$4::text,$5::uuid[],$6::jsonb,$7::jsonb) AS context_version;`,
  prepare: `SELECT public.lexia_omni_prepare_outbound_actions($1::uuid,$2::uuid,$3::bigint,NULL,$4::jsonb) AS action_count;`,
  gate: `SELECT * FROM public.lexia_omni_claim_outbound_action($1::uuid,$2::text);`,
  finish: `WITH m AS MATERIALIZED (SELECT * FROM public.lexia_omni_record_message($1::uuid,'ai',$5::text,clock_timestamp(),$8::text,$9::text,NULL,'completed',$2::uuid) WHERE $4::text='sent')
SELECT public.lexia_omni_finish_outbound_action($2::uuid,$3::text,$6::bigint,$4::text,$5::text,$7::text,(SELECT out_mensagem_id FROM m)) AS status;`,
  complete: `SELECT public.lexia_omni_complete_inbound_batch($1::uuid,$2::bigint,$3::uuid) AS next_seq;`,
  virtual: `WITH allowed AS MATERIALIZED (SELECT s.id FROM public.lexia_conversation_states s
 WHERE s.id=$1::uuid AND s.state_version=$4::bigint AND s.delivery_epoch=$5::bigint
 AND s.lead_message_seq=$6::bigint AND NOT public.lexia_omni_has_active_block(s.id,clock_timestamp())
 AND EXISTS(SELECT 1 FROM public.lexia_channel_accounts a WHERE a.id=s.account_id AND a.provider='fake' AND a.environment='isolated_test') FOR UPDATE),
 messages AS MATERIALIZED (SELECT r.* FROM allowed,jsonb_array_elements($2::jsonb) WITH ORDINALITY e(v,n)
 CROSS JOIN LATERAL public.lexia_omni_record_message(allowed.id,'system','virtual:'||$3::text||':'||e.n::text,clock_timestamp(),
 e.v->>'tipo',coalesce(e.v->>'texto',e.v->>'legenda',e.v->>'url'),'text','completed',NULL) r)
 SELECT EXISTS(SELECT 1 FROM allowed) AS permitted,(SELECT array_agg(out_mensagem_id) FROM messages) AS message_ids;`,
  supersede: `SELECT * FROM public.lexia_omni_supersede_inbound_batch($1::uuid,$2::bigint,$3::uuid);`,
};

function scrub(source) {
  const copy = structuredClone(source);
  const secrets = new Set();
  for (const n of source.nodes) {
    for (const a of n.parameters?.assignments?.assignments || []) if (/token|secret|password|senha|api.*key|telefone|base_url/i.test(a.name) && typeof a.value === 'string' && !a.value.startsWith('=')) secrets.add(a.value);
    const code = n.parameters?.jsCode || '';
    for (const match of code.matchAll(/(?:const|let|var)\s+\w*(?:TOKEN|SECRET|PASSWORD|API_KEY)\w*\s*=\s*(['"])([^'"\n]+)\1/gi)) secrets.add(match[2]);
  }
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const secret of secrets) if (secret.length > 5) value = value.split(secret).join('CONFIGURE_IN_CREDENTIAL');
      return value.replace(/\beyJ[A-Za-z0-9_.-]{30,}/g,'REMOVED_SECRET').replace(/\bsk-[A-Za-z0-9_-]{16,}/g,'REMOVED_SECRET')
        .replace(/https?:\/\/[^\s'"`<>]+/g,u=>/^https:\/\/(?:graph\.(?:facebook|instagram)\.com|api\.openai\.com)\//.test(u)?u:'https://configure.invalid')
        .replace(/\b\d{10,}\b/g,'REMOVED_CONTACT');
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k])=>!['credentials','webhookId','pinData','staticData'].includes(k)).map(([k,v])=>[k,walk(v)]));
    return value;
  };
  return walk(copy);
}

export function buildMirandaOriginal(source) {
  if (source.nodes.length !== 148) throw new Error('expected_original_Miranda_148_nodes');
  const w = scrub(source);
  const by = new Map(w.nodes.map(n=>[n.name,n]));
  const node = name => {const n=by.get(name);if(!n)throw new Error('missing_original_node:'+name);return n;};
  const add = (name,type,parameters,x,y,version=2) => {
    const n={id:uuid(name),name,type,typeVersion:version,parameters,position:[x,y]};w.nodes.push(n);by.set(name,n);return n;
  };
  const route = (from,targets) => {w.connections[from]={main:targets.map(a=>a.map(name=>({node:name,type:'main',index:0})))};};
  const code = (name,js,x,y) => add(name,'n8n-nodes-base.code',{jsCode:js},x,y);
  const pg = (name,query,values,x,y) => {
    const n=by.get(name)||add(name,'n8n-nodes-base.postgres',{},x,y,2.6);
    n.type='n8n-nodes-base.postgres';n.typeVersion=2.6;n.parameters={operation:'executeQuery',query,options:{queryReplacement:expr(values)}};
    n.credentials={postgres:{name:'LEXIA - Postgres Central Lote 2'}};n.retryOnFail=false;return n;
  };
  const iff = (name,condition,x,y) => add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{id:uuid(name),leftValue:expr(condition),rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},x,y,2.3);
  const note = (name,content,x,y,width=680,height=280) => add(name,'n8n-nodes-base.stickyNote',{content,width,height,color:5},x,y,1);
  const set = (name,fields) => {const n=node(name);n.parameters={assignments:{assignments:Object.entries(fields).map(([name,[value,type]])=>({id:uuid(name),name,value,type}))},options:{}};};

  for(const n of w.nodes) {
    n.id=uuid('original:'+n.name);
    delete n.disabled;delete n.continueOnFail;delete n.alwaysOutputData;
    if(n.type==='n8n-nodes-base.redis')n.credentials={redis:{name:'LEXIA - Redis Miranda CRM'}};
    if(n.type==='n8n-nodes-base.supabase')n.credentials={supabaseApi:{name:['Cancelar Follow-up'].includes(n.name)?'MIRANDA SKIN EXPERT':'LEXIA - Supabase Central Lote 2'}};
    if(n.type.includes('openAi')||n.type.includes('lmChatOpenAi'))n.credentials={openAiApi:{name:'Open AI Amynda'}};
    if(n.type.includes('googleGemini'))n.credentials={googlePalmApi:{name:'gEMINI pRO'}};
    if(n.type==='n8n-nodes-base.webhook'){
      n.parameters.path='lexia-miranda-crm-'+(n.name.includes('WhatsApp')?'whatsapp':n.name.endsWith('1')?'meta-verify':'meta');
      if(!n.name.endsWith('1')){n.parameters.authentication='headerAuth';n.credentials={httpHeaderAuth:{name:'LEXIA - Entrada Miranda autenticada'}};}
    }
  }
  w.name='MIRANDA SKIN EXPERT - OMNICHANNEL - LEXIA CRM (BASE ORIGINAL)';
  w.active=false;w.pinData={};w.tags=[];
  w.settings={executionOrder:'v1',saveManualExecutions:true,saveExecutionProgress:true,saveDataErrorExecution:'all',saveDataSuccessExecution:'all'};
  for(const k of ['id','versionId','activeVersionId','createdAt','updatedAt','shared','meta','triggerCount'])delete w[k];
  set('CENTRAL DE CONTROLE',{espera:[60,'number'],temperatura_agente:[0.8,'number'],permitir_teste_plataforma:[true,'boolean'],permitir_envio_real:[false,'boolean'],permitir_notificacao_handoff:[false,'boolean'],permitir_tools_teste:[false,'boolean'],cerebro_teste_revisado:[false,'boolean']});
  set('Config Cliente Lexia',{
    cliente_slug:['miranda_skin_experts','string'],cliente_nome:['Miranda Skin Experts','string'],workflow_template_version:['miranda_original_crm_v1','string'],
    environment:['isolated_test','string'],whatsapp_account_ref:['','string'],instagram_account_ref:['','string'],messenger_account_ref:['','string'],test_account_ref:['','string'],
    zapi_base_url:['','string'],frappe_url:['','string'],timezone:['America/New_York','string'],responsavel_handoff_nome:['Samuel Miranda','string'],
    canal_padrao:[expr(`${get('Entrada Unificada')}.body._canal || 'whatsapp'`),'string'],
    redis_namespace:[expr(`'lexia:miranda:crm:isolated_test:' + ${get('Entrada Unificada')}.body._canal`),'string'],
    modulos_ativos:[['servicos','agendamento','promocoes','indefinido'],'array'],permitir_envio_real:[expr(`${get('CENTRAL DE CONTROLE')}.permitir_envio_real`),'boolean'],
    permitir_notificacao_handoff:[false,'boolean'],modo_teste_conversas_cliente_bloqueadas:[false,'boolean']
  });

  // One normalized event per child execution preserves the original first/item expressions.
  node('Adaptar Entrada Z-API').parameters.jsCode=node('Adaptar Entrada Z-API').parameters.jsCode
    .replace('if (p.fromApi === true) continue;','// Automatic echoes are compared with the durable provider-ID ledger.')
    .replace('const body = {',"const body = { _lexia_transport: 'zapi', _provider_account_ref: String(p.instanceId || ''), _provider_timestamp: p.momment || Date.now(),");
  route('Adaptar Entrada Z-API',[['LEXIA | Distribuir eventos em serie']]);
  node('Contatos Bloqueados Meta').parameters.jsCode=`const out=[];for(const input of $input.all()){const body=typeof input.json.body==='string'?JSON.parse(input.json.body):input.json.body;for(const entry of body?.entry||[])for(const messaging of entry.messaging||[]){out.push({json:{body:{...body,entry:[{...entry,messaging:[messaging]}]}},pairedItem:{item:0}});}}return out;`;
  route('Contatos Bloqueados Meta',[['Normalizar Entrada Meta Omnichannel']]);
  node('Normalizar Entrada Meta Omnichannel').parameters.jsCode=node('Normalizar Entrada Meta Omnichannel').parameters.jsCode
    .replace('const body =','const body =')
    .replace("_canal: canal,","_canal: canal, _lexia_transport:'meta', _provider_account_ref:String(entry.id || ''), _provider_timestamp:messaging.timestamp || entry.time || Date.now(),");
  const meta=node('Normalizar Entrada Meta Omnichannel');
  const testStart=meta.parameters.jsCode.indexOf('const modoTeste');
  const testEnd=meta.parameters.jsCode.indexOf('const entry',testStart);
  meta.parameters.jsCode=meta.parameters.jsCode.slice(0,testStart)+meta.parameters.jsCode.slice(testEnd);
  meta.parameters.jsCode=meta.parameters.jsCode.replace('_canal: canal,',"_canal: canal, _lexia_transport:'meta', _provider_account_ref:String(entry.id || ''), _provider_timestamp:messaging.timestamp || entry.time || Date.now(),");
  const editStart=meta.parameters.jsCode.indexOf('const TOKEN_INSTAGRAM_EDIT');
  const editEnd=meta.parameters.jsCode.indexOf('const postback =',editStart);
  meta.parameters.jsCode=meta.parameters.jsCode.slice(0,editStart)+"// Edicoes nao originam uma nova resposta; sem chamadas HTTP ou tokens inline.\nif(messaging.message_edit)return [];\n"+meta.parameters.jsCode.slice(editEnd);
  const welcomeStart=meta.parameters.jsCode.indexOf('const PADROES_BOAS_VINDAS');
  const welcomeEnd=meta.parameters.jsCode.indexOf('const tiposPartilha',welcomeStart);
  meta.parameters.jsCode=meta.parameters.jsCode.slice(0,welcomeStart)+meta.parameters.jsCode.slice(welcomeEnd);
  const shareStart=meta.parameters.jsCode.indexOf('const tiposPartilha');
  const shareEnd=meta.parameters.jsCode.indexOf('const tiposMidia',shareStart);
  meta.parameters.jsCode=meta.parameters.jsCode.slice(0,shareStart)+meta.parameters.jsCode.slice(shareEnd);
  meta.parameters.jsCode=meta.parameters.jsCode
    .replace("if (isEcho && texto === '' && tiposMidia.includes(String(tipoAnexo).toLowerCase())) return [];",'// Ecos de midia conservam autoria e sao comparados pelo ID do provedor.')
    .replace('if (!texto && anexoUrl) {','if (anexoUrl) {')
    .replace("id: referral.ad_id || '',", "id: referral.ad_id || '', campanha_id:referral.campaign_id || adsCtx.campaign_id || '', conjunto_id:referral.adset_id || adsCtx.adset_id || '',");
  route('Normalizar Entrada Meta Omnichannel',[['LEXIA | Distribuir eventos em serie']]);
  add('LEXIA | Distribuir eventos em serie','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},-5440,1120,3);
  add('LEXIA | Executar este omnichannel por evento','n8n-nodes-base.executeWorkflow',{workflowId:{__rl:true,mode:'id',value:expr('$workflow.id')},workflowInputs:{mappingMode:'passThrough',value:{}},options:{waitForSubWorkflow:true}},-5180,1216,1.3);
  route('LEXIA | Distribuir eventos em serie',[[],['LEXIA | Executar este omnichannel por evento']]);
  route('LEXIA | Executar este omnichannel por evento',[['LEXIA | Distribuir eventos em serie']]);
  add('LEXIA | Evento interno individual','n8n-nodes-base.executeWorkflowTrigger',{inputSource:'passthrough'},-5440,720,1.1);
  route('LEXIA | Evento interno individual',[['Entrada Unificada']]);
  add('LEXIA | Webhook Teste Frappe','n8n-nodes-base.webhook',{httpMethod:'POST',path:'lexia-miranda-crm-agent-test',authentication:'headerAuth',responseMode:'responseNode',options:{}},-7000,1536,2.1).credentials={httpHeaderAuth:{name:'LEXIA - Agent Test Frappe'}};
  code('LEXIA | Adaptar teste virtual',`const raw=$json.body || {};const text=String(raw.lexia_mensagem || raw.text || raw.input?.text || '');const session=String(raw.lexia_session_id || raw.session_id || '');const run=String(raw.lexia_run_id || raw.run_id || '');if(!text||!session||!run)throw new Error('test_requires_message_session_run');return [{json:{body:{...raw,_lexia_transport:'test',_canal:raw.lexia_canal || raw.scope?.channel || 'whatsapp',lexia_modo_teste:true,lexia_session_id:session,lexia_run_id:run,lexia_message_id:raw.lexia_message_id || run,lexia_mensagem:text,_sender_id:'test:'+session,message:{type:'text',messageType:'Conversation',text,id:raw.lexia_message_id||run,fromMe:false}}},pairedItem:{item:0}}];`,-6710,1536);
  route('LEXIA | Webhook Teste Frappe',[['LEXIA | Adaptar teste virtual']]);
  route('LEXIA | Adaptar teste virtual',[['LEXIA | Chamar teste neste omnichannel']]);
  const testCall=add('LEXIA | Chamar teste neste omnichannel','n8n-nodes-base.executeWorkflow',structuredClone(node('LEXIA | Executar este omnichannel por evento').parameters),-6400,1536,1.3);
  add('LEXIA | Responder teste Frappe','n8n-nodes-base.respondToWebhook',{respondWith:'json',responseBody:expr('$json'),options:{}},-6100,1536,1.5);
  route(testCall.name,[['LEXIA | Responder teste Frappe']]);

  code('LEXIA | Preparar registro individual',runtime.record,-3950,736);
  pg('LEXIA | Persistir evento e mensagem',sql.ingest,'[JSON.stringify($json)]',-3630,736);
  code('LEXIA | Registro individual confirmado',runtime.unwrap,-3350,736);
  pg('Buscar Contacto',sql.contact,`[JSON.stringify(${REG})]`);
  node('Unificar Contacto').type='n8n-nodes-base.noOp';node('Unificar Contacto').typeVersion=1;
  iff('LEXIA | Evento novo?',`${REG}.author !== 'ai'`,-2250,736);
  route('Normalizar Dados Operacionais',[['LEXIA | Preparar registro individual']]);
  route('LEXIA | Preparar registro individual',[['LEXIA | Persistir evento e mensagem']]);
  route('LEXIA | Persistir evento e mensagem',[['LEXIA | Registro individual confirmado']]);
  route('LEXIA | Registro individual confirmado',[['Buscar Contacto']]);
  route('Buscar Contacto',[['Unificar Contacto']]);route('Unificar Contacto',[['LEXIA | Evento novo?']]);
  route('LEXIA | Evento novo?',[['Verificar Intervenção'],['CRM | Ler espelho da conversa']]);
  node('Verificar Intervenção').parameters.assignments.assignments[0].value=expr(`${REG}.author === 'human_agent'`);
  route('Verificar Intervenção',[['É intervenção humana?']]);
  pg('Set Intervenção Humana',sql.human,`[${REG}.conversation_id,'human:'+${REG}.provider_message_id,${REG}.message_id,${REG}.occurred_at]`);
  node('Intervenção é áudio?').parameters=structuredClone(iff('LEXIA | Condicao audio auxiliar',`${REG}.media_kind==='audio'`,0,0).parameters);
  w.nodes=w.nodes.filter(n=>n.name!=='LEXIA | Condicao audio auxiliar');by.delete('LEXIA | Condicao audio auxiliar');
  route('Set Intervenção Humana',[['Intervenção é áudio?']]);
  route('Intervenção é áudio?',[['Baixar Áudio da Intervenção'],['CRM | Ler espelho da conversa']]);
  const humanDownload=node('Baixar Áudio da Intervenção');
  humanDownload.parameters.url=expr(`${REG}.media_url`);
  humanDownload.parameters.options={timeout:30000,response:{response:{responseFormat:'file',outputPropertyName:'data'}}};humanDownload.onError='continueErrorOutput';humanDownload.retryOnFail=false;
  node('Transcrever Áudio da Intervenção').onError='continueErrorOutput';node('Transcrever Áudio da Intervenção').retryOnFail=false;
  code('LEXIA | Normalizar audio da equipe',runtime.media,-1940,300);
  code('LEXIA | Erro audio equipe preserva pausa',`return [{json:{error:'human_audio_processing_failed'},pairedItem:{item:0}}];`,-2200,40);
  route('Baixar Áudio da Intervenção',[['Transcrever Áudio da Intervenção'],['LEXIA | Erro audio equipe preserva pausa']]);
  route('Transcrever Áudio da Intervenção',[['LEXIA | Normalizar audio da equipe'],['LEXIA | Erro audio equipe preserva pausa']]);
  route('LEXIA | Erro audio equipe preserva pausa',[['LEXIA | Normalizar audio da equipe']]);
  pg('LEXIA | Gravar transcricao humana',sql.media,`[$json.message_id,$json.normalized_text,$json.media_status,$json.media_error_code,$json.conversation_id,JSON.stringify($json)]`,-1660,300);
  route('LEXIA | Normalizar audio da equipe',[['LEXIA | Gravar transcricao humana']]);
  route('LEXIA | Gravar transcricao humana',[['CRM | Ler espelho da conversa']]);
  pg('LEXIA | Enfileirar lead duravel',sql.lead,`[${REG}.conversation_id,'lead:'+${REG}.provider_message_id,${REG}.message_id,${REG}.occurred_at]`,-1696,960);
  route('É intervenção humana?',[['Set Intervenção Humana'],['LEXIA | Enfileirar lead duravel']]);
  route('LEXIA | Enfileirar lead duravel',[['Ver Pausa Manual']]);
  // Read the legacy controls too while the remaining five original workflows still use them.
  node('Ver Pausa Manual').parameters={operation:'get',propertyName:'pausa_manual',key:expr(`'lexia:novo_cliente:'+${OP}.canal+':v1:pausa_manual:'+${OP}.identificador_conversa`),options:{}};
  route('Ver Pausa Manual',[['Ver Pausa Eterna']]);
  node('Ver Pausa Eterna').parameters={operation:'get',propertyName:'pausa_eterna',key:expr(`'lexia:novo_cliente:'+${OP}.canal+':v1:pausa_eterna:'+${OP}.identificador_conversa`),options:{}};
  node('Ver Status Agente').parameters={operation:'get',propertyName:'status',key:expr(`'lexia:novo_cliente:'+${OP}.canal+':v1:status:'+${OP}.identificador_conversa`),options:{}};
  route('Ver Pausa Eterna',[['Ver Status Agente']]);
  route('Ver Status Agente',[['LEXIA | Checar todos os bloqueios']]);
  pg('LEXIA | Checar todos os bloqueios',sql.check,`[${REG}.conversation_id]`,-80,736);
  const paused=`$json.blocked || Boolean(${get('Ver Pausa Manual')}.pausa_manual) || Boolean(${get('Ver Pausa Eterna')}.pausa_eterna) || Boolean(${get('Ver Status Agente')}.status)`;
  node('Agente desativado?').parameters=structuredClone(iff('LEXIA | Condicao auxiliar',paused,0,0).parameters);
  w.nodes=w.nodes.filter(n=>n.name!=='LEXIA | Condicao auxiliar');by.delete('LEXIA | Condicao auxiliar');
  route('LEXIA | Checar todos os bloqueios',[['Agente desativado?']]);
  route('Agente desativado?',[['CRM | Ler espelho da conversa'],['Switch']]);
  node('Switch').parameters.rules.values[2].conditions.conditions[0].rightValue='imagem';
  node('Switch').parameters.options.fallbackOutput='extra';
  route('Switch',[['Texto'],['Audio'],['Imagem'],['PDF'],['Imagem1'],['CRM | Ler espelho da conversa']]);

  // The five original native media branches stay on the canvas.
  code('LEXIA | Normalizar resultado de midia',runtime.media,2370,752);
  code('LEXIA | Falha de midia preserva mensagem',`return [{json:{error:'media_processing_failed'},pairedItem:{item:0}}];`,2112,1920);
  route('Texto',[['LEXIA | Normalizar resultado de midia']]);
  for(const [download,process] of [['HTTP Request5','Transcribe a recording'],['HTTP Request7','Analyze image'],['HTTP Request9','Extract from File'],['HTTP Request11','Analyze video']]) {
    const d=node(download);d.parameters.options={...(d.parameters.options||{}),timeout:30000,response:{response:{responseFormat:'file',outputPropertyName:'data'}}};d.onError='continueErrorOutput';d.retryOnFail=false;
    route(download,[[process],['LEXIA | Falha de midia preserva mensagem']]);
    const p=node(process);p.onError='continueErrorOutput';p.retryOnFail=false;
    route(process,[['LEXIA | Normalizar resultado de midia'],['LEXIA | Falha de midia preserva mensagem']]);
  }
  route('LEXIA | Falha de midia preserva mensagem',[['LEXIA | Normalizar resultado de midia']]);
  pg('LEXIA | Atualizar midia sem duplicar mensagem',sql.media,`[$json.message_id,$json.normalized_text,$json.media_status,$json.media_error_code,$json.conversation_id,JSON.stringify($json)]`,2580,752);
  route('LEXIA | Normalizar resultado de midia',[['LEXIA | Atualizar midia sem duplicar mensagem']]);
  node('Redis').parameters={operation:'set',key:expr(`${REG}.redis_namespace+':buffer:'+${REG}.message_id`),value:expr('JSON.stringify($json.data)'),expire:true,ttl:3600};node('Redis').onError='continueRegularOutput';
  route('LEXIA | Atualizar midia sem duplicar mensagem',[['Redis']]);route('Redis',[['Redis_Buffer1']]);
  node('Redis_Buffer1').type='n8n-nodes-base.noOp';node('Redis_Buffer1').typeVersion=1;node('Redis_Buffer1').parameters={};delete node('Redis_Buffer1').credentials;
  node('Wait').parameters={amount:expr(`${REG}.buffer_window_ms/1000`),unit:'seconds'};
  pg('Redis_Buffer2',sql.claim,`[${REG}.conversation_id]`);
  code('LEXIA | Lote autorizado',runtime.batch,3430,1100);
  route('Redis_Buffer2',[['LEXIA | Lote autorizado']]);
  const ifBatch=iff('LEXIA | Lote reivindicado?','$json.out_claimed === true',3660,1100);
  route('LEXIA | Lote autorizado',[[ifBatch.name]]);
  iff('LEXIA | Aguardar lote em andamento?','$json.wait_again === true',3900,1360);
  add('LEXIA | Aguardar concorrencia','n8n-nodes-base.wait',{amount:2,unit:'seconds'},4160,1360,1.1);
  route(ifBatch.name,[['Mensagem para o Agente'],['LEXIA | Aguardar lote em andamento?']]);
  route('LEXIA | Aguardar lote em andamento?',[['LEXIA | Aguardar concorrencia'],['CRM | Ler espelho da conversa']]);
  route('LEXIA | Aguardar concorrencia',[['Redis_Buffer2']]);
  node('Mensagem para o Agente').type='n8n-nodes-base.noOp';node('Mensagem para o Agente').typeVersion=1;node('Mensagem para o Agente').parameters={};
  route('Mensagem para o Agente',[['Buscar Histórico da Conversa']]);
  node('Buscar Histórico da Conversa').parameters={operation:'getAll',tableId:'lexia_mensagens',returnAll:true,filters:{conditions:[{keyName:'omni_conversation_id',condition:'eq',keyValue:expr(`${REG}.conversation_id`)},{keyName:'cliente_slug',condition:'eq',keyValue:expr(`${REG}.cliente_slug`)}]}};
  route('Agrupar Histórico',[['LEXIA | Estado e contexto duraveis']]);
  pg('LEXIA | Estado e contexto duraveis',sql.snapshot,`[${REG}.conversation_id]`,6120,672);
  add('LEXIA | Configuracao de contexto','n8n-nodes-base.supabase',{operation:'getAll',tableId:'lexia_context_agent_configs',returnAll:true,filterType:'manual',matchType:'allFilters',filters:{conditions:[{keyName:'environment',condition:'eq',keyValue:expr(`${REG}.environment`)},{keyName:'cliente_slug',condition:'eq',keyValue:expr(`${REG}.cliente_slug`)},{keyName:'status',condition:'eq',keyValue:'active'}]}},6290,672,1).credentials={supabaseApi:{name:'LEXIA - Supabase Central Lote 2'}};
  node('LEXIA | Configuracao de contexto').alwaysOutputData=true;
  code('LEXIA | Validar configuracao unica',`const items=$input.all();if(items.length!==1||!items[0].json.prompt_template)throw new Error('context_config_unavailable');try{LexiaSchema.assertJsonSchemaValue(items[0].json.company_fields_schema,{});}catch(e){if(e.name!=='ContractValidationError')throw e;}return [{json:items[0].json,pairedItem:{item:0}}];`,6500,672);
  route('LEXIA | Estado e contexto duraveis',[['LEXIA | Configuracao de contexto']]);
  route('LEXIA | Configuracao de contexto',[['LEXIA | Validar configuracao unica']]);
  route('LEXIA | Validar configuracao unica',[['Preparar Pacote de Contexto']]);
  node('Preparar Pacote de Contexto').type='n8n-nodes-base.code';node('Preparar Pacote de Contexto').typeVersion=2;node('Preparar Pacote de Contexto').parameters={jsCode:runtime.package};
  node('Agente de Contexto').parameters.text=expr(`JSON.stringify(${PACK})`);
  node('Agente de Contexto').parameters.options.systemMessage=contextAgentPrompt();
  node('Preparar Contexto Activo').parameters.jsCode=runtime.context;
  pg('LEXIA | Guardar contexto versionado',sql.context,`[${REG}.conversation_id,${PACK}.context_version,${PACK}.context_call_id,$json.config_version,$json.source_message_ids,JSON.stringify($json.operational_context),JSON.stringify($json.company_fields)]`,7190,672);
  route('Preparar Contexto Activo',[['LEXIA | Guardar contexto versionado']]);
  node('Guardar Contexto Activo Genérico').parameters={operation:'set',key:expr(`${REG}.redis_namespace+':context'`),value:expr(`JSON.stringify(${get('Preparar Contexto Activo')})`)};node('Guardar Contexto Activo Genérico').onError='continueRegularOutput';
  route('LEXIA | Guardar contexto versionado',[['Guardar Contexto Activo Genérico']]);
  const originalPayload=node('Preparar Payload Cérebro').parameters.jsCode;
  const returnIndex=originalPayload.lastIndexOf('return [');
  if(returnIndex<0)throw new Error('unsupported_original_brain_payload');
  node('Preparar Payload Cérebro').parameters.jsCode=originalPayload.slice(0,returnIndex)+originalPayload.slice(returnIndex).replace('return [','const output = [')+'\n'+runtime.payloadTail;
  // These original node names are referenced by the original payload builder.
  node('Obter Contexto Activo').type='n8n-nodes-base.code';node('Obter Contexto Activo').typeVersion=2;
  node('Obter Contexto Activo').parameters={jsCode:`const snapshot=$('LEXIA | Estado e contexto duraveis').first().json;return [{json:{contexto_activo:JSON.stringify({tipo_assunto:snapshot.context?.operational_context?.intent||'indefinido',confianca:snapshot.context?.operational_context?.confidence||0,resumo_contexto:snapshot.context?.operational_context?.summary||'',dados:snapshot.context?.company_fields||{}})},pairedItem:{item:0}}];`};delete node('Obter Contexto Activo').credentials;
  route('LEXIA | Estado e contexto duraveis',[['Obter Contexto Activo']]);route('Obter Contexto Activo',[['LEXIA | Configuracao de contexto']]);
  iff('LEXIA | Cerebro de teste revisado?',`${REG}.mode_test !== true || ${get('CENTRAL DE CONTROLE')}.cerebro_teste_revisado === true`,7780,672);
  code('LEXIA | Bloquear tools reais no teste',`throw new Error('Selecione uma copia do cerebro com tools apontando ao seu calendario de teste; depois ative cerebro_teste_revisado na CENTRAL DE CONTROLE. O cerebro original pode produzir efeitos reais.');`,8030,1200);
  route('Preparar Payload Cérebro',[['LEXIA | Cerebro de teste revisado?']]);
  route('LEXIA | Cerebro de teste revisado?',[['Chamar Cérebro do Cliente'],['LEXIA | Bloquear tools reais no teste']]);
  node('Chamar Cérebro do Cliente').parameters.workflowId={__rl:true,value:'',mode:'list',cachedResultName:'SELECIONAR CEREBRO MIRANDA APOS IMPORTAR'};
  node('Chamar Cérebro do Cliente').parameters.options.waitForSubWorkflow=true;
  // Preserve the original parser, but never accept malformed output as a harmless no-reply.
  node('Validar Saída Cérebro Cliente').parameters.jsCode=node('Validar Saída Cérebro Cliente').parameters.jsCode.replace('const parsed = parseJsonSeguro(raw) || {};',"if (parseFalhou) throw new Error('brain_output_invalid');\nconst parsed = parseJsonSeguro(raw);");
  node('Fundir Contexto Pós-Cérebro').parameters.jsCode=node('Fundir Contexto Pós-Cérebro').parameters.jsCode.replace(/if \(\/confirmad\|confirmed\/i\.test\(textosEntregues\)\) \{[\s\S]*?\n\}/,'// Appointment confirmation is owned by the tool, never by matching response text.');
  node('Guardar Contexto Pós-Cérebro').parameters={operation:'set',key:expr(`${REG}.redis_namespace+':brain_context_proposal'`),value:expr('JSON.stringify($json.contexto_para_guardar)')};node('Guardar Contexto Pós-Cérebro').onError='continueRegularOutput';
  code('LEXIA | Validar fatos operacionais do cerebro',runtime.brainContext,8740,720);
  pg('LEXIA | Persistir fatos apos o cerebro',sql.context.replace('$3::uuid',"overlay(overlay(md5('brain-context:'||$3::text) placing '4' from 13) placing '8' from 17)::uuid"),`[${REG}.conversation_id,${PACK}.context_version+1,$json.context_call_id,$json.config_version,$json.source_message_ids,JSON.stringify($json.operational_context),JSON.stringify($json.company_fields)]`,9000,720);
  code('LEXIA | Restaurar saida validada',`return [{json:$('LEXIA | Validar fatos operacionais do cerebro').first().json,pairedItem:{item:0}}];`,9260,720);
  route('Fundir Contexto Pós-Cérebro',[['LEXIA | Validar fatos operacionais do cerebro']]);
  route('LEXIA | Validar fatos operacionais do cerebro',[['LEXIA | Persistir fatos apos o cerebro']]);
  route('LEXIA | Persistir fatos apos o cerebro',[['LEXIA | Restaurar saida validada']]);
  route('LEXIA | Restaurar saida validada',[['Guardar Contexto Pós-Cérebro']]);
  // A handoff is a durable effect, not merely a field in the response.
  iff('LEXIA | Cerebro solicitou handoff?',`${get('Validar Saída Cérebro Cliente')}.handoff.necessario===true`,9200,940);
  pg('LEXIA | Registrar handoff independente',`SELECT * FROM public.lexia_omni_request_handoff($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,clock_timestamp());`,
    `[${REG}.conversation_id,'brain:'+${CLAIM}.invocation_id,${CLAIM}.invocation_id,${get('Validar Saída Cérebro Cliente')}.handoff.motivo||'Solicitado pelo cerebro',${get('Validar Saída Cérebro Cliente')}.handoff.resumo_para_equipa,({baixa:'low',normal:'normal',alta:'high',urgente:'high'})[${get('Validar Saída Cérebro Cliente')}.handoff.prioridade]||'normal']`,9500,1200);
  route('Guardar Contexto Pós-Cérebro',[['LEXIA | Cerebro solicitou handoff?']]);
  route('LEXIA | Cerebro solicitou handoff?',[['LEXIA | Registrar handoff independente'],['Preparar Saída Omnichannel']]);
  route('LEXIA | Registrar handoff independente',[['LEXIA | Concluir lote']]);
  // Prepare stable action IDs in SQL; do not use the brain's positional IDs for idempotency.
  pg('LEXIA | Preparar plano de entrega',`WITH input AS (SELECT $1::jsonb v), actions AS (
SELECT jsonb_agg(jsonb_build_object('action_id',md5(($2::uuid)::text||':'||(i.n)::text)::uuid,'sequence',i.n,'kind','reply','captured_state',$3::jsonb,'content',i.e) ORDER BY i.n) list
FROM input CROSS JOIN LATERAL jsonb_array_elements(input.v->'entregas') WITH ORDINALITY i(e,n))
SELECT public.lexia_omni_prepare_outbound_actions($4::uuid,$2::uuid,$5::bigint,NULL,actions.list) AS action_count,actions.list FROM actions;`,
    `[JSON.stringify(${get('Preparar Saída Omnichannel')}),${CLAIM}.invocation_id,JSON.stringify(${PACK}.state),${REG}.conversation_id,${CLAIM}.out_cutoff_seq]`,9250,1120);
  iff('LEXIA | Tem entregas?',`${get('Preparar Saída Omnichannel')}.entregas.length > 0`,9190,672);
  route('Preparar Saída Omnichannel',[['LEXIA | Tem entregas?']]);
  route('LEXIA | Tem entregas?',[['É Teste Workflow? - Saída Genérica'],['LEXIA | Concluir lote']]);
  route('É Teste Workflow? - Saída Genérica',[['LEXIA | Resultado virtual Frappe'],['LEXIA | Preparar plano de entrega']]);
  code('LEXIA | Resultado virtual Frappe',`const p=$('Preparar Saída Omnichannel').first().json;const op=$('Normalizar Dados Operacionais').first().json;return [{json:{...p,run_id:op.lexia_run_id,session_id:op.lexia_session_id,mode:'virtual_channel',provider_send_attempted:false,status:'completed'},pairedItem:{item:0}}];`,9500,400);
  pg('LEXIA | Persistir resposta no canal virtual',sql.virtual,`[${REG}.conversation_id,JSON.stringify(${get('Preparar Saída Omnichannel')}.entregas),${CLAIM}.invocation_id,${PACK}.state.state_version,${PACK}.state.delivery_epoch,${CLAIM}.out_cutoff_seq]`,9700,120);
  code('LEXIA | Resultado virtual revalidado',`const base=$('LEXIA | Resultado virtual Frappe').first().json;return [{json:$json.permitted?base:{...base,entregas:[],mensagens:[],resposta:'',status:'suppressed',reason:'state_changed'},pairedItem:{item:0}}];`,9950,120);
  pg('LEXIA | Identificar historico virtual',`WITH tagged AS (UPDATE public.lexia_mensagens SET origem='teste_workflow' WHERE id=ANY($1::uuid[]) AND omni_conversation_id=$2::uuid AND omni_author='system' RETURNING id) SELECT $3::jsonb AS data,(SELECT count(*) FROM tagged) AS tagged;`,
    `[$json.message_ids||[],${REG}.conversation_id,JSON.stringify($json)]`,9900,-80);
  code('LEXIA | Restaurar revalidacao virtual',runtime.unwrap,10180,-80);
  route('LEXIA | Resultado virtual Frappe',[['LEXIA | Persistir resposta no canal virtual']]);
  route('LEXIA | Persistir resposta no canal virtual',[['LEXIA | Identificar historico virtual']]);
  route('LEXIA | Identificar historico virtual',[['LEXIA | Restaurar revalidacao virtual']]);
  route('LEXIA | Restaurar revalidacao virtual',[['LEXIA | Resultado virtual revalidado']]);
  route('LEXIA | Resultado virtual revalidado',[['LEXIA | Concluir lote virtual']]);
  pg('LEXIA | Concluir lote virtual',sql.complete,`[${CLAIM}.out_batch_id,${CLAIM}.out_fencing_token,${CLAIM}.invocation_id]`,9750,400);
  code('LEXIA | Devolver resposta virtual',`return [{json:$('LEXIA | Resultado virtual revalidado').first().json,pairedItem:{item:0}}];`,10000,400);
  route('LEXIA | Concluir lote virtual',[['LEXIA | Devolver resposta virtual']]);
  code('LEXIA | Anexar IDs de acoes',`const p=$('Preparar Saída Omnichannel').first().json;const actions=$input.first().json.list;return [{json:{...p,entregas:p.entregas.map((e,i)=>({...e,action_id:actions[i].action_id}))},pairedItem:{item:0}}];`,9570,1120);
  route('LEXIA | Preparar plano de entrega',[['LEXIA | Anexar IDs de acoes']]);route('LEXIA | Anexar IDs de acoes',[['Split Out - Texto Genérico']]);
  node('Split Out - Texto Genérico').parameters={fieldToSplitOut:'entregas',options:{destinationFieldName:'entregas'}};
  node('Loop Over Items - Entregas').parameters.batchSize=1;
  // Typing and pauses occur before the final claim, never after it.
  route('Loop Over Items - Entregas',[['LEXIA | Concluir lote'],['Wait - Texto Genérico']]);
  node('Wait - Texto Genérico').parameters={amount:4,unit:'seconds'};
  pg('LEXIA | Revalidar legado antes da bolha',sql.check,`[${REG}.conversation_id]`,11040,1320);
  route('Wait - Texto Genérico',[['LEXIA | Ler pausa manual na entrega']]);
  for(const [name,prop] of [['LEXIA | Ler pausa manual na entrega','pausa_manual'],['LEXIA | Ler agendamento legado na entrega','pausa_eterna'],['LEXIA | Ler handoff legado na entrega','status']]) {
    add(name,'n8n-nodes-base.redis',{operation:'get',propertyName:prop,key:expr(`'lexia:novo_cliente:'+${OP}.canal+':v1:${prop}:'+${OP}.identificador_conversa`),options:{}},10800,1320+['pausa_manual','pausa_eterna','status'].indexOf(prop)*200,1).credentials={redis:{name:'LEXIA - Redis Miranda CRM'}};
  }
  route('LEXIA | Ler pausa manual na entrega',[['LEXIA | Ler agendamento legado na entrega']]);
  route('LEXIA | Ler agendamento legado na entrega',[['LEXIA | Ler handoff legado na entrega']]);
  route('LEXIA | Ler handoff legado na entrega',[['LEXIA | Revalidar legado antes da bolha']]);
  iff('LEXIA | Legado permite esta bolha?',`${get('CENTRAL DE CONTROLE')}.permitir_envio_real===true && !${get('LEXIA | Ler pausa manual na entrega')}.pausa_manual && !${get('LEXIA | Ler agendamento legado na entrega')}.pausa_eterna && !${get('LEXIA | Ler handoff legado na entrega')}.status`,11300,1320);
  route('LEXIA | Revalidar legado antes da bolha',[['LEXIA | Legado permite esta bolha?']]);
  pg('LEXIA | Claim antes de cada envio',sql.gate,`[${item}.action_id,String($execution.id)]`,11560,1320);
  route('LEXIA | Legado permite esta bolha?',[['LEXIA | Claim antes de cada envio'],['LEXIA | Encerrar resposta bloqueada']]);
  iff('LEXIA | Claim autorizado?','$json.out_acquired===true',11820,1320);
  route('LEXIA | Claim antes de cada envio',[['LEXIA | Claim autorizado?']]);
  route('LEXIA | Claim autorizado?',[['Enviar Mensagem Cliente - Texto Genérico'],['LEXIA | Encerrar resposta bloqueada']]);
  node('Enviar Mensagem Cliente - Texto Genérico').type='n8n-nodes-base.switch';node('Enviar Mensagem Cliente - Texto Genérico').typeVersion=3.4;
  node('Enviar Mensagem Cliente - Texto Genérico').parameters={rules:{values:['whatsapp','instagram','messenger'].map(channel=>({conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{id:uuid(channel),leftValue:expr(`${REG}.channel`),rightValue:channel,operator:{type:'string',operation:'equals'}}],combinator:'and'},renameOutput:true,outputKey:channel}))},options:{fallbackOutput:'extra'}};
  const sendParams=structuredClone(source.nodes.find(n=>n.name==='Enviar Mensagem Cliente - Texto Genérico').parameters);
  const sendNames=[];
  for(const channel of ['whatsapp','instagram','messenger']) {
    const name='LEXIA | Enviar '+channel;sendNames.push(name);
    const p=structuredClone(sendParams);p.sendQuery=false;delete p.queryParameters;
    p.jsonBody=p.jsonBody.replace("const digitando = Math.floor(Math.random() * 5) + 3;","const digitando = 0; // Nenhuma espera depois do gate.\nif(tipo==='documento')return JSON.stringify({phone:telefone,document:url,fileName:entrega.nome_arquivo||'documento.pdf'});")
      .replace("if (tipo === 'imagem' || tipo === 'image' || tipo === 'foto') {\n    return JSON.stringify({","if (tipo === 'documento') return JSON.stringify({recipient:{id:recipient},message:{attachment:{type:'file',payload:{url,is_reusable:true}}}});\n  if (tipo === 'imagem' || tipo === 'image' || tipo === 'foto') {\n    return JSON.stringify({");
    p.authentication='genericCredentialType';p.genericAuthType=channel==='whatsapp'?'httpCustomAuth':'httpHeaderAuth';
    p.headerParameters={parameters:[{name:'Accept',value:'application/json'}]};
    p.url=channel==='whatsapp'?expr(`${CFG}.zapi_base_url+(${item}.tipo==='imagem'?'/send-image':${item}.tipo==='documento'?'/send-document/pdf':'/send-text')`):(channel==='instagram'?'https://graph.instagram.com/v21.0/me/messages':'https://graph.facebook.com/v21.0/me/messages');
    p.options={timeout:30000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}};
    const n=add(name,'n8n-nodes-base.httpRequest',p,12350,1120+sendNames.length*260,4.4);
    n.retryOnFail=false;n.onError='continueErrorOutput';n.credentials={[p.genericAuthType]:{name:'LEXIA - '+channel+' envio'}};
    route(name,[['LEXIA | Classificar resultado de envio'],['LEXIA | Classificar resultado de envio']]);
  }
  route('Enviar Mensagem Cliente - Texto Genérico',[...[...sendNames].map(n=>[n]),['LEXIA | Encerrar resposta bloqueada']]);
  code('LEXIA | Classificar resultado de envio',runtime.delivery,12800,1320);
  pg('Guardar Mensagem Enviada - Texto Genérico',sql.finish,`[${REG}.conversation_id,$json.delivery.action_id,String($execution.id),$json.status,$json.provider_message_id,$json.claim.out_fencing_token,$json.reason,$json.delivery.tipo,$json.delivery.tipo==='texto'?$json.delivery.texto:JSON.stringify($json.delivery)]`);
  route('LEXIA | Classificar resultado de envio',[['Guardar Mensagem Enviada - Texto Genérico']]);
  iff('LEXIA | Entrega confirmada?','$json.status === "sent"',13200,1320);
  route('Guardar Mensagem Enviada - Texto Genérico',[['LEXIA | Entrega confirmada?']]);
  route('LEXIA | Entrega confirmada?',[['Loop Over Items - Entregas'],['LEXIA | Concluir lote']]);
  pg('LEXIA | Encerrar resposta bloqueada',`SELECT CASE WHEN EXISTS(SELECT 1 FROM public.lexia_conversation_states WHERE id=$4::uuid AND lead_message_seq>$5::bigint)
 THEN public.lexia_omni_supersede_inbound_batch($1::uuid,$2::bigint,$3::uuid)
 ELSE public.lexia_omni_complete_inbound_batch($1::uuid,$2::bigint,$3::uuid) END AS next_seq;`,`[${CLAIM}.out_batch_id,${CLAIM}.out_fencing_token,${CLAIM}.invocation_id,${REG}.conversation_id,${CLAIM}.out_cutoff_seq]`,12100,1900);
  route('LEXIA | Encerrar resposta bloqueada',[['CRM | Ler espelho da conversa']]);
  pg('LEXIA | Concluir lote',sql.complete,`[${CLAIM}.out_batch_id,${CLAIM}.out_fencing_token,${CLAIM}.invocation_id]`,13200,600);
  route('LEXIA | Concluir lote',[['CRM | Ler espelho da conversa']]);

  // Durable messages can be replayed to the CRM with stable IDs after an HTTP failure.
  pg('CRM | Ler espelho da conversa',`SELECT to_jsonb(s)||jsonb_build_object('event_uuid',md5('conversation.opened:'||s.id::text)::uuid) AS state,to_jsonb(c) AS contact,
 coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('event_uuid',md5('message.recorded:'||m.id::text)::uuid) ORDER BY m.criado_em,m.id) FROM public.lexia_mensagens m WHERE m.omni_conversation_id=s.id),'[]'::jsonb) AS messages,
 coalesce((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('event_uuid',md5('block:'||b.id::text||':'||b.atualizado_em::text||':'||b.status)::uuid) ORDER BY b.criado_em,b.id) FROM public.lexia_conversation_blocks b WHERE b.conversation_id=s.id),'[]'::jsonb) AS blocks,
 coalesce((SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('event_uuid',md5('delivery:'||o.id::text||':'||o.status)::uuid) ORDER BY o.criado_em,o.id) FROM public.lexia_outbound_actions o WHERE o.conversation_id=s.id),'[]'::jsonb) AS actions
 FROM public.lexia_conversation_states s LEFT JOIN public.lexia_contactos c ON c.id=s.contacto_id WHERE s.id=$1::uuid;`,`[${REG}.conversation_id]`,13500,736);
  code('CRM | Montar eventos idempotentes',`const q=$input.first().json;const r=$('LEXIA | Registro individual confirmado').first().json;const scope={environment:r.environment,cliente_slug:r.cliente_slug,channel:r.channel,account_ref:r.account_ref,conversation_ref:r.conversation_ref};
const out=[];const stamp=q.state.criado_em;let seq=0;
const emit=(type,payload,ref,at,id,authority='provider_event')=>{out.push({json:{event:{schema_version:'lexia.crm.event.v1',event_id:id,idempotency_key:'lexia:crm:'+id,correlation_id:q.state.id,event_type:type,occurred_at:new Date(at).toISOString(),emitted_at:new Date(at).toISOString(),sequence:++seq,scope,source:{system:authority==='provider_event'||authority==='provider_result'?'provider':'workflow',authority,workflow_ref:'miranda-original-crm',execution_ref:String($execution.id),source_ref:ref},payload}},pairedItem:{item:0}});};
emit('conversation.opened',{contact_ref:q.contact.id,display_name:q.contact.nome||r.nome,resume_mode:r.resume_mode},q.state.id,stamp,q.state.event_uuid);
for(const m of q.messages)emit('message.recorded',{message_id:m.id,provider_message_ref:m.provider_message_id||'',direction:m.omni_author==='lead'?'inbound':'outbound',author:m.omni_author||'system',message_type:{texto:'text',audio:'audio',imagem:'image',documento:'pdf',video:'video'}[m.tipo]||'event',text:m.conteudo||'',delivery_status:m.omni_author==='lead'||m.omni_author==='human_agent'?'received':'sent',...(m.omni_action_id?{action_id:m.omni_action_id}:{})},m.id,m.provider_timestamp||m.criado_em,m.event_uuid,m.omni_author==='ai'?'provider_result':'provider_event');
for(const b of q.blocks){if(!['human_intervention','manual_pause','handoff','appointment'].includes(b.block_type))continue;const active=b.status==='active'&&(!b.expires_at||Date.parse(b.expires_at)>Date.now());if(active)emit('block.upserted',{block_id:b.id,block_type:b.block_type,source_ref:b.source_ref,reason:b.block_type,starts_at:new Date(b.criado_em).toISOString(),...(b.expires_at?{expires_at:new Date(b.expires_at).toISOString()}:{}),effects:{replies:true,followups:true,reminders:b.block_type!=='appointment'}},b.id+':'+b.atualizado_em,b.atualizado_em,b.event_uuid,'workflow_execution');else emit('block.closed',{block_id:b.id,reason:b.status==='active'?'expired':b.status,closed_at:new Date(b.expires_at||b.atualizado_em).toISOString()},b.id+':'+b.status,b.atualizado_em,b.event_uuid,'workflow_execution');}
for(const a of q.actions)if(['sent','delivery_unknown','suppressed'].includes(a.status))emit('message.delivery.updated',{message_id:a.mensagem_id||a.id,delivery_status:a.status,attempted_at:new Date(a.reivindicado_em||a.criado_em).toISOString(),provider_message_ref:a.provider_message_id||'',reason:a.reason||''},a.id+':'+a.status,a.concluido_em||a.criado_em,a.event_uuid,a.status==='suppressed'?'system_reconciliation':'provider_result');
for(const i of out){if(i.json.event.source.authority==='system_reconciliation')i.json.event.source.system='system';LexiaSchema.assertContractSchema('crm-sync-event',i.json.event);}return out;`,13800,736);
  route('CRM | Ler espelho da conversa',[['CRM | Montar eventos idempotentes']]);
  node('CRM | Montar eventos idempotentes').parameters.jsCode=node('CRM | Montar eventos idempotentes').parameters.jsCode
    .replace('source_ref:ref},payload','provider_ref:ref.slice(0,256)},payload')
    .replace("m.omni_author==='ai'?'provider_result':'provider_event'","m.omni_author==='ai'?'workflow_execution':'provider_event'")
    .replace("reason:b.status==='active'?'expired':b.status,closed_at:","status:b.status==='active'?'expired':b.status,resolved_at:")
    .replace('for(const i of out){',"if(r.attribution?.id && r.attribution_event_uuid)emit('attribution.captured',{source_type:'meta_ad',ad_ref:String(r.attribution.id).slice(0,256),campaign_ref:String(r.attribution.campanha_id||'').slice(0,256),adset_ref:String(r.attribution.conjunto_id||'').slice(0,256),captured_at:new Date(r.occurred_at).toISOString()},r.provider_message_id,r.occurred_at,r.attribution_event_uuid,'provider_event');\nfor(const i of out){");
  node('CRM | Ler espelho da conversa').parameters.query=node('CRM | Ler espelho da conversa').parameters.query
    .replace("||b.status)::uuid", "||(CASE WHEN b.status='active' AND b.expires_at<=clock_timestamp() THEN 'expired' ELSE b.status END))::uuid");
  add('CRM | Espelhar eventos em ordem','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},14100,736,3);
  add('CRM | Enviar evento ao Frappe','n8n-nodes-base.httpRequest',{method:'POST',url:expr(`${CFG}.frappe_url + '/api/method/lexia_crm.api.ingest_event'`),authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:expr('{event:$json.event}'),options:{timeout:15000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}},14400,736,4.4).credentials={httpHeaderAuth:{name:'LEXIA - Frappe CRM'}};
  code('CRM | Confirmar espelho',`if(Number($json.statusCode)<200||Number($json.statusCode)>=300)throw new Error('crm_sync_failed_replay_from_durable_messages');return [{json:{crm_synced:true},pairedItem:{item:0}}];`,14650,736);
  route('CRM | Montar eventos idempotentes',[['CRM | Espelhar eventos em ordem']]);
  route('CRM | Espelhar eventos em ordem',[[],['CRM | Enviar evento ao Frappe']]);route('CRM | Enviar evento ao Frappe',[['CRM | Confirmar espelho']]);route('CRM | Confirmar espelho',[['CRM | Espelhar eventos em ordem']]);

  // Keep obsolete original branches visible for comparison, but isolate them from all triggers.
  const legacy=['Filtro de Mensagens','Contatos Bloqueados','Bloquear Contatos WhatsApp','Pausado Eternamente?','Restaurar Mensagem','É Cartão de Anúncio?','Esperar 5 Minutos','Buscar Resposta do Cliente','Cliente Respondeu?','Preparar Follow-up Rápido','Registrar Eco Follow-up Rápido','Enviar Follow-up Rápido','Guardar Follow-up Rápido no Histórico','Verificar Trava Follow-up','Follow-up Já Enviado?','Contatos Bloqueados Meta_UNUSED','Buscar Última Mensagem do Lead','Separar Balões Follow-up','Guardar Mensagem da Intervenção','Guardar Mensagem Recebida na Pausa','Esperar 15 Minutos (Retomada)','Ver Pausa Manual Pós-Pausa','Ver Status Pós-Pausa','Samuel Continuou?','Buscar Mensagens Pós-Pausa','Verificar Última Mensagem Pós-Pausa','Última É do Cliente?','Trava Retomada','Retomada Já Feita?','Apagar Mensagem da Pausa','Intervenção é áudio?','Baixar Áudio da Intervenção','Transcrever Áudio da Intervenção','Obter Eco IA Omnichannel','É Eco IA Omnichannel?','Permitir Execução?','Apagar Buffer1','If1','Redis3','Redis4','Redis5','Redis8','Contacto Existe?','Actualizar Contacto','Criar Contacto','Guardar Mensagem Recebida','Guardar Resultado Teste Workflow Agente Genérico','Pode Enviar Real? - Texto Genérico','Registrar Eco IA - Texto Genérico','Enviar Digitando - Meta','Preparar Perfil Meta','HTTP Request','Juntar Nome Meta','Preparar Follow-up','Armar Follow-up'];
  let n=0;
  for(const name of legacy)if(by.has(name)&&!['Intervenção é áudio?','Baixar Áudio da Intervenção','Transcrever Áudio da Intervenção'].includes(name)){const v=node(name);v.disabled=true;v.position=[(n%10)*280,3500+Math.floor(n/10)*240];n++;delete w.connections[name];if(v.type==='n8n-nodes-base.code')v.parameters={jsCode:"// Ramo legado substituido pelo registro duravel e gate compartilhado.\nreturn [];"};}
  const reachable=new Set();
  const visit=(name)=>{if(reachable.has(name)||node(name).disabled)return;reachable.add(name);for(const outputs of Object.values(w.connections[name]||{}))for(const output of outputs)for(const target of output)visit(target.node);};
  for(const n of w.nodes)if(n.type.includes('Trigger')||n.type==='n8n-nodes-base.webhook')visit(n.name);
  for(const n of w.nodes)if(!reachable.has(n.name)&&n.type!=='n8n-nodes-base.stickyNote'&&n.name!=='OpenAI Chat Model'){n.disabled=true;delete w.connections[n.name];}
  for(const [from,links] of Object.entries(w.connections))if(!node(from).disabled)for(const outputs of Object.values(links))for(const output of outputs)for(const target of output)if(by.get(target.node)?.disabled)throw new Error('active_edge_to_legacy:'+from+':'+target.node);
  // Deterministic IDs must also satisfy the UUID version/variant contract.
  for(const n of w.nodes)if(n.type==='n8n-nodes-base.postgres'){
    for(const seed of ["($2::uuid)::text||':'||(i.n)::text","'conversation.opened:'||s.id::text","'message.recorded:'||m.id::text","'block:'||b.id::text||':'||b.atualizado_em::text||':'||(CASE WHEN b.status='active' AND b.expires_at<=clock_timestamp() THEN 'expired' ELSE b.status END)","'delivery:'||o.id::text||':'||o.status"]){
      n.parameters.query=n.parameters.query.replace(`md5(${seed})::uuid`,`overlay(overlay(md5(${seed}) placing '4' from 13) placing '8' from 17)::uuid`);
    }
  }
  // The validator is the same local implementation used by the contract regression suite.
  const bundle=bundleForN8n(resolve(ROOT,'lib/omnichannel/schema-validator.ts'),'LexiaSchema');
  for(const name of ['LEXIA | Preparar registro individual','LEXIA | Validar configuracao unica','Preparar Contexto Activo','LEXIA | Validar fatos operacionais do cerebro','CRM | Montar eventos idempotentes'])node(name).parameters.jsCode=bundle+'\n'+node(name).parameters.jsCode;
  note('LEXIA | CONFIGURAR ANTES DO TESTE',`## Omnichannel original da Miranda adaptado ao CRM\nBase: os 148 nodes enviados. Midia, prompt do cerebro e contrato antigo permanecem reconheciveis. Os nodes cinza na faixa inferior sao ramos legados substituidos; nao executam.\n\n1. Selecione as credenciais nativas Supabase central, Postgres central (schema Lote 2), Redis, OpenAI e Gemini.\n2. Em Config Cliente Lexia: environment, cliente_slug, UUID das contas e frappe_url. As contas e o prompt devem existir no central. Nenhum fallback entre empresas.\n3. Selecione o cerebro em Chamar Cerebro do Cliente. Para teste, use copia com tools isoladas. Somente depois marque cerebro_teste_revisado. Este arquivo NAO torna as tools do cerebro original seguras.\n4. Credenciais HTTP: Z-API Custom Auth (Client-Token); Meta Header Auth (Authorization Bearer); Frappe Header Auth. Segredos ficam nas credenciais.\n5. As URLs de webhook sao novas; a importacao nao substitui o original. Envio real inicia desligado e o gate central tambem exige delivery_owner=v2/delivery_mode=deliver.\n\nValidacao local e estrutural; execucao em seu n8n e formato das respostas de cada node ainda precisam de teste.`,-7050,-120,1250,680);
  note('LEXIA | PAUSAS E COMPATIBILIDADE',`## Estado duravel + controles antigos\nToda mensagem valida e individual e gravada antes das pausas e da midia. Intervencao cria bloqueio proprio no central; evento atrasado nao encurta o prazo. CRM controla bloqueios no central. Leitura adicional das antigas chaves pausa_manual/status/pausa_eterna conserva as pausas dos cinco workflows originais.\n\nRetomada padrao: proxima mensagem. answer_pending e recuperacao de lotes orfaos continuam dependendo do consumidor de expiracao do Lote 2; este JSON nao inclui um varredor.\n\nAgendamento nao e inferido de texto. Cerebro/tools/follow-ups/lembretes originais ainda podem alterar estado ou enviar fora deste gate e precisam de adaptacao propria. A ponte legada bloqueia confirmacoes se a tool antiga criou pausa_eterna.`,-1500,-120,1200,560);
  note('LEXIA | ENTREGA E CRM',`## Uma bolha por vez\nEspera antes do gate. Le bloqueios/versao/lead_seq e reivindica um action_id antes de cada chamada. Respostas antigas sao suprimidas. Timeout, excecao, status ambiguo ou resposta sem ID tornam delivery_unknown; nenhuma repeticao automatica.\n\nO CRM recebe eventos versionados de conversa, mensagens, bloqueios e resultado de entrega. Lead/Deal sao tratados pelo receptor Frappe lexia_crm.api.ingest_event. Repetir evento de entrada permite reespelhar o historico sem repetir o cerebro. Recuperacao automatica do espelho ainda depende de um consumidor de outbox.\n\nEventos das tools, follow-ups, lembretes, presenca e cancelamento exigem os respectivos workflows/consumidor CRM adaptados. Apenas importar este omnichannel nao integra todos os seis fluxos.\n\nMeta: envio usa Header Auth; ingresso autenticado por Header Auth requer adaptador que confira assinatura Meta. Esta copia nao implementa sozinha a assinatura HMAC do webhook Meta nem sua verificacao GET.`,9400,-120,1250,650);
  node('Webhook Meta Omnichannel1').disabled=true;delete w.connections['Webhook Meta Omnichannel1'];node('Respond to Webhook').disabled=true;
  note('LEXIA | RAMOS LEGADOS SUBSTITUIDOS','## Referencia visual do original\nRegistro depois do buffer, retomada apagando mensagem, pausa compartilhada e follow-up rapido sem gate foram substituidos no tronco ativo. Os nomes dos nodes foram mantidos para comparacao. Estes nodes cinza nao recebem execucao.',-100,3200,2900,250);
  note('LEXIA | VERIFICACAO LOCAL',`## Resultado desta entrega\n14 testes especificos deste export: passaram. Suite local Lote 2: 193 passaram. ESLint do gerador e testes: sem erros.\n\nNao foi executado nenhum node no seu n8n. Nao houve chamada de modelo, acesso a servico, SQL, importacao ou publicacao. Parametros/credenciais e respostas reais dos nodes ainda precisam de validacao na sua instalacao.\n\nEste e o omnichannel baseado no original, nao uma simulacao de resposta. As dependencias reais precisam ser configuradas nas credenciais e no Set Config Cliente Lexia antes do teste. O cerebro nao esta preselecionado e o envio real esta desligado.`,-5400,-120,1200,520);
  return organizeMirandaCanvas(w);
}

export function auditWorkflow(w) {
  if(w.active!==false)throw new Error('workflow_must_import_inactive');
  const names=new Set(w.nodes.map(n=>n.name));
  if(names.size!==w.nodes.length)throw new Error('duplicate_node_name');
  for(const [from,links] of Object.entries(w.connections)){
    if(!names.has(from))throw new Error('unknown_source:'+from);
    for(const outputs of Object.values(links))for(const output of outputs)for(const link of output)if(!names.has(link.node))throw new Error('unknown_target:'+link.node);
  }
  const raw=JSON.stringify(w);
  if(/eyJ[A-Za-z0-9_.-]{30,}|sk-[A-Za-z0-9_-]{16,}|IGAA[A-Za-z0-9]{20,}|\$env\./.test(raw))throw new Error('secret_or_environment_reference_in_export');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  for(const n of w.nodes)if(n.type==='n8n-nodes-base.code'){
    try{new AsyncFunction('$input','$json','$','$execution','$now',n.parameters.jsCode);}catch(e){throw new Error('code_syntax:'+n.name+':'+e.message);}
  }
  const checkExpressions=(value,name)=>{
    if(typeof value==='string'&&value.startsWith('={{')&&value.trim().endsWith('}}')){
      try{new AsyncFunction('return ('+value.trim().slice(3,-2)+');');}catch(e){throw new Error('expression_syntax:'+name+':'+e.message);}
    }else if(Array.isArray(value))value.forEach(v=>checkExpressions(v,name));
    else if(value&&typeof value==='object')Object.values(value).forEach(v=>checkExpressions(v,name));
  };
  for(const n of w.nodes)if(!n.disabled)checkExpressions(n.parameters,n.name);
  return {nodes:w.nodes.length,originalNames:w.nodes.filter(n=>n.id===uuid('original:'+n.name)).length,disabled:w.nodes.filter(n=>n.disabled).length};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const sourcePath=process.argv[2];const outputPath=process.argv[3];
  if(!sourcePath||!outputPath)throw new Error('usage: node scripts/build-miranda-original-crm.mjs <original.json> <output.json>');
  const original=JSON.parse(readFileSync(sourcePath,'utf8'));
  const w=buildMirandaOriginal(original);const result=auditWorkflow(w);
  mkdirSync(dirname(resolve(outputPath)),{recursive:true});writeFileSync(outputPath,JSON.stringify(w,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(result)+'\n');
}

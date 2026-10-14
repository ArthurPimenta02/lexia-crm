import { readFileSync,writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
const e=parseEnv(readFileSync('.env.lote2.test.local','utf8'));
if(e.LEXIA_LOTE2_FRAPPE_EXPECTED_SITE!=='crm-hml.localhost'||e.LEXIA_LOTE2_FRAPPE_URL!=='http://crm-hml.localhost:18080')throw Error('hml_only');
const root=e.LEXIA_LOTE2_FRAPPE_URL+'/api/method/lexia_crm.api.';
const headers={Authorization:'token '+e.LEXIA_LOTE2_FRAPPE_OPERATOR_API_KEY+':'+e.LEXIA_LOTE2_FRAPPE_OPERATOR_API_SECRET,'Content-Type':'application/json'};
async function call(method,body) {
  const url=root+method;
  const r=await fetch(url,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const json=await r.json();
  if(!r.ok){writeFileSync('/tmp/lexia-hml-crm-test-error.json',JSON.stringify(json),{mode:0o600});throw Error('crm_http_'+r.status);}
  return json.message;
}
const burst=process.argv[2]==='--burst';
const conversation=burst?undefined:process.argv[2]||undefined;
const message=process.argv[3]||'Ola, gostaria de saber o valor de uma avaliacao de pele.';
const request_id=randomUUID();
const result=await call('test_chat_send',{message,conversation,request_id,channel:'WhatsApp'});
const name=result.conversation?.name||result.conversation;
console.log(JSON.stringify({accepted:true,conversation:name,request_id,shape:Object.keys(result)}));
if(typeof name!=='string'||!name.startsWith('SYNTH-LEXIA-TEST-CHAT-'))throw Error('synthetic_conversation_required');
if(burst)await call('test_chat_send',{message:'Tenho manchas no rosto e prefiro atendimento em portugues.',conversation:name,request_id:randomUUID(),channel:'WhatsApp'});
const until=Date.now()+180000;
let completed=false;
while(Date.now()<until) {
  await new Promise(r=>setTimeout(r,3000));
  const state=await call('test_chat_state?conversation='+encodeURIComponent(name));
  const run=state.run||{};
  if(['Concluído','Falhou','Configuração ausente'].includes(run.status)) {
    if(run.status==='Concluído'&&state.conversation?.pending_count>0)continue;
    completed=true;
    writeFileSync('/tmp/lexia-central-crm-last-test.json',JSON.stringify({request_id,conversation:name,state},null,2),{mode:0o600});
    const assistant_messages=state.messages?.filter(m=>m.author_type==='IA').map(m=>({text:m.content,status:m.delivery_status}));
    console.log(JSON.stringify({conversation:name,run,assistant_messages}));
    if(run.status!=='Concluído'||!assistant_messages?.length)process.exitCode=1;
    break;
  }
}
if(!completed)throw Error('crm_test_poll_timeout_no_automatic_resend');

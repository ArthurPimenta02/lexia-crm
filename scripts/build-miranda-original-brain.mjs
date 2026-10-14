import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { bundleForN8n } from './lib/n8n-code-bundle.mjs';
import { referenceFingerprint } from './lib/reference-denylist.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const id=name=>createHash('sha256').update('miranda-original-brain:'+name).digest('hex').slice(0,32);
const script=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
const hash=value=>createHash('sha256').update(value).digest('hex');
const privacyPrompt=text=>String(text).replace(/Arthur Pimenta/g,'Cliente Ficticio').replace(/Arthur 41 99512-0566/g,'Cliente 00 00000-0000').replace(/41 995120566/g,'00 000000000').replace(/https?:\/\/[^\s)"<>]+/g,'https://asset-placeholder.invalid');
const originalNames=['When Executed by Another Workflow','OpenAI Chat Model','Validar Saída Cérebro','Especialista em Serviços','OpenAI Chat Model1','Preparar Entrada','Rotear por Assunto','Agente Indefinido','Preparar Briefing','Redator — Voz do Cliente','Montar Saída Final','consultar_servicos','Orquestrador de Atendimento','consultar_promocoes','consultar_info_clinica','Orquestrador de Agendamento','consultar-servicos','verificar_disponibilidade','criar_agendamento','Anthropic Chat Model','Preparar Handoff','Notificar Equipe?','Notificar Samuel (uazapi)','Pausar Bot?','Pausar Conversa','Devolver Saída Cérebro','consultar_info_clinica1','Anthropic Chat Model1','Buscar Playbook de Vendas (Cérebro)','Anexar Playbook ao Contexto'];
const notes=`\n\n## CONTINUIDADE LEXIA CRM (prevalece somente nas fronteiras operacionais)\nO atendimento comercial acima e preservado. Leia todo o historico e a memoria desta conversa, sem reiniciar por mudanca de idioma. Mensagens da equipe prevalecem sobre resumos antigos; nao comprovam por si so um novo efeito em Google Agenda. O idioma resolvido pela entrada e obrigatorio para os baloes finais; briefing interno pode continuar em portugues. Nunca se reapresente se a apresentacao ja foi entregue, inclusive ao trocar idioma. Perguntas respondidas e fatos ja enviados nao se repetem, salvo pedido explicito ou recapitulativo necessario. Frases curtas, uma pergunta por vez.\nNao envia, pausa, resolve handoff ou agenda follow-up por conta propria: proponha ao Omnichannel. Retorno combinado e uma proposta, nao prometa que esta agendado sem confirmacao do workflow separado. Somente resultado real da tool revisada autoriza agendamento novo; texto, emoji ou assinatura visual nao comprovam criacao. Na ausencia de agenda autorizada, nao invente disponibilidade nem confirme nada. Handoff e proposta de estado, sem prazo prometido.\n`;

export function buildBrain(source) {
  if(source.nodes?.length!==30||originalNames.some(name=>!source.nodes.some(n=>n.name===name)))throw new Error('expected_original_thirty_brain_nodes');
  const w={name:'MIRANDA - CEREBRO - LEXIA CRM (BASE ORIGINAL / TESTE ISOLADO)',active:false,nodes:[],connections:JSON.parse(JSON.stringify(source.connections)),settings:{executionOrder:'v1',callerPolicy:'workflowsFromSameOwner',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},pinData:{}};
  const provenance=[];
  for(const raw of source.nodes) {
    const n={id:id(raw.name),name:raw.name,type:raw.type,typeVersion:raw.typeVersion,parameters:JSON.parse(JSON.stringify(raw.parameters)),position:[0,0]};
    if(raw.parameters.jsCode) {provenance.push({name:raw.name,source_sha256:hash(raw.parameters.jsCode)});n.parameters.jsCode=script(raw.parameters.jsCode);}
    if(n.parameters.options?.systemMessage) {
      provenance.push({name:raw.name,source_prompt_sha256:hash(raw.parameters.options.systemMessage)});
      n.parameters.options.systemMessage=privacyPrompt(n.parameters.options.systemMessage)+notes;
    }
    if(n.type.includes('lmChatOpenAi'))n.credentials={openAiApi:{name:'LEXIA - OpenAI Cerebro HML'}};
    if(n.type.includes('lmChatAnthropic'))n.credentials={anthropicApi:{name:'LEXIA - Anthropic Cerebro HML'}};
    if(n.type.startsWith('n8n-nodes-base.supabase'))n.credentials={supabaseApi:{name:'LEXIA - Supabase Privado Cerebro Miranda HML'}};
    if(n.type==='@n8n/n8n-nodes-langchain.agent') {n.parameters.options.returnIntermediateSteps=true;n.parameters.hasOutputParser=false;}
    if(n.type==='@n8n/n8n-nodes-langchain.toolWorkflow') {
      const cfg="$('Config Cerebro Lexia').first().json";
      n.parameters.workflowId={__rl:true,mode:'id',value:`={{ ${cfg}.${n.name==='criar_agendamento'?'create_appointment_workflow_ref':'availability_workflow_ref'} }}`};
      const map=n.parameters.workflowInputs;
      for(const key of ['uazapi_base_url','uazapi_token','numero_equipe'])delete map.value[key];
      map.schema=map.schema.filter(f=>!['uazapi_base_url','uazapi_token','numero_equipe'].includes(f.id));
      if(n.name==='criar_agendamento')map.value.idioma="={{ $('Preparar Entrada').first().json.contexto.dados.idioma }}";
      const op=n.name==='criar_agendamento'?'appointment.create':'availability.check';
      map.value.lexia_call_context=`={{ {...$('Preparar Entrada').first().json._lexia.tool_context,operation:'${op}'} }}`;
      n.parameters.description+='\nCONTRATO CRM: leia o status comercial em data.status (OK/CRIADO/CONFLITO/JA_AGENDADO etc.), nao no status externo succeeded/failed/unknown. O envelope traz proveniencia. unknown exige reconciliacao, sem repetir criacao. Para criar, o recapitulativo entregue precisa conter servico, profissional, dd/MM, h:mm AM/PM, nome e telefone, seguido do OK explicito do lead.';
      map.schema.push({id:'lexia_call_context',displayName:'lexia_call_context',type:'object',required:true,display:true});
      n.retryOnFail=false;
    }
    if(n.name==='consultar-servicos')delete n.parameters.orderBy;
    w.nodes.push(n);
  }
  const find=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw new Error('missing_node:'+name);return n;};
  const core=bundleForN8n(resolve(ROOT,'scripts/lib/miranda-original-brain-runtime.mjs'),'Brain');
  const add=(name,type,parameters,position,version=2)=>{const n={id:id(name),name,type,typeVersion:version,parameters,position};w.nodes.push(n);return n;};
  const code=(name,text,pos)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode:core+'\n'+text},pos);
  const route=(name,outputs)=>{w.connections[name]={main:outputs.map(names=>names.map(node=>({node,type:'main',index:0})))};};
  const iff=(name,expr,pos)=>add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:id(name),leftValue:'={{ '+expr+' }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},pos,2.2);
  const rows="$input.all().map(i=>i.json).filter(r=>Object.keys(r).length)";
  const context="$('LEXIA | Resultado e tools atestadas').first().json";
  const memory="$('LEXIA | Entrada e memoria isoladas').first().json";
  const ref="$('LEXIA | Gravar memoria privada').first().json";
  const native=(name,parameters,pos)=>{const n=add(name,'n8n-nodes-base.supabase',{resource:'row',...parameters},pos,1);n.credentials={supabaseApi:{name:'LEXIA - Supabase Privado Cerebro Miranda HML'}};n.alwaysOutputData=true;n.retryOnFail=false;return n;};
  const protectedTools=source.nodes.filter(n=>n.type==='@n8n/n8n-nodes-langchain.toolWorkflow').map(n=>{
    const value=n.parameters.workflowId.value;if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(value))throw Error('original_tool_identity_missing');return referenceFingerprint(value);
  });
  const config={environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:'24000000-0000-4000-8000-000000000001',private_project_ref:'',models_reviewed:false,private_data_reviewed:false,calendar_tools_reviewed:false,protected_tool_fingerprints:protectedTools,availability_workflow_ref:'',create_appointment_workflow_ref:''};
  add('Config Cerebro Lexia','n8n-nodes-base.set',{assignments:{assignments:Object.entries(config).map(([name,value])=>({id:id(name),name,value,type:Array.isArray(value)?'array':typeof value==='boolean'?'boolean':'string'}))},includeOtherFields:false,options:{}},[260,0],3.4);
  find('When Executed by Another Workflow').parameters={inputSource:'passthrough'};
  route('When Executed by Another Workflow',[['Config Cerebro Lexia']]);
  code('LEXIA | Validar origem e limites',`return [{json:Brain.accept($('When Executed by Another Workflow').all(),$('Config Cerebro Lexia').first().json),pairedItem:{item:0}}];`,[520,0]);
  route('Config Cerebro Lexia',[['LEXIA | Validar origem e limites']]);
  native('LEXIA | Identidade do Supabase privado',{operation:'getAll',tableId:'lexia_brain_identity',returnAll:true},[780,0]);
  code('LEXIA | Identidade privada confirmada',`return [{json:Brain.privateIdentity($('LEXIA | Validar origem e limites').first().json,${rows}),pairedItem:{item:0}}];`,[1040,0]);
  native('LEXIA | Ler memoria privada',{operation:'getAll',tableId:'lexia_brain_memories',returnAll:true,filters:{conditions:[{keyName:'memory_key',condition:'eq',keyValue:"={{ $('LEXIA | Identidade privada confirmada').first().json.memory_key }}"}]}},[1300,0]);
  code('LEXIA | Entrada e memoria isoladas',`return [{json:Brain.restoreMemory($('LEXIA | Identidade privada confirmada').first().json,${rows}),pairedItem:{item:0}}];`,[1560,0]);
  iff('LEXIA | Chamada ja concluida?','$json.cached===true',[1820,0]);
  code('LEXIA | Devolver resultado idempotente',`return [{json:$json.result,pairedItem:{item:0}}];`,[2080,-850]);
  const preSteps=['LEXIA | Validar origem e limites','LEXIA | Identidade do Supabase privado','LEXIA | Identidade privada confirmada','LEXIA | Ler memoria privada','LEXIA | Entrada e memoria isoladas','LEXIA | Chamada ja concluida?'];
  for(let i=1;i<preSteps.length;i++)route(preSteps[i-1],[[preSteps[i]]]);
  route(preSteps.at(-1),[['LEXIA | Devolver resultado idempotente'],['Preparar Entrada']]);
  const originalEntry=find('Preparar Entrada').parameters.jsCode;
  find('Preparar Entrada').parameters.jsCode=core+`\nconst ctx=${memory};const values=await(async($json)=>{${originalEntry.replace('.slice(-30)','.slice(-200)')}})(ctx.payload);return values.map(v=>({json:Brain.prepareEntry(v.json,ctx),pairedItem:{item:0}}));`;
  code('LEXIA | Resultado e tools atestadas',`const c=Brain.captureTools(${memory},$input.first().json);return [{json:c,pairedItem:{item:0}}];`,[3900,0]);
  const originalBrief=find('Preparar Briefing').parameters.jsCode;
  find('Preparar Briefing').parameters.jsCode=core+`\nconst c=${context};const values=await(async($input)=>{${originalBrief}})({first:()=>({json:c.agent})});return values.map(v=>({json:Brain.briefing(v.json,c),pairedItem:{item:0}}));`;
  for(const name of ['Orquestrador de Atendimento','Orquestrador de Agendamento','Agente Indefinido'])route(name,[['LEXIA | Resultado e tools atestadas']]);
  route('LEXIA | Resultado e tools atestadas',[['Preparar Briefing']]);
  // Agenda-disabled branch uses the original scheduling intelligence, not fake slots.
  const noCalendar=JSON.parse(JSON.stringify(find('Orquestrador de Agendamento')));
  noCalendar.name='Agendamento sem agenda conectada';noCalendar.id=id(noCalendar.name);noCalendar.position=[3380,680];
  noCalendar.parameters.options.systemMessage+='\nAGENDA DESABILITADA NESTE TESTE: voce tem somente consultar-servicos e consultar_info_clinica1. As tools de agenda acima NAO estao conectadas. Nao ofereca horario, confirme disponibilidade nem diga que criou uma reserva. Pode responder duvida de servico e coletar preferencia. Informe com naturalidade que a equipe precisa confirmar a disponibilidade; handoff se necessario. Nunca invente resultado de tool.';
  w.nodes.push(noCalendar);route(noCalendar.name,[['LEXIA | Resultado e tools atestadas']]);
  iff('LEXIA | Agenda de teste autorizada?',`${memory}.cfg.calendar_tools_reviewed===true && ${memory}.payload.operacao.tools_permitidas===true && ${memory}.payload.operacao.calendar_access==='isolated_test'`,[3120,360]);
  route('Rotear por Assunto',[['Orquestrador de Atendimento'],['Orquestrador de Atendimento'],['LEXIA | Agenda de teste autorizada?'],['Agente Indefinido']]);
  route('LEXIA | Agenda de teste autorizada?',[['Orquestrador de Agendamento'],[noCalendar.name]]);
  for(const n of ['Anthropic Chat Model','consultar-servicos','consultar_info_clinica1']) {
    const type=n==='Anthropic Chat Model'?'ai_languageModel':'ai_tool';
    w.connections[n][type][0].push({node:noCalendar.name,type,index:0});
  }
  for(const name of ['Orquestrador de Atendimento','Orquestrador de Agendamento'])find(name).parameters.text+='\n\nContinuidade obrigatoria: {{ $json.contexto.dados.idioma }}; apresentacao ja entregue: {{ $json.contexto.dados.apresentacao_ja_enviada }}. Use o historico completo e a memoria, sem reiniciar o atendimento.';
  find('Redator — Voz do Cliente').parameters.text='=IDIOMA OBRIGATORIO: {{ $json.idioma }}\nMensagem atual: {{ $json.mensagem_actual }}\nHistorico completo com autoria (EQUIPE nao e CAROL):\n{{ ($json.historico || []).map(m => ({cliente:"CLIENTE",agente_ia:"CAROL",equipe_humana:"EQUIPE"}[m.autor] || "SISTEMA")+": "+m.conteudo).join("\\n") }}\nBriefing interno: {{ JSON.stringify($json.briefing) }}\nPreserve o pedido anterior. Mudanca de idioma nao reinicia a conversa. Todos os baloes finais saem no idioma obrigatorio. Nao repita apresentacao/pergunta/fatos, nem prometa um efeito nao confirmado.';
  let final=find('Montar Saída Final').parameters.jsCode;
  const templateStart=final.indexOf('function templateEhConfirmacaoReal('),templateEnd=final.indexOf('const mensagemTemplateBruto',templateStart);
  if(templateStart<0||templateEnd<0)throw new Error('original_template_guard_missing');
  final=final.slice(0,templateStart)+`function templateEhConfirmacaoReal(valor){return (briefing._lexia_templates||[]).includes(String(valor||'').trim());}\n`+final.slice(templateEnd);
  final=final.replace("const jaFalamosAntes = (pacote.historico || []).some", "const jaFalamosAntes = $('Preparar Entrada').first().json.contexto.dados.apresentacao_ja_enviada === true || (pacote.historico || []).some");
  for(const text of ['Um momento, por favor — vou confirmar esse valor com a equipa e já retorno.','Um momento, por favor — vou confirmar essa informação e já retorno.'])final=final.replace(JSON.stringify(text),`Brain.fallback(pacote.idioma)`).replace("'"+text+"'",`Brain.fallback(pacote.idioma)`);
  find('Montar Saída Final').parameters.jsCode=core+'\n'+final;
  code('LEXIA | Validar continuidade e efeitos',`return [{json:Brain.finalize($input.first().json,${context},$('Preparar Briefing').first().json,$now.toISO()),pairedItem:{item:0}}];`,[5460,0]);
  route('Validar Saída Cérebro',[['LEXIA | Validar continuidade e efeitos']]);
  route('LEXIA | Validar continuidade e efeitos',[['Preparar Handoff']]);
  find('Preparar Handoff').parameters.jsCode="return [{json:{enviar:'nao',pausar:'nao',delegated_to:'omnichannel'},pairedItem:{item:0}}];";
  for(const name of ['Notificar Samuel (uazapi)','Pausar Conversa']) {
    const n=find(name);n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={mode:'runOnceForAllItems',jsCode:"return [{json:{...$json,delegated_to:'omnichannel'},pairedItem:{item:0}}];"};delete n.credentials;
    n.notes='Nome original preservado. Efeito direto removido: notificacao/pausa sao responsabilidade do Omnichannel e do workflow separado.';
  }
  find('Devolver Saída Cérebro').parameters.jsCode="return $('LEXIA | Validar continuidade e efeitos').all();";
  code('LEXIA | Gravar memoria privada',`const ctx=${context};const result=$input.first().json;return [{json:{ctx,expected:Brain.memoryWrite(ctx,result,$now.toISO())},pairedItem:{item:0}}];`,[6760,0]);
  iff('LEXIA | Memoria existente?','$json.ctx.memory!==null',[7020,0]);
  const fields=['memory_key','scope_json','context_json','version','last_invocation_id','last_request_identity','cached_result','updated_at'];
  const values={dataToSend:'defineBelow',fieldsUi:{fieldValues:fields.map(field=>({fieldId:field,fieldValue:`={{ ${ref}.expected.${field} }}`}))}};
  native('LEXIA | Criar memoria privada',{operation:'create',tableId:'lexia_brain_memories',...values},[7280,280]);
  native('LEXIA | Atualizar memoria por versao',{operation:'update',tableId:'lexia_brain_memories',matchType:'allFilters',filters:{conditions:[{keyName:'memory_key',condition:'eq',keyValue:`={{ ${ref}.expected.memory_key }}`},{keyName:'version',condition:'eq',keyValue:`={{ ${ref}.ctx.memory.version }}`}]},...values},[7280,-240]);
  code('LEXIA | Devolver contrato ao Omnichannel',`const p=${ref};return [{json:Brain.memoryCommitted(p.ctx,p.expected,${rows}),pairedItem:{item:0}}];`,[7540,0]);
  route('Devolver Saída Cérebro',[['LEXIA | Gravar memoria privada']]);route('LEXIA | Gravar memoria privada',[['LEXIA | Memoria existente?']]);
  route('LEXIA | Memoria existente?',[['LEXIA | Atualizar memoria por versao'],['LEXIA | Criar memoria privada']]);
  route('LEXIA | Atualizar memoria por versao',[['LEXIA | Devolver contrato ao Omnichannel']]);route('LEXIA | Criar memoria privada',[['LEXIA | Devolver contrato ao Omnichannel']]);
  const positions={'When Executed by Another Workflow':[0,0],'Preparar Entrada':[2080,0],'Buscar Playbook de Vendas (Cérebro)':[2340,0],'Anexar Playbook ao Contexto':[2600,0],'Rotear por Assunto':[2860,0],'Orquestrador de Atendimento':[3380,-950],'Orquestrador de Agendamento':[3380,360],'Agente Indefinido':[3380,-400],'Especialista em Serviços':[3120,-1500],'OpenAI Chat Model1':[2860,-1500],'consultar_servicos':[2600,-1900],'consultar_promocoes':[2860,-1900],'consultar_info_clinica':[3120,-1900],'OpenAI Chat Model':[3380,-150],'Anthropic Chat Model':[3120,-700],'consultar-servicos':[2600,1060],'consultar_info_clinica1':[2860,1060],'verificar_disponibilidade':[3120,1060],'criar_agendamento':[3380,1060],'Preparar Briefing':[4160,0],'Redator — Voz do Cliente':[4420,0],'Anthropic Chat Model1':[4420,300],'Montar Saída Final':[4680,0],'Validar Saída Cérebro':[4940,0],'Preparar Handoff':[5720,0],'Notificar Equipe?':[5980,0],'Notificar Samuel (uazapi)':[5980,-300],'Pausar Bot?':[6240,0],'Pausar Conversa':[6240,-300],'Devolver Saída Cérebro':[6500,0]};
  for(const [name,pos]of Object.entries(positions))find(name).position=pos;
  for(const [name,text,pos,width,height,color] of [
    ['LEIA PRIMEIRO','## Cerebro original Miranda / CRM\nINATIVO. Os 30 nomes originais foram mantidos. Nenhum envio/Redis/provedor. Configure somente modelos e Supabase PRIVADO DE TESTE, nunca as credenciais Miranda de producao. Estado/envio pertencem ao Omnichannel. Contratos provisorios; leia CEREBRO.md.',[0,-450],1800,260,4],
    ['MEMORIA E IDENTIDADE','## Memoria privada por escopo\nIdentidade descartavel antes de dados/modelos. Historico, fatos e draft privados; chamada duplicada usa resultado conhecido. Falha de memoria nao reinicia a conversa em branco. Criar exige chave unica; atualizar usa CAS de versao.',[780,400],1900,260,6],
    ['INTELIGENCIA ORIGINAL','## Regras originais preservadas\nVenda consultiva, catalogo/FAQ/promocoes, injetaveis/intercorrencias, roteiro de agendamento, variantes e recapitulativo, playbook, guardrails de preco/horarios/fotos. Agenda real so com tools isoladas revisadas; branch sem agenda NAO simula criacao.',[2860,1450],1850,270,3],
    ['CONTINUIDADE E EFEITOS','## Propostas nao sao efeitos\nIdioma pt/en/es, autoria humana, sem reapresentacao ou eco, baloes curtos sem cortar fatos. Confirmacao exige resultado real atestado; nao assinatura visual. Pausa, handoff, follow-up, lembrete e entrega sao executados pelo dono externo.',[4940,650],2100,260,4],
  ])add(name,'n8n-nodes-base.stickyNote',{content:text,width,height,color},pos,1);
  validateBrainExport(w);
  return {workflow:w,provenance};
}
export function validateBrainExport(w) {
  if(w.active!==false||Object.keys(w.pinData||{}).length)throw new Error('brain_export_must_be_inactive');
  const names=new Set(w.nodes.map(n=>n.name));
  if(names.size!==w.nodes.length)throw new Error('brain_duplicate_node_name');
  for(const [from,types]of Object.entries(w.connections)) {
    if(!names.has(from))throw new Error('brain_invalid_connection');
    for(const groups of Object.values(types))for(const edges of groups)for(const e of edges)if(!names.has(e.node))throw new Error('brain_invalid_connection');
  }
  for(const n of w.nodes) {
    if(['n8n-nodes-base.httpRequest','n8n-nodes-base.redis','n8n-nodes-base.webhook','n8n-nodes-base.scheduleTrigger'].includes(n.type))throw new Error('brain_direct_side_effect_forbidden');
    if(n.parameters.jsCode)new Function(n.parameters.jsCode);
    for(const cred of Object.values(n.credentials||{}))if(Object.keys(cred).some(k=>k!=='name'))throw new Error('brain_credential_id_forbidden');
  }
  if(/\beyJ[A-Za-z0-9_.-]{30,}|\bsk-[A-Za-z0-9_-]{16,}|\$env\.|helpers\.httpRequest/.test(JSON.stringify(w)))throw new Error('brain_export_secret_or_hidden_io');
}
export function buildReadOnlyBrain(source) {
  const result=buildBrain(source),w=result.workflow;
  w.name='MIRANDA - CEREBRO CRM - AGENDA SOMENTE LEITURA';
  const node=name=>w.nodes.find(n=>n.name===name);
  node('Config Cerebro Lexia').parameters.assignments.assignments.push({id:id('calendar_read_only'),name:'calendar_read_only',type:'boolean',value:true});
  const create=node('criar_agendamento');create.disabled=true;delete w.connections[create.name];
  create.parameters.description='DESABILITADA: esta copia so consulta disponibilidade. Nenhuma reserva, cancelamento ou remarcacao e executada.';
  node('Orquestrador de Agendamento').parameters.options.systemMessage+='\nMODO SOMENTE LEITURA: criar_agendamento NAO esta conectada. Consulte verificar_disponibilidade e apresente somente os horarios reais devolvidos. Nao confirme reserva, nao gere mensagem_template de confirmacao e nao crie handoff so porque a escrita esta desabilitada no laboratorio. Se o lead confirmar, explique brevemente no idioma dele que este teste consulta horarios mas ainda nao faz reservas.';
  validateBrainExport(w);return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('usage: build-miranda-original-brain.mjs <original-local.json> <output.json>');
  const result=buildBrain(JSON.parse(readFileSync(input,'utf8')));
  mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result.workflow,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({nodes:result.workflow.nodes.length,originalNames:originalNames.length,active:false,provenance:result.provenance})+'\n');
}

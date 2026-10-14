export function prepareNotification(row, config) {
  if(config.enabled!==true)return {ready:false,reason:'team_notifications_disabled'};
  if(!row||row.environment!==config.environment||row.cliente_slug!==config.cliente_slug||!config.account_refs.includes(row.account_ref))throw Error('team_notification_scope_mismatch');
  // Test conversations never notify real staff, even with an enabled switch.
  if(row.provider==='fake'||row.conversation_ref.startsWith('test:'))return {ready:false,reason:'virtual_team_notification',preview:row.payload};
  const destination=config.recipients?.[row.recipient_ref];
  if(!/^\+?\d{8,16}$/.test(destination||''))throw Error('configure_team_recipient');
  const handoff=row.kind==='handoff';
  if(!handoff&&row.kind!=='appointment')throw Error('unsupported_team_notification');
  const endpoint=handoff?config.zapi_endpoint:config.uazapi_endpoint;
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw Error('team_endpoint_invalid');
  if(handoff?(url.hostname!=='api.z-api.io'||!/^\/instances\/[^/]+\/token\/[^/]+\/send-text$/.test(url.pathname)):
    (!config.uazapi_hosts?.includes(url.hostname)||url.pathname!=='/send/text'))throw Error('team_endpoint_not_reviewed');
  const p=row.payload;
  const text=handoff?['LEXIA - Atendimento para a equipe',p.priority,'Motivo: '+p.reason,p.summary].join('\n'):
    ['LEXIA - Agendamento confirmado',p.display_name||'',p.service||'',p.professional||'',p.starts_at+' / '+p.ends_at,p.timezone].filter(Boolean).join('\n');
  if(text.length>6000)throw Error('team_message_limit');
  return {ready:true,id:row.id,provider:handoff?'zapi':'uazapi',url:url.href,body:handoff?{phone:destination,message:text}:{number:destination,text}};
}

export function notificationOutcome(response, provider) {
  const body=response?.body;
  const id=provider==='zapi'?body?.messageId:body?.id||body?.data?.id;
  const sent=!response?.error&&Number.isInteger(response?.statusCode)&&response.statusCode>=200&&response.statusCode<300&&typeof id==='string'&&id.trim()&&id.length<=256;
  return {status:sent?'sent':'unknown',provider_message_id:sent?id:null};
}

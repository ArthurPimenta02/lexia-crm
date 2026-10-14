import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareNotification,notificationOutcome} from '../scripts/lib/miranda-team-notifications.mjs';
const row={id:'synthetic-notice',kind:'handoff',environment:'isolated_test',cliente_slug:'empresa_sintetica_a',account_ref:'synthetic-account',conversation_ref:'synthetic-conversation',provider:'zapi',recipient_ref:'samuel',payload:{priority:'normal',reason:'Fictional reason',summary:'Fictional summary'}};
const cfg={enabled:true,environment:row.environment,cliente_slug:row.cliente_slug,account_refs:[row.account_ref],recipients:{samuel:'15550000001'},zapi_endpoint:'https://api.z-api.io/instances/synthetic/token/synthetic/send-text',uazapi_endpoint:'https://uazapi.invalid/send/text',uazapi_hosts:['uazapi.invalid']};
test('Z-API handoff and UAZAPI appointment use distinct native HTTP protocols',()=>{
  const h=prepareNotification(row,cfg);assert.equal(h.provider,'zapi');assert.equal(h.body.phone,cfg.recipients.samuel);assert.equal(h.body.number,undefined);
  const a=prepareNotification({...row,kind:'appointment',payload:{starts_at:'2026-10-12T12:00:00Z',ends_at:'2026-10-12T13:00:00Z',timezone:'America/New_York'}},cfg);
  assert.equal(a.provider,'uazapi');assert.equal(a.body.number,cfg.recipients.samuel);assert.equal(a.body.phone,undefined);
});
test('virtual conversations never notify real staff even if enabled',()=>{
  assert.equal(prepareNotification({...row,provider:'fake'},cfg).ready,false);
  assert.equal(prepareNotification({...row,conversation_ref:'test:example'},cfg).ready,false);
});
test('tenant swap, unreviewed endpoint and missing destination fail before claim',()=>{
  assert.throws(()=>prepareNotification({...row,cliente_slug:'empresa_sintetica_b'},cfg),/scope/);
  assert.throws(()=>prepareNotification(row,{...cfg,zapi_endpoint:'https://other.invalid/send-text'}),/reviewed/);
  assert.throws(()=>prepareNotification(row,{...cfg,recipients:{}}),/recipient/);
});
test('success without provider identity, timeout or exception remains unknown, not safe to retry',()=>{
  for(const r of [{error:true},{statusCode:504,body:{}},{statusCode:200,body:{success:true}}])assert.equal(notificationOutcome(r,'zapi').status,'unknown');
  assert.equal(notificationOutcome({statusCode:200,body:{messageId:'synthetic'}},'zapi').status,'sent');
});

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReadOnlyAvailability } from './build-miranda-original-calendar-tools.mjs';
import { buildReadOnlyBrain } from './build-miranda-original-brain.mjs';
import { prepareCrmAgentTest } from './build-miranda-crm-agent-test.mjs';
import { buildSharedDelivery } from './build-miranda-shared-delivery.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function buildReadOnlyPackage(availability,brain,omni) {
  const master=buildSharedDelivery(prepareCrmAgentTest(omni,{calendarReadOnly:true}));
  master.name='MIRANDA - OMNICHANNEL CRM - AGENDA SOMENTE LEITURA';
  master.nodes.find(n=>n.name==='LEXIA | Webhook Teste Frappe').parameters.path='lexia-miranda-crm-agent-test-readonly-v3';
  for(const n of master.nodes)if(n.type==='n8n-nodes-base.postgres')n.credentials={postgres:{name:'Lexia HML Central Postgres'}};
  return {
    'availability-readonly-crm.inactive.json':buildReadOnlyAvailability(availability),
    'brain-readonly-crm.inactive.json':buildReadOnlyBrain(brain).workflow,
    'omnichannel-readonly-crm.inactive.json':master,
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [availability,brain,output,personalCalendar,projectRef]=process.argv.slice(2);
  if(!availability||!brain||!output)throw Error('usage: build-miranda-calendar-readonly.mjs <original-availability.json> <original-brain.json> <output-dir>');
  const read=file=>JSON.parse(readFileSync(file,'utf8'));
  const pack=buildReadOnlyPackage(read(availability),read(brain),read(resolve(root,'n8n/miranda-original-crm/omnichannel-original-crm.inactive.json')));
  if(personalCalendar){
    if(!/^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(personalCalendar)||!/^[a-z0-9]{20}$/.test(projectRef||''))throw Error('explicit_calendar_and_hml_project_required');
    const fields=pack['availability-readonly-crm.inactive.json'].nodes.find(n=>n.name==='Config Tools Lexia').parameters.assignments.assignments;
    for(const [key,value]of Object.entries({calendar_id:personalCalendar,expected_calendar_id:personalCalendar,project_ref:projectRef,calendar_reviewed:true,allow_calendar_read:true}))fields.find(f=>f.name===key).value=value;
  }
  mkdirSync(output,{recursive:true});
  for(const [file,w]of Object.entries(pack)) {
    writeFileSync(resolve(output,file),JSON.stringify(w,null,2)+'\n',{mode:0o600});
    process.stdout.write(JSON.stringify({file,nodes:w.nodes.length,active:w.active})+'\n');
  }
}

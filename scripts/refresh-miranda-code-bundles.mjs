import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundleForN8n, replaceN8nBundles } from './lib/n8n-code-bundle.mjs';

const bundles = Object.fromEntries(Object.entries({
  LexiaSchema: 'lib/omnichannel/schema-validator.ts',
  LexiaLanguage: 'lib/omnichannel/language-policy.ts',
  Reminder: 'scripts/lib/miranda-original-reminder-runtime.mjs',
  SharedDelivery: 'scripts/lib/miranda-shared-delivery.mjs',
}).map(([name, file]) => [name, bundleForN8n(resolve(file), name)]));
for (const file of process.argv.slice(2)) {
  const workflow = JSON.parse(readFileSync(file, 'utf8'));
  let count = 0;
  for (const node of workflow.nodes) {
    if (node.type !== 'n8n-nodes-base.code' || !node.parameters.jsCode) continue;
    const updated = replaceN8nBundles(node.parameters.jsCode, bundles);
    if (updated === node.parameters.jsCode) continue;
    node.parameters.jsCode = updated;
    count++;
  }
  writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ file, refreshedNodes: count }) + '\n');
}

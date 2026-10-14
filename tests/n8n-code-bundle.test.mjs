import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { bundleForN8n, replaceN8nBundles } from '../scripts/lib/n8n-code-bundle.mjs';

test('n8n exports are callable data properties even with accessor APIs disabled', () => {
  for (const [file, name, method] of [
    ['lib/omnichannel/schema-validator.ts', 'LexiaSchema', 'assertJsonSchemaValue'],
    ['lib/omnichannel/language-policy.ts', 'LexiaLanguage', 'validateResponseLanguages'],
    ['scripts/lib/miranda-original-reminder-runtime.mjs', 'Reminder', 'validateConfig'],
    ['scripts/lib/miranda-shared-delivery.mjs', 'SharedDelivery', 'accept'],
  ]) {
    const code = bundleForN8n(file, name);
    const descriptor = runInNewContext(`Object.defineProperty=()=>{throw new Error('getter_export_forbidden')};\n${code}\nObject.getOwnPropertyDescriptor(${name},${JSON.stringify(method)})`);
    assert.equal(typeof descriptor.value, 'function', `${name}.${method}`);
    assert.equal(descriptor.get, undefined);
  }
});
test('replacing only known namespaces preserves node logic and isolates bindings', () => {
  const bundles = {
    LexiaSchema: bundleForN8n('lib/omnichannel/schema-validator.ts', 'LexiaSchema'),
    Reminder: bundleForN8n('scripts/lib/miranda-original-reminder-runtime.mjs', 'Reminder'),
  };
  const code = replaceN8nBundles('"use strict";var LexiaSchema=(()=>({}))();\nvar Reminder=(()=>({}))();\nconst preserved=12;preserved;', bundles);
  assert.equal(runInNewContext(code), 12);
  assert.match(code, /const preserved=12;preserved;$/);
  assert.equal(replaceN8nBundles(code, bundles), code);
  const nested = replaceN8nBundles('(()=>{var LexiaSchema=(()=>({}))();return typeof LexiaSchema.assertJsonSchemaValue;})();', bundles);
  assert.equal(runInNewContext(nested), 'function');
  assert.throws(() => bundleForN8n('lib/omnichannel/schema-validator.ts', 'bad-name'), /invalid_bundle_namespace/);
});
test('shared receiver copies validated JSON without structuredClone in the n8n sandbox', () => {
  const input = JSON.parse(readFileSync('contracts/omnichannel/v1/examples/shared-delivery-followup-a.json', 'utf8'));
  const config = {...input.request.scope, test_project_ref:'abcdefghijklmnopqrst', delivery_mode:'virtual'};
  const receiver = runInNewContext(bundleForN8n('scripts/lib/miranda-shared-delivery.mjs', 'SharedDelivery') + '\nSharedDelivery;', {structuredClone:undefined});
  const result = receiver.accept(input, config, '2026-10-12T16:00:00Z');
  assert.notEqual(result.request, input.request);
  assert.notEqual(result.actions[0], input.request.proposed_actions[0]);
  input.request.proposed_actions[0].content.text = 'Changed input';
  assert.notEqual(result.actions[0].content.text, 'Changed input');
});

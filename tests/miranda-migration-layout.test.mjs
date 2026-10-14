import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { executableFingerprint, layoutKind, organizeMigrationCanvas, visualReference } from '../scripts/lib/miranda-migration-layout.mjs';

const directory = 'n8n/miranda-migration-review/';
const references = JSON.parse(readFileSync('tests/fixtures/miranda-layout/production-geometry.json'));
const manifest = JSON.parse(readFileSync(directory + 'MANIFEST.json'));
const originalFingerprints = {
  // Explicit CROSS JOIN makes the ingress alias visible to the echo LEFT JOIN.
  omnichannel: 'a29ed816f031e345f7b3ea534411fef3454b00deb21904485d113daff2d00826',
  // Reviewed central-memory overlay changes storage, not agents or geometry.
  cerebro: '2a3437da1101deaf2a25b8912b135d396dfe3295733b44b8d7947c6fd02bd2da',
  followup: 'a7d9f42b6fc7582473b1bcc2ea316a9a9bc148f8f7d21245452d5f278427aa58',
  lembretes: '24ba9fac367133fdbcd1b38e799be967c42d0cea0eeafac82bd2f243c15b10b1',
  disponibilidade: '28c0a5a1fd5556e9a41c961593182f35252ac61b6a2c45a33038629992d28d7b',
  agendamentos: '434393614d473440dc7b19b6b05f1a8c930aade241da69e03d664288d6f04454',
};
const isNote = n => n.type === 'n8n-nodes-base.stickyNote';
const intersects = (a, b) => a.position[0] < b.position[0] + b.parameters.width &&
  b.position[0] < a.position[0] + a.parameters.width &&
  a.position[1] < b.position[1] + b.parameters.height && b.position[1] < a.position[1] + a.parameters.height;

for (const entry of manifest.workflows) {
  const bytes = readFileSync(directory + entry.file);
  const w = JSON.parse(bytes);
  const kind = entry.file.match(/^\d+-(.+)\.inactive\.json$/)[1];
  const reference = references.find(r => layoutKind(r) === kind);
  const anchors = new Map(reference.nodes.filter(n => !isNote(n)).map(n => [n.name, n.position]));
  test(kind + ': every surviving original node has the exact production coordinates', () => {
    const originals = w.nodes.filter(n => anchors.has(n.name));
    assert.equal(originals.length, entry.layout.preserved_original_positions);
    assert.ok(originals.length >= 7);
    for (const n of originals) assert.deepEqual(n.position, anchors.get(n.name), n.name);
  });
  test(kind + ': executable nodes, connections and settings match the reviewed baseline', () => {
    assert.equal(executableFingerprint(w), originalFingerprints[kind]);
    assert.equal(entry.layout.executable_fingerprint, originalFingerprints[kind]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  });
  test(kind + ': layout is deterministic and idempotent, with no accumulating notes', () => {
    const copy = structuredClone(w);
    organizeMigrationCanvas(copy, reference);
    assert.deepEqual(copy, w);
    organizeMigrationCanvas(copy, reference);
    assert.deepEqual(copy, w);
  });
  test(kind + ': executable nodes and section backgrounds never overlap each other', () => {
    const steps = w.nodes.filter(n => !isNote(n));
    for (let i = 0; i < steps.length; i++) for (let j = 0; j < i; j++) {
      assert.ok(Math.abs(steps[i].position[0] - steps[j].position[0]) >= 140 ||
        Math.abs(steps[i].position[1] - steps[j].position[1]) >= 160, steps[i].name + ':' + steps[j].name);
    }
    const notes = w.nodes.filter(isNote);
    for (let i = 0; i < notes.length; i++) for (let j = 0; j < i; j++) {
      assert.equal(intersects(notes[i], notes[j]), false, notes[i].name + ':' + notes[j].name);
    }
  });
  test(kind + ': added chains progress horizontally; only actual loops may go backwards', () => {
    const byName = new Map(w.nodes.map(n => [n.name, n]));
    const successors = name => (w.connections[name]?.main || []).flat().map(e => e.node);
    const canReach = (from, target, visited = new Set()) => {
      if (from === target) return true;
      if (visited.has(from)) return false;
      visited.add(from); return successors(from).some(n => canReach(n, target, visited));
    };
    const contains = (note, n) => n.position[0] >= note.position[0] && n.position[0] < note.position[0] + note.parameters.width &&
      n.position[1] >= note.position[1] && n.position[1] < note.position[1] + note.parameters.height;
    let checked = 0;
    for (const from of w.nodes.filter(n => !isNote(n) && !anchors.has(n.name))) {
      for (const name of successors(from.name)) {
        const to = byName.get(name);
        if (anchors.has(name) || !w.nodes.some(n => isNote(n) && contains(n, from) && contains(n, to))) continue;
        if (canReach(name, from.name)) continue;
        assert.ok(to.position[0] > from.position[0], from.name + ' -> ' + name); checked++;
      }
    }
    assert.ok(checked > 0);
  });
}

test('visual references contain only sanitized geometry, never raw parameters or sticky text', () => {
  const source = { name: 'verificar_disponibilidade', nodes: [
    { name: 'Node', type: 'n8n-nodes-base.code', position: [0, 0], parameters: { jsCode: 'PRIVATE' }, credentials: { api: { id: 'PRIVATE' } } },
    { name: 'Sticky Note', type: 'n8n-nodes-base.stickyNote', position: [0, 0], parameters: { content: 'PRIVATE', width: 400, height: 300 } },
  ] };
  assert.doesNotMatch(JSON.stringify(visualReference(source)), /PRIVATE|jsCode|credentials/);
  for (const ref of references) for (const n of ref.nodes) {
    assert.deepEqual(Object.keys(n).sort(), isNote(n) ? ['name', 'parameters', 'position', 'type'] : ['name', 'position', 'type']);
    if (isNote(n)) assert.deepEqual(Object.keys(n.parameters).sort(), ['color', 'content', 'height', 'width']);
  }
});

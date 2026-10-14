import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { organizeMirandaCanvas } from '../scripts/lib/miranda-original-layout.mjs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/miranda-original-crm/omnichannel-original-crm.inactive.json', import.meta.url)));
const isNote = node => node.type === 'n8n-nodes-base.stickyNote';
const operational = value => ({ ...value, nodes: value.nodes.filter(node => !isNote(node)).map(node => {
  const copy = { ...node };
  delete copy.position;
  return copy;
}) });

test('layout changes neither behavior nor connections, even from arbitrary positions', () => {
  const copy = structuredClone(workflow);
  for (const node of copy.nodes) node.position = [0, 0];
  organizeMirandaCanvas(copy);
  assert.deepEqual(operational(copy), operational(workflow));
  assert.deepEqual(copy, workflow);
  assert.deepEqual(organizeMirandaCanvas(structuredClone(copy)), copy);
});

test('all executable nodes have room for icon and label', () => {
  const nodes = workflow.nodes.filter(node => !isNote(node));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const [x, y] = nodes[i].position;
    const [otherX, otherY] = nodes[j].position;
    assert.ok(Math.abs(x - otherX) >= 190 || Math.abs(y - otherY) >= 190, `${nodes[i].name} overlaps ${nodes[j].name}`);
  }
});

test('section backgrounds and instruction notes do not overlap', () => {
  const notes = workflow.nodes.filter(isNote);
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j];
    const overlap = a.position[0] < b.position[0] + b.parameters.width && a.position[0] + a.parameters.width > b.position[0]
      && a.position[1] < b.position[1] + b.parameters.height && a.position[1] + a.parameters.height > b.position[1];
    assert.equal(overlap, false, `${a.name} overlaps ${b.name}`);
  }
});

test('media lanes run left to right and legacy nodes stay below active stages', () => {
  const node = name => workflow.nodes.find(item => item.name === name);
  for (const row of [['Audio', 'HTTP Request5', 'Transcribe a recording'], ['Imagem', 'HTTP Request7', 'Analyze image'], ['PDF', 'HTTP Request9', 'Extract from File'], ['Imagem1', 'HTTP Request11', 'Analyze video']]) {
    row.forEach((name, index) => {
      assert.equal(node(name).position[1], node(row[0]).position[1]);
      if (index) assert.ok(node(name).position[0] > node(row[index - 1]).position[0]);
    });
  }
  for (const item of workflow.nodes.filter(item => item.disabled && !isNote(item))) assert.ok(item.position[1] >= 3400);
});

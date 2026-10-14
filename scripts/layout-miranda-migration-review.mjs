import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditMigration } from './build-miranda-migration-review.mjs';
import { organizeMigrationCanvas, executableFingerprint, layoutKind } from './lib/miranda-migration-layout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(root, 'n8n/miranda-migration-review');
const referenceFile = 'tests/fixtures/miranda-layout/production-geometry.json';
const references = JSON.parse(readFileSync(resolve(root, referenceFile), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(folder, 'MANIFEST.json'), 'utf8'));
const results = [];
// Validate every result before writing any file. This operation never calls
// builders, SQL generation, services or remote workflows.
for (const entry of manifest.workflows) {
  const w = JSON.parse(readFileSync(resolve(folder, entry.file), 'utf8'));
  const kind = entry.file.match(/^\d+-(.+)\.inactive\.json$/)[1];
  const reference = references.find(r => layoutKind(r) === kind);
  if (!reference) throw Error('layout_reference_missing:' + entry.file);
  const fingerprint = executableFingerprint(w);
  organizeMigrationCanvas(w, reference);
  const audit = auditMigration(w);
  const bytes = JSON.stringify(w, null, 2) + '\n';
  const originalNames = new Set(reference.nodes.filter(n => !n.type.endsWith('stickyNote')).map(n => n.name));
  results.push({ file: entry.file, bytes, entry: { ...entry, ...audit,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    layout: { preserved_original_positions: w.nodes.filter(n => originalNames.has(n.name)).length,
      executable_fingerprint: fingerprint } } });
}
for (const result of results) writeFileSync(resolve(folder, result.file), result.bytes);
manifest.workflows = results.map(r => r.entry);
manifest.layout = { status: 'original_anchors_horizontal_extensions', reference: referenceFile,
  changes: 'positions and sanitized section notes only', real_n8n_canvas_verified: false };
writeFileSync(resolve(folder, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify(results.map(r => ({ file: r.file, ...r.entry.layout })), null, 2) + '\n');

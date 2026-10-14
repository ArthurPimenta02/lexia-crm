import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const output = process.argv[2];
if (!output) throw Error('usage: preview-miranda-layout.mjs <local-preview-directory>');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
try {
  for (const file of readdirSync('n8n/miranda-migration-review').filter(f => f.endsWith('.inactive.json'))) {
    const w = JSON.parse(readFileSync('n8n/miranda-migration-review/' + file));
    const nodes = w.nodes.filter(n => !n.type.endsWith('stickyNote'));
    const notes = w.nodes.filter(n => n.type.endsWith('stickyNote'));
    const byName = new Map(nodes.map(n => [n.name, n]));
    const x = Math.min(...w.nodes.map(n => n.position[0])) - 80;
    const y = Math.min(...w.nodes.map(n => n.position[1])) - 80;
    const width = Math.max(...w.nodes.map(n => n.position[0] + (n.parameters.width || 200))) - x + 80;
    const height = Math.max(...w.nodes.map(n => n.position[1] + (n.parameters.height || 200))) - y + 80;
    const colors = { 3: '#435c50', 4: '#255442', 5: '#655020', 6: '#442d63' };
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#191b1d"/>`;
    for (const n of notes) {
      svg += `<rect x="${n.position[0]}" y="${n.position[1]}" width="${n.parameters.width}" height="${n.parameters.height}" fill="${colors[n.parameters.color] || '#31475a'}" fill-opacity="0.65"/>`;
      const title = n.parameters.content.replace(/^## /, '');
      const chunks = [''];
      for (const word of title.split(/\s+/)) {
        if ((chunks.at(-1).length + word.length) * 9 > n.parameters.width - 24 && chunks.at(-1)) chunks.push('');
        chunks[chunks.length - 1] += (chunks.at(-1) ? ' ' : '') + word;
      }
      chunks.forEach((part, i) => { svg += `<text x="${n.position[0] + 12}" y="${n.position[1] + 22 + i * 22}" fill="#f2f4f6" font-size="16" font-family="Arial">${escape(part)}</text>`; });
    }
    for (const [from, types] of Object.entries(w.connections)) {
      const a = byName.get(from); if (!a) continue;
      for (const [type, groups] of Object.entries(types)) for (const edges of groups) for (const edge of edges) {
        const b = byName.get(edge.node); if (!b) continue;
        const [ax, ay] = [a.position[0] + 72, a.position[1] + 36];
        const [bx, by] = [b.position[0], b.position[1] + 36];
        const bend = Math.max(80, Math.abs(bx - ax) * 0.45);
        svg += `<path d="M${ax},${ay} C${ax + bend},${ay} ${bx - bend},${by} ${bx},${by}" fill="none" stroke="${type === 'main' ? '#a6b0b8' : '#937cbb'}" stroke-width="1.5" opacity="0.7"/>`;
      }
    }
    for (const n of nodes) {
      const label = n.name.replace(/^(LEXIA|ENTREGA|ESTADO|CRM|OPERACAO|EQUIPE|CANCELAR|MANUTENCAO) \| /, '');
      const words = label.split(' '), lines = [''];
      for (const word of words) {
        if (lines.at(-1).length + word.length > 22 && lines.at(-1)) lines.push('');
        lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
      }
      svg += `<rect x="${n.position[0]}" y="${n.position[1]}" width="72" height="72" rx="4" fill="#303639" stroke="${n.disabled ? '#747b81' : '#c4d1da'}" stroke-width="2"/>`;
      svg += `<text x="${n.position[0] + 36}" y="${n.position[1] + 40}" text-anchor="middle" fill="#b3d4dd" font-size="13" font-family="Arial">${escape(n.type.split('.').at(-1).slice(0, 10))}</text>`;
      lines.forEach((line, i) => { svg += `<text x="${n.position[0] + 36}" y="${n.position[1] + 94 + i * 15}" text-anchor="middle" fill="#eef1f4" font-size="12" font-family="Arial">${escape(line)}</text>`; });
    }
    svg += '</svg>';
    writeFileSync(resolve(output, file + '.svg'), svg);
    const scale = Math.min(1, 1960 / width);
    const page = await browser.newPage({ viewport: { width: 1960, height: Math.max(400, Math.ceil(height * scale)) }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort());
    await page.setContent(`<html><body style="margin:0;background:#191b1d">${svg.replace(`width="${width}" height="${height}"`, `width="${Math.ceil(width * scale)}" height="${Math.ceil(height * scale)}"`)}</body></html>`);
    await page.screenshot({ path: resolve(output, file + '.png'), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
process.stdout.write('Six local geometry previews rendered; not screenshots of the real n8n editor.\n');

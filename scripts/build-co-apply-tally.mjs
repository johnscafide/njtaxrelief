#!/usr/bin/env node
// Writes the "Fill out online" county tally on /co from property/data/co-application-forms.json.
// Run after adding towns to the registry. --check exits 1 when co/index.html is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const COUNTIES = ['Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland', 'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex', 'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset', 'Sussex', 'Union', 'Warren'];

export function tallyHtml(registry) {
  const counts = COUNTIES.map(() => 0);
  for (const code of Object.keys(registry.forms || {})) counts[Number(code.slice(0, 2)) - 1] += 1;
  const total = counts.reduce((a, b) => a + b, 0);
  const items = COUNTIES.map((name, i) => {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    return `          <li${counts[i] ? '' : ' class="none"'}><a href="/co/${slug}">${name}</a> <span>${counts[i]}</span></li>`;
  });
  return [
    '<details class="browse tally" data-apply-tally>',
    `      <summary>Fill out online: ${total} town${total === 1 ? '' : 's'}</summary>`,
    '      <nav aria-label="Towns you can fill out online, by county">',
    '        <ul class="countylist">',
    ...items,
    '        </ul>',
    '      </nav>',
    '    </details>'
  ].join('\n');
}

const BLOCK = /<details class="browse tally" data-apply-tally>[\s\S]*?<\/details>/;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(readFileSync(root + 'property/data/co-application-forms.json', 'utf8'));
  const file = root + 'co/index.html';
  const html = readFileSync(file, 'utf8');
  if (!BLOCK.test(html)) throw new Error('tally block missing in co/index.html');
  const next = html.replace(BLOCK, tallyHtml(registry));
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error('co/index.html tally is out of date: run node scripts/build-co-apply-tally.mjs'); process.exit(1); }
    console.log('co tally ok');
  } else {
    writeFileSync(file, next);
    console.log('co tally written');
  }
}

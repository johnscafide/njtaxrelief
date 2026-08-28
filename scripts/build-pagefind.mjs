import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as pagefind from 'pagefind';

const ROOT = process.cwd();
const STAGING = path.join(ROOT, '.pagefind-site');
const OUTPUT = path.join(ROOT, 'pagefind');
const RUNTIME_TAG = '<script defer src="/property/js/watchdog-third-party.js" data-watchdog-third-party></script>';

const exactPublic = new Set([
  'property/index.html',
  'property/pro/index.html',
  'property/tools/index.html',
  'property/faq/index.html',
  'property/data-methodology/index.html',
  'property/fairness/index.html',
  'contact/index.html'
]);

const publicPrefixes = [
  'towns/',
  'property/insights/',
  'property/plays/',
  'property/compare/'
];

const blockedFragments = [
  '/admin/', '/account/', '/analytics/', '/dashboard/', '/developer', '/diagnostics/',
  '/data-center/', '/data-workbench/', '/marketing-studio/', '/report-builder/',
  '/report-studio/', '/public-report/', '/support/', '/verification-diagnostics/',
  '/offline/', '/logs/', '/tests/'
];

function normalized(rel) {
  return rel.split(path.sep).join('/');
}

function eligible(rel) {
  const file = normalized(rel);
  const lower = `/${file.toLowerCase()}`;
  if (!file.endsWith('.html')) return false;
  if (/(^|\/)(zzz|index-old|index_1|.*-old|.*-dnu)(\/|\.|$)/i.test(file)) return false;
  if (blockedFragments.some(fragment => lower.includes(fragment))) return false;
  return exactPublic.has(file) || publicPrefixes.some(prefix => file.startsWith(prefix));
}

async function walk(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.pagefind-site' || entry.name === 'pagefind') continue;
    const rel = path.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await walk(abs, rel));
    else if (eligible(rel)) results.push(rel);
  }
  return results;
}

async function injectRuntime(file) {
  let html = await readFile(file, 'utf8');
  if (html.includes('data-watchdog-third-party')) return;
  if (!/<\/head>/i.test(html)) throw new Error(`Third-party runtime injection missing </head>: ${file}`);
  html = html.replace(/<\/head>/i, `  ${RUNTIME_TAG}\n</head>`);
  await writeFile(file, html, 'utf8');
}

await rm(STAGING, { recursive: true, force: true });
await rm(OUTPUT, { recursive: true, force: true });
await mkdir(STAGING, { recursive: true });

const files = await walk(ROOT);
if (!files.length) throw new Error('Pagefind: no eligible public HTML files found.');

for (const rel of files) {
  const source = path.join(ROOT, rel);
  await injectRuntime(source);
  const destination = path.join(STAGING, rel);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

const { index } = await pagefind.createIndex({
  rootSelector: 'body',
  excludeSelectors: ['nav', 'footer', 'script', 'style', 'form', '[data-pagefind-ignore]'],
  verbose: false
});

const indexed = await index.addDirectory({ path: STAGING });
if (indexed.errors?.length) throw new Error(`Pagefind indexing failed: ${indexed.errors.join('; ')}`);
await index.writeFiles({ outputPath: OUTPUT });
await index.deleteIndex();
await rm(STAGING, { recursive: true, force: true });

const outputStat = await stat(OUTPUT);
if (!outputStat.isDirectory()) throw new Error('Pagefind output directory was not created.');
console.log(`Pagefind indexed ${files.length} public HTML files into /pagefind and attached the optional public integration runtime.`);

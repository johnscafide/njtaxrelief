import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PROPERTY = path.join(ROOT, 'property');
const DEFAULT_OUTPUT = path.join(PROPERTY, 'developer', 'content-glossary', 'glossary.json');
const checkOnly = process.argv.includes('--check-only');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? path.resolve(ROOT, outputArg.slice('--output='.length)) : DEFAULT_OUTPUT;

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.vercel', '_pagefind', 'pagefind', 'coverage', 'dist', 'build',
]);
const EXCLUDED_PATH_PARTS = [
  '/developer/content-glossary/', '/vendor/', '/vendors/', '/third-party/', '/generated/',
];
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const JS_EXTENSIONS = new Set(['.js', '.mjs']);
const STRUCTURED_COPY_FILES = new Set([
  'property/data/county-copy.json',
  'property/data/current-update.json',
  'property/data/versions.json',
]);

const normalize = (value) => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const lineAt = (source, index) => source.slice(0, Math.max(0, index)).split('\n').length;
const repoPath = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');

function likelyHumanText(text) {
  if (!text || text.length < 3 || text.length > 800) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/)/i.test(text)) return false;
  if (/^[.#\[\]{}:;(),=+*\/\\\-_0-9A-Za-z]+$/.test(text) && !/\s/.test(text) && text.length > 32) return false;
  if (/^[A-Za-z0-9_-]+\.(js|css|html|json|svg|png|jpg|jpeg|webp|woff2?|ttf)$/i.test(text)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/i.test(text)) return false;
  if (/^(click|submit|change|input|load|resize|scroll|DOMContentLoaded|storage)$/i.test(text)) return false;
  if (/^(application|text|image)\/[a-z0-9.+-]+$/i.test(text)) return false;
  if (/^[A-Za-z0-9_-]{28,}$/.test(text)) return false;
  if (/^(eyJ|sk_|pk_|sbp_|Bearer\s)/.test(text)) return false;
  if (/(authorization|api[_-]?key|service[_-]?role|secret|password|access[_-]?token)/i.test(text) && /[:=]/.test(text)) return false;
  return true;
}

async function walk(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.') && item.name !== '.well-known') continue;
    if (item.isDirectory() && EXCLUDED_DIRS.has(item.name)) continue;
    const absolute = path.join(dir, item.name);
    const rel = `/${repoPath(absolute)}/`;
    if (EXCLUDED_PATH_PARTS.some((part) => rel.includes(part))) continue;
    if (item.isDirectory()) out.push(...await walk(absolute));
    else out.push(absolute);
  }
  return out;
}

function htmlEntries(file, source) {
  const entries = [];
  const cleaned = source
    .replace(/<!--([\s\S]*?)-->/g, (m) => ' '.repeat(m.length))
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, (m) => ' '.repeat(m.length));
  const pathName = repoPath(file);
  const textRegex = />([^<>]+)</g;
  for (const match of cleaned.matchAll(textRegex)) {
    const text = normalize(match[1]);
    if (!likelyHumanText(text)) continue;
    entries.push({
      text,
      file: pathName,
      line: lineAt(source, match.index + 1),
      owner: 'HTML',
      contentClass: 'static-copy',
      safeToEdit: 'yes',
      guidance: 'Static page copy. Edit this HTML/partial unless the surrounding element is explicitly data-bound.',
    });
  }

  const attrRegex = /\b(aria-label|placeholder|title|alt)\s*=\s*(["'])([\s\S]*?)\2/gi;
  for (const match of cleaned.matchAll(attrRegex)) {
    const text = normalize(match[3]);
    if (!likelyHumanText(text)) continue;
    entries.push({
      text,
      file: pathName,
      line: lineAt(source, match.index),
      owner: 'HTML',
      contentClass: match[1].toLowerCase() === 'aria-label' ? 'accessibility-copy' : 'attribute-copy',
      safeToEdit: 'yes',
      guidance: 'Human-facing HTML attribute. Keep accessibility meaning and UI behavior intact when editing.',
    });
  }
  return entries;
}

function jsEntries(file, source) {
  const entries = [];
  const pathName = repoPath(file);
  const stringRegex = /(['"])((?:\\.|(?!\1)[^\\\r\n]){3,})\1/g;
  for (const match of source.matchAll(stringRegex)) {
    let text;
    try {
      text = normalize(match[2].replace(/\\n/g, ' ').replace(/\\(['"\\])/g, '$1'));
    } catch {
      continue;
    }
    if (!likelyHumanText(text)) continue;
    const context = source.slice(Math.max(0, match.index - 100), Math.min(source.length, match.index + match[0].length + 100));
    if (/(querySelector|getElementById|classList|dataset|localStorage|sessionStorage|addEventListener|fetch\s*\()/i.test(context) && !/[.!?]|\s{2,}/.test(text) && text.split(' ').length < 3) continue;
    entries.push({
      text,
      file: pathName,
      line: lineAt(source, match.index),
      owner: 'JS',
      contentClass: 'runtime-string',
      safeToEdit: 'caution',
      guidance: 'Runtime/shared/state copy. Check the surrounding behavior before editing; static marketing/editorial copy should move to HTML or CMS.',
    });
  }
  return entries;
}

function jsonEntries(file, source) {
  const entries = [];
  const pathName = repoPath(file);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Content glossary could not parse structured copy file ${pathName}: ${error.message}`);
  }

  const visit = (value, pointer = '$') => {
    if (typeof value === 'string') {
      const text = normalize(value);
      if (!likelyHumanText(text)) return;
      const encoded = JSON.stringify(value);
      const index = source.indexOf(encoded);
      entries.push({
        text,
        file: pathName,
        line: index >= 0 ? lineAt(source, index) : null,
        owner: 'DATA',
        contentClass: 'structured-copy',
        safeToEdit: 'caution',
        guidance: `Repo-backed structured copy at ${pointer}. Edit the JSON source while preserving its schema, evidence notes and consuming runtime contract.`,
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => visit(item, `${pointer}.${key}`));
    }
  };

  visit(parsed);
  return entries;
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.file}\u0000${entry.line}\u0000${entry.owner}\u0000${entry.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const allFiles = await walk(PROPERTY);
const sourceFiles = allFiles.filter((file) => {
  const ext = path.extname(file).toLowerCase();
  const relative = repoPath(file);
  if (HTML_EXTENSIONS.has(ext)) return true;
  if (JS_EXTENSIONS.has(ext) && relative.startsWith('property/js/')) return true;
  return STRUCTURED_COPY_FILES.has(relative);
}).sort();

let entries = [];
const fingerprint = createHash('sha256');
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const relative = repoPath(file);
  fingerprint.update(relative);
  fingerprint.update('\0');
  fingerprint.update(source);
  fingerprint.update('\0');
  const ext = path.extname(file).toLowerCase();
  if (HTML_EXTENSIONS.has(ext)) entries.push(...htmlEntries(file, source));
  else if (STRUCTURED_COPY_FILES.has(relative)) entries.push(...jsonEntries(file, source));
  else entries.push(...jsEntries(file, source));
}

entries.push({
  text: 'Insights articles',
  file: 'Supabase: public.insights_articles',
  line: null,
  owner: 'CMS',
  contentClass: 'governed-content-reference',
  safeToEdit: 'cms',
  guidance: 'Database-backed editorial content. Edit through the governed Insights publishing workflow, not static repo files.',
});

entries = dedupe(entries).sort((a, b) =>
  a.text.localeCompare(b.text, 'en', { sensitivity: 'base' }) ||
  a.file.localeCompare(b.file) ||
  (a.line || 0) - (b.line || 0)
);

const payload = {
  schemaVersion: 2,
  generatedBy: 'scripts/generate-content-glossary.mjs',
  sourceFingerprint: fingerprint.digest('hex'),
  sourceFileCount: sourceFiles.length,
  entryCount: entries.length,
  owners: entries.reduce((acc, entry) => { acc[entry.owner] = (acc[entry.owner] || 0) + 1; return acc; }, {}),
  entries,
};

if (payload.entryCount < 100) throw new Error(`Content glossary unexpectedly small: ${payload.entryCount} entries.`);
if (entries.some((entry) => /eyJ[a-zA-Z0-9_-]{20,}|service_role|Bearer\s+[A-Za-z0-9._-]{12,}/.test(entry.text))) {
  throw new Error('Content glossary secret-safety check failed.');
}

if (!checkOnly) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`content glossary: wrote ${payload.entryCount} entries from ${payload.sourceFileCount} files -> ${repoPath(outputPath)}`);
} else {
  console.log(`content glossary: validated ${payload.entryCount} entries from ${payload.sourceFileCount} files`);
}

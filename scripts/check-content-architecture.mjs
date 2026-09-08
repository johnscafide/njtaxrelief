import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const baseArgIndex = args.indexOf('--base');
const base = baseArgIndex >= 0 ? args[baseArgIndex + 1] : process.env.CONTENT_ARCH_BASE || '';

function gitDiff() {
  const common = ['diff', '--unified=0'];
  if (base) common.push(`${base}...HEAD`);
  common.push('--', 'property/js');
  try {
    return execFileSync('git', common, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error?.status === 0) return '';
    throw error;
  }
}

const diff = gitDiff();
if (!diff.trim()) {
  console.log('[content-architecture] No property JavaScript changes to inspect.');
  process.exit(0);
}

const violations = [];
let file = '';
let newLine = 0;
let previousAdded = '';
let removedInHunk = [];

// NJW-314 edits existing customer copy in these legacy/shared runtime files.
// The exception below permits a copy replacement only when the same diff hunk
// removes an existing mutation of the same kind. Net-new static JS copy is
// still rejected, and NJW-296 remains the extraction path for legacy strings.
const TRANSITIONAL_COPY_EDIT_FILES = new Set([
  'property/js/data-workbench-intelligence.js',
  'property/js/plan-outcomes.js',
  'property/js/pro.js',
  'property/js/scan.js',
  'property/js/watchdog-why.js',
]);

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function isSuppressed(line, previous) {
  return /content-architecture:\s*dynamic/i.test(line) || /content-architecture:\s*dynamic/i.test(previous);
}

function mutationKind(line) {
  const value = String(line || '').trim();
  if (/(?:style|sheet)\.textContent\s*=\s*['"`]/i.test(value)) return 'runtime-style';
  if (/(?:innerHTML|outerHTML)\s*=/i.test(value)) return 'html-assignment';
  if (/insertAdjacentHTML\s*\(/i.test(value)) return 'html-insert';
  if (/(?:textContent|innerText)\s*=\s*['"`]/i.test(value)) return 'text-assignment';
  if (/(?:const|let|var)\s+[\w$]+\s*=\s*['"`]/.test(value)) return 'literal-assignment';
  return '';
}

function isExistingCopyReplacement(line) {
  if (!TRANSITIONAL_COPY_EDIT_FILES.has(file)) return false;
  const kind = mutationKind(line);
  if (!kind) return false;
  return removedInHunk.some((oldLine) => mutationKind(oldLine) === kind);
}

function inspect(line, lineNumber) {
  if (!file.endsWith('.js')) return;
  if (isSuppressed(line, previousAdded)) return;
  if (isExistingCopyReplacement(line)) return;

  const trimmed = line.trim();
  const words = wordCount(trimmed.replace(/[<>{}()[\]`'"=+;:,.!?/_-]/g, ' '));
  const hasStaticHtml = /(?:innerHTML|outerHTML|insertAdjacentHTML)\s*(?:=|\()/i.test(trimmed) && /<(?:section|article|div|p|h[1-6]|aside|header|footer|nav|span|a|button)\b/i.test(trimmed);
  const longTextMutation = /(?:textContent|innerText)\s*=\s*['"`]/i.test(trimmed) && trimmed.length >= 150 && words >= 12;
  const longHtmlMutation = hasStaticHtml && trimmed.length >= 140 && words >= 10;
  const runtimeStyleBlob = /(?:style|sheet)\.textContent\s*=\s*['"`]/i.test(trimmed) && trimmed.length >= 100;
  const longLiteral = /(?:const|let|var)\s+[\w$]+\s*=\s*['"`]/.test(trimmed) && trimmed.length >= 220 && words >= 18;

  if (runtimeStyleBlob) {
    violations.push({ file, line: lineNumber, reason: 'large CSS string injected from JavaScript; move presentation to a stylesheet' });
  } else if (longHtmlMutation) {
    violations.push({ file, line: lineNumber, reason: 'long static HTML/copy rendered from JavaScript; move stable markup/copy to HTML or an HTML partial' });
  } else if (longTextMutation) {
    violations.push({ file, line: lineNumber, reason: 'long user-facing text assigned at runtime; static copy normally belongs in HTML/CMS' });
  } else if (longLiteral && /[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(trimmed)) {
    violations.push({ file, line: lineNumber, reason: 'long prose-like JavaScript literal; verify that it is truly data/state driven' });
  }
}

for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ b/')) {
    file = raw.slice(6);
    previousAdded = '';
    removedInHunk = [];
    continue;
  }
  const hunk = raw.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
  if (hunk) {
    newLine = Number(hunk[1]);
    previousAdded = '';
    removedInHunk = [];
    continue;
  }
  if (!file || raw.startsWith('--- ')) continue;
  if (raw.startsWith('-') && !raw.startsWith('---')) {
    removedInHunk.push(raw.slice(1));
    continue;
  }
  if (raw.startsWith('+') && !raw.startsWith('+++')) {
    const added = raw.slice(1);
    inspect(added, newLine);
    previousAdded = added;
    newLine += 1;
    continue;
  }
  if (!raw.startsWith('\\')) {
    previousAdded = '';
    newLine += 1;
  }
}

if (!violations.length) {
  console.log('[content-architecture] PASS — no new unacknowledged static-copy/runtime-style violations found.');
  process.exit(0);
}

console.error('[content-architecture] FAIL — new customer-facing JavaScript appears to own static copy/presentation.');
for (const violation of violations) {
  console.error(`- ${violation.file}:${violation.line} — ${violation.reason}`);
}
console.error('Move static copy to HTML/partials, move presentation to CSS, or add a nearby "content-architecture: dynamic" comment with a real state/data-driven justification.');
process.exit(1);

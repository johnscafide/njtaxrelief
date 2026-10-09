import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build step: the home page links about 20 small style files (two of them pull
// in the rest with @import), which the browser fetches one after another.
// This joins them, in the same order, into one file for the home page only.
// The source files stay as they are and every other page keeps using them.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = path.join(ROOT, 'property', 'index.html');
const OUT_NAME = 'home-bundle.css';
const OUT = path.join(ROOT, 'property', 'css', OUT_NAME);
const STORY_MARK = 'Hi There. I see you are checking the code.';

function sourcePath(href) {
  const clean = href.split(/[?#]/)[0];
  if (!clean.startsWith('/property/css/') || !clean.endsWith('.css')) return null;
  const file = path.join(ROOT, clean);
  return existsSync(file) ? file : null;
}

function splitComments(css) {
  let out = '';
  const comments = [];
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      comments.push(css.slice(i, stop));
      i = stop;
    } else {
      out += ch;
      i += 1;
    }
  }
  return { css: out, comments };
}

function absoluteUrls(css, file) {
  const dir = '/' + path.relative(ROOT, path.dirname(file)).split(path.sep).join('/');
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(url)) return match;
    return `url(${quote}${path.posix.normalize(path.posix.join(dir, url))}${quote})`;
  });
}

const seen = new Set();
const hoisted = [];
let story = '';

function expand(file) {
  if (seen.has(file)) return '';
  seen.add(file);
  const { css, comments } = splitComments(readFileSync(file, 'utf8'));
  if (!story) story = comments.find((c) => c.includes(STORY_MARK)) || '';
  const body = absoluteUrls(css, file).replace(/@charset\s+[^;]+;/gi, '');
  return body.replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/gi, (match, _quote, href, media) => {
    const nested = sourcePath(href);
    if (!nested || media.trim()) {
      hoisted.push(match.trim());
      return '';
    }
    return expand(nested);
  });
}

const html = readFileSync(HOME, 'utf8');
const headEnd = html.indexOf('</head>');
const head = html.slice(0, headEnd);
const linkPattern = /<link\b[^>]*>/gi;
const links = [];
for (const match of head.matchAll(linkPattern)) {
  const tag = match[0];
  if (!/\brel=["']stylesheet["']/i.test(tag) || /\bmedia=/i.test(tag) || /\bonload=/i.test(tag)) continue;
  const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1] || '';
  const file = sourcePath(href);
  if (file) links.push({ tag, index: match.index, file });
}

if (links.length < 2) {
  console.log(`Home CSS bundle: found ${links.length} local style link(s) on the home page, leaving it as is.`);
  process.exit(0);
}

const first = links[0].index;
const last = links[links.length - 1].index + links[links.length - 1].tag.length;
const between = head.slice(first, last);
if (/<style\b|<link\b[^>]*\brel=["']stylesheet["'](?![^>]*\/property\/css\/)/i.test(between.replace(/<script\b[^>]*type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, ''))) {
  console.warn('Home CSS bundle: other styles sit between the home page style links, leaving it as is so the order stays the same.');
  process.exit(0);
}

const parts = links.map((link) => expand(link.file));
const body = parts.join('\n').replace(/\n\s*\n+/g, '\n').trim();
const bundle = `${hoisted.join('\n')}${hoisted.length ? '\n' : ''}${story ? story + '\n' : ''}${body}\n`;
writeFileSync(OUT, bundle, 'utf8');

const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
const newLink = `<link rel="stylesheet" href="/property/css/${OUT_NAME}?v=${hash}">`;
let nextHead = head;
for (const link of [...links].reverse()) {
  const replacement = link === links[0] ? newLink : '';
  nextHead = nextHead.slice(0, link.index) + replacement + nextHead.slice(link.index + link.tag.length);
}
writeFileSync(HOME, nextHead + html.slice(headEnd), 'utf8');
console.log(`Home CSS bundle: joined ${seen.size} style files from ${links.length} links into /property/css/${OUT_NAME} (${Math.round(bundle.length / 1024)} KB).`);

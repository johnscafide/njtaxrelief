import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const IMAGE_PATH = '/watchdog-social-share-20260913-v2.jpg';
const IMAGE_URL = `https://www.watchdogindex.com${IMAGE_PATH}`;
const LEGACY_IMAGE_URLS = [
  'https://www.watchdogindex.com/watchdog-social-share.jpg',
  'https://www.watchdogindex.com/watchdog-social-share-20260913.jpg'
];
const IMAGE_ALT = 'Watchdog Property Intelligence across New Jersey';
const EXCLUDED_DIRS = new Set(['.git', '.vercel', 'node_modules', 'coverage']);

const imageMetaPattern = /<meta\b[^>]*(?:property|name)\s*=\s*(["'])(?:og:image(?::(?:secure_url|type|width|height|alt))?|twitter:image(?::alt)?)\1[^>]*>\s*/gi;
const twitterCardPattern = /<meta\b[^>]*name\s*=\s*(["'])twitter:card\1[^>]*>/i;

const SOCIAL_IMAGE_META = [
  `<meta property="og:image" content="${IMAGE_URL}">`,
  `<meta property="og:image:secure_url" content="${IMAGE_URL}">`,
  '<meta property="og:image:type" content="image/jpeg">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  `<meta property="og:image:alt" content="${IMAGE_ALT}">`,
  `<meta name="twitter:image" content="${IMAGE_URL}">`,
  `<meta name="twitter:image:alt" content="${IMAGE_ALT}">`
].join('\n  ');

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(full);
  }
  return files;
}

function normalizeHtml(input) {
  let html = String(input || '');
  if (!/<head\b/i.test(html) || !/<\/head>/i.test(html)) return html;

  html = html.replace(imageMetaPattern, '');

  if (twitterCardPattern.test(html)) {
    html = html.replace(twitterCardPattern, '<meta name="twitter:card" content="summary_large_image">');
  } else {
    html = html.replace(/<\/head>/i, '  <meta name="twitter:card" content="summary_large_image">\n</head>');
  }

  return html.replace(/<\/head>/i, `  ${SOCIAL_IMAGE_META}\n</head>`);
}

async function normalizeStaticHtml() {
  const files = await walk(ROOT);
  let changed = 0;
  let eligible = 0;

  for (const file of files) {
    const before = await readFile(file, 'utf8');
    if (!/<head\b/i.test(before) || !/<\/head>/i.test(before)) continue;
    eligible += 1;
    const after = normalizeHtml(before);
    if (after !== before) {
      await writeFile(file, after, 'utf8');
      changed += 1;
    }
  }

  if (!eligible) {
    throw new Error('Watchdog social share: no HTML pages with <head> were found.');
  }

  return { eligible, changed };
}

async function normalizeServerAdapters() {
  const targets = [
    'api/watchdog-index-entry.js',
    'api/watchdog-index-page-contact-safe.js'
  ];

  let changed = 0;
  for (const rel of targets) {
    const file = join(ROOT, rel);
    let before;
    try {
      before = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    let after = before;
    for (const legacyUrl of LEGACY_IMAGE_URLS) {
      after = after.split(legacyUrl).join(IMAGE_URL);
    }
    after = after
      .replace(/(<meta property=\\"og:image:width\\" content=\\")600(\\">)/g, '$11200$2')
      .replace(/(<meta property=\\"og:image:height\\" content=\\")315(\\">)/g, '$1630$2')
      .replace(/(<meta property="og:image:width" content=")600(">)/g, '$11200$2')
      .replace(/(<meta property="og:image:height" content=")315(">)/g, '$1630$2');

    if (after !== before) {
      await writeFile(file, after, 'utf8');
      changed += 1;
    }
  }
  return changed;
}

function assertSocialMeta(html, file) {
  const required = [
    IMAGE_URL,
    'property="og:image:width" content="1200"',
    'property="og:image:height" content="630"',
    'name="twitter:card" content="summary_large_image"'
  ];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Watchdog social share verification failed for ${relative(ROOT, file)}: missing ${marker}`);
    }
  }

  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] || '';
  const ogImageTags = head.match(/<meta\b[^>]*property\s*=\s*(["'])og:image\1[^>]*>/gi) || [];
  if (ogImageTags.length !== 1 || !ogImageTags[0].includes(IMAGE_URL)) {
    throw new Error(`Watchdog social share verification failed for ${relative(ROOT, file)}: expected exactly one canonical og:image.`);
  }
}

async function verifyStaticHtml() {
  const files = await walk(ROOT);
  let verified = 0;
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    if (!/<head\b/i.test(html) || !/<\/head>/i.test(html)) continue;
    assertSocialMeta(html, file);
    verified += 1;
  }
  return verified;
}

const staticResult = await normalizeStaticHtml();
const adapterChanges = await normalizeServerAdapters();
const verified = await verifyStaticHtml();

console.log(
  `Watchdog social share: ${verified} HTML pages verified, ${staticResult.changed} updated, ${adapterChanges} server adapters normalized.`
);

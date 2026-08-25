import process from 'node:process';

const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const INDEXNOW_KEY = 'c04eb5246cd74475b86188f12c31e21b';
const INDEXNOW_KEY_LOCATION = `${CANONICAL_ORIGIN}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

const PRIVATE_PREFIXES = [
  '/account',
  '/agent-control',
  '/agent-desk',
  '/analytics',
  '/backoffice',
  '/compare',
  '/dashboard',
  '/data-center',
  '/data-workbench',
  '/developer',
  '/developer-data',
  '/diagnostics',
  '/farm-builder',
  '/growth',
  '/home',
  '/insights/admin',
  '/integrations',
  '/intelligence',
  '/logs',
  '/marketing-studio',
  '/newsletter-studio',
  '/onboarding',
  '/report-builder',
  '/watchlist',
  '/whitepapers',
  '/workbench'
];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizeCandidate(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const url = value.startsWith('/') ? new URL(value, CANONICAL_ORIGIN) : new URL(value);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== CANONICAL_HOST) {
    throw new Error(`IndexNow only accepts canonical Watchdog URLs on ${CANONICAL_ORIGIN}: ${value}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`IndexNow submissions must use clean canonical URLs without credentials, query strings, or fragments: ${value}`);
  }

  let pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  if (pathname === '/property' || pathname.startsWith('/property/')) {
    throw new Error(`Legacy /property compatibility URLs must not be submitted to IndexNow: ${value}`);
  }
  if (/\.html$/i.test(pathname)) {
    throw new Error(`Extension-bearing compatibility URLs must not be submitted to IndexNow: ${value}`);
  }
  if (isPrivatePath(pathname)) {
    throw new Error(`Private/non-indexable Watchdog route rejected: ${value}`);
  }

  return `${CANONICAL_ORIGIN}${pathname === '/' ? '/' : pathname}`;
}

function rawInputs() {
  const args = process.argv.slice(2);
  const dryRunIndex = args.indexOf('--dry-run');
  const dryRun = dryRunIndex !== -1;
  if (dryRun) args.splice(dryRunIndex, 1);

  const envUrls = String(process.env.INDEXNOW_URLS || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(Boolean);

  return { dryRun, values: [...args, ...envUrls] };
}

async function verifyKeyFile() {
  const response = await fetch(INDEXNOW_KEY_LOCATION, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'WatchdogIndexNow/1.0', Accept: 'text/plain' },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.text();
  if (!response.ok || body.trim() !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key verification failed at ${INDEXNOW_KEY_LOCATION} (HTTP ${response.status})`);
  }
}

async function main() {
  const { dryRun, values } = rawInputs();
  if (!values.length) {
    console.error('Usage: node scripts/indexnow-submit.mjs [--dry-run] <canonical-watchdog-url> [...]');
    console.error('Or set INDEXNOW_URLS to a whitespace/newline/comma-separated list.');
    process.exitCode = 2;
    return;
  }

  let urlList;
  try {
    urlList = [...new Set(values.map(normalizeCandidate).filter(Boolean))];
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  if (!urlList.length || urlList.length > 10000) {
    console.error(`IndexNow requires between 1 and 10,000 canonical URLs; received ${urlList.length}.`);
    process.exitCode = 2;
    return;
  }

  const payload = {
    host: CANONICAL_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList
  };

  if (dryRun) {
    console.log(JSON.stringify({ endpoint: INDEXNOW_ENDPOINT, ...payload }, null, 2));
    return;
  }

  await verifyKeyFile();

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'WatchdogIndexNow/1.0'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const responseBody = await response.text();

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow submission failed: HTTP ${response.status}${responseBody ? ` — ${responseBody.slice(0, 500)}` : ''}`);
  }

  console.log(`IndexNow accepted ${urlList.length} URL(s) with HTTP ${response.status}.`);
  for (const url of urlList) console.log(`- ${url}`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

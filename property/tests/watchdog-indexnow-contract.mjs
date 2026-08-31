import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const { default: keyHandler } = await import('../../api/watchdog-index-indexnow-key.js');
const { default: robotsHandler } = await import('../../api/watchdog-index-robots.js');

function responseHarness() {
  let body = '';
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    end(value = '') { body += String(value); },
    get body() { return body; },
    get headers() { return headers; }
  };
}

const keyRes = responseHarness();
keyHandler({ method: 'GET', headers: { host: 'www.watchdogindex.com' } }, keyRes);
assert.equal(keyRes.statusCode, 200);
assert.equal(keyRes.body.trim(), keyHandler.INDEXNOW_KEY);
assert.equal(keyHandler.INDEXNOW_KEY_PATH, `/${keyHandler.INDEXNOW_KEY}.txt`);
assert.match(keyRes.headers.get('content-type') || '', /text\/plain/);

const legacyKeyRes = responseHarness();
keyHandler({ method: 'GET', headers: { host: 'njpropertytaxrelief.com' } }, legacyKeyRes);
assert.equal(legacyKeyRes.statusCode, 404, 'IndexNow key must only be served on the canonical Watchdog host');

const robotsRes = responseHarness();
robotsHandler({ method: 'GET', headers: { host: 'www.watchdogindex.com' } }, robotsRes);
assert.equal(robotsRes.statusCode, 200);
for (const agent of ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'Applebot', 'Bingbot']) {
  assert.match(robotsRes.body, new RegExp(`User-agent: ${agent}`));
}
assert.doesNotMatch(robotsRes.body, /User-agent: ClaudeBot/, 'training crawler policy must stay a separate owner decision');
assert.match(robotsRes.body, /User-agent: \*\nAllow: \//);
assert.match(robotsRes.body, /Disallow: \/account\$/);
assert.match(robotsRes.body, /Disallow: \/dashboard\$/);
assert.match(robotsRes.body, /Disallow: \/home\$/);
assert.doesNotMatch(robotsRes.body, /Disallow: \/home-buying-cost-calculator/);
assert.doesNotMatch(robotsRes.body, /Disallow: \/home-inspectors/);
assert.match(robotsRes.body, /Sitemap: https:\/\/www\.watchdogindex\.com\/sitemap\.xml/);

const middleware = await readFile(new URL('../../middleware.js', import.meta.url), 'utf8');
assert.ok(middleware.includes(`const INDEXNOW_KEY_PATH = '/${keyHandler.INDEXNOW_KEY}.txt';`));
assert.ok(middleware.includes("'/api/watchdog-index-indexnow-key'"));
assert.ok(middleware.includes("['/contact.html', '/contact']"), 'legacy contact.html must use an HTTP canonical redirect');

function runSubmit(...args) {
  return spawnSync(process.execPath, ['scripts/indexnow-submit.mjs', '--dry-run', ...args], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8'
  });
}

const valid = runSubmit('https://www.watchdogindex.com/alternatives/propertyshark');
assert.equal(valid.status, 0, valid.stderr);
assert.match(valid.stdout, /https:\/\/www\.watchdogindex\.com\/alternatives\/propertyshark/);

const privateRoute = runSubmit('https://www.watchdogindex.com/dashboard');
assert.notEqual(privateRoute.status, 0, 'private routes must be rejected');
assert.match(privateRoute.stderr, /Private\/non-indexable Watchdog route rejected/);

const legacyRoute = runSubmit('https://www.watchdogindex.com/property/alternatives/propertyshark');
assert.notEqual(legacyRoute.status, 0, 'legacy /property routes must be rejected');
assert.match(legacyRoute.stderr, /Legacy \/property compatibility URLs must not be submitted/);

console.log('Watchdog IndexNow/search crawler contract PASS');

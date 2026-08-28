import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const build = await read('scripts/build-pagefind.mjs');
const search = await read('search/index.html');
const runtime = await read('property/js/watchdog-third-party.js');
const config = await read('api/watchdog-third-party-config.js');

assert.equal(pkg.devDependencies?.pagefind, '1.5.2');
assert.equal(pkg.scripts?.['pagefind:index'], 'node scripts/build-pagefind.mjs');
assert.equal(pkg.scripts?.['vercel-build'], 'npm run test:third-party && npm run test:farm-map-basemap && npm run test:external-signals && npm run pagefind:index');
assert.match(search, /\/pagefind\/pagefind-ui\.js/);
assert.match(search, /Private dashboards, accounts, reports, developer tools and customer records are intentionally excluded/);
assert.match(build, /\/admin\//);
assert.match(build, /\/account\//);
assert.match(build, /\/dashboard\//);
assert.match(build, /\/developer/);
assert.match(build, /data-watchdog-third-party/);
assert.match(runtime, /sendDefaultPii:false/);
assert.match(runtime, /replaysSessionSampleRate:0/);
assert.match(runtime, /replaysOnErrorSampleRate:0/);
assert.match(runtime, /u\.origin\+u\.pathname/);
assert.match(runtime, /turnstile_token/);
assert.match(runtime, /interaction-only/);
assert.match(config, /WATCHDOG_TURNSTILE_SITE_KEY/);
assert.match(config, /WATCHDOG_SENTRY_DSN/);
assert.doesNotMatch(config, /TURNSTILE_SECRET/);

console.log('third-party foundation contract: ok');
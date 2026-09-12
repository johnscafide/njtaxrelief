import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const nav = read('property/js/public-nav.js');
const runtime = read('property/js/landing-anchor-jump.js');
const partial = read('property/partials/landing-anchor-jump.html');
const css = read('property/css/landing-anchor-jump.css');

assert.match(nav, /landing-anchor-jump\.css/);
assert.match(nav, /landing-anchor-jump\.js/);
assert.match(runtime, /watchdogindex\.com/);
assert.match(runtime, /wd-consumer-recents/);
assert.match(runtime, /wd-anchor-quick/);
assert.match(runtime, /scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
assert.match(partial, /Looking for New Jersey Property Tax Relief Benefits\?/);
assert.match(partial, /fa-radio/);
assert.match(partial, /href="#wd-anchor-quick"/);
assert.match(css, /\.wd-anchor-jump-link/);
assert.match(css, /@media\(max-width:640px\)/);

console.log('Homepage ANCHOR relief jump contract passed');

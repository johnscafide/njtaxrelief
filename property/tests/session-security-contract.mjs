import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = fs.readFileSync(path.join(root, 'property/js/supabase-runtime.js'), 'utf8');

assert.match(runtime, /flowType:\s*['"]pkce['"]/,
  'Central Supabase runtime must retain PKCE.');
assert.match(runtime, /persistSession:\s*true/,
  'Central Supabase runtime must retain documented persistent-session behavior.');
assert.match(runtime, /autoRefreshToken:\s*true/,
  'Central Supabase runtime must retain automatic token refresh.');
assert.match(runtime, /parsed\.origin\s*!==\s*location\.origin/,
  'OAuth continuation must keep the same-origin boundary.');
assert.match(runtime, /parsed\.pathname\.indexOf\(['"]\/property\/['"]\)\s*!==\s*0/,
  'OAuth continuation must remain inside /property/.');

const jsRoot = path.join(root, 'property/js');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.m?js$/i.test(entry.name)) files.push(absolute);
  }
}
walk(jsRoot);

const narrowLogout = /\.auth\.signOut\s*\(\s*\{\s*scope\s*:\s*['"](?:local|others)['"]/g;
const consoleToken = /console\.(?:log|info|debug|warn|error)\s*\([^\n;]*(?:access[_ -]?token|refresh[_ -]?token|authorization\s*header|bearer\s+token)/i;

for (const absolute of files) {
  const source = fs.readFileSync(absolute, 'utf8');
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  assert.doesNotMatch(source, narrowLogout,
    `${relative} explicitly narrows Supabase sign-out scope. Normal Watchdog sign out must retain global semantics unless separately reviewed.`);
  assert.doesNotMatch(source, consoleToken,
    `${relative} appears to write auth-token material to the browser console.`);
}

assert.ok(files.length > 20, 'Session-security scan unexpectedly covered too few first-party JavaScript files.');
console.log(`Watchdog session-security contracts passed across ${files.length} first-party JavaScript files.`);

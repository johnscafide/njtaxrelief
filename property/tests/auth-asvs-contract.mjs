import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimePath = path.join(root, 'property/js/supabase-runtime.js');
const source = fs.readFileSync(runtimePath, 'utf8');

assert.match(source, /flowType:\s*['"]pkce['"]/,
  'Watchdog OAuth must retain PKCE in the centralized Supabase runtime.');
assert.match(source, /persistSession:\s*true/,
  'Watchdog browser sessions must retain the documented centralized persistence configuration.');
assert.match(source, /autoRefreshToken:\s*true/,
  'Watchdog browser sessions must retain automatic token refresh in the centralized runtime.');
assert.match(source, /parsed\.origin\s*!==\s*location\.origin/,
  'OAuth continuation URLs must reject cross-origin redirects.');
assert.match(source, /parsed\.pathname\.indexOf\(['"]\/property\/['"]\)\s*!==\s*0/,
  'OAuth continuation URLs must remain inside the Watchdog /property/ application boundary.');
assert.match(source, /google:\s*\{\s*label:['"]Google['"],\s*enabled:true\s*\}/,
  'The reviewed Google OAuth provider should remain explicitly configured.');
for (const provider of ['apple', 'facebook', 'linkedin_oidc']) {
  const escaped = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(source, new RegExp(`${escaped}:\\s*\\{[^}]*enabled:false`),
    `${provider} must remain disabled by default until deliberately reviewed and enabled.`);
}
assert.match(source, /querySelectorAll\(['"]\.auth-magic['"]\)/,
  'Legacy email magic-link signup UI removal must remain part of the centralized auth runtime.');
assert.match(source, /signInWithOtp/,
  'The auth runtime must continue removing legacy signInWithOtp controls if old markup is injected.');

console.log('Watchdog ASVS authentication runtime contracts passed.');

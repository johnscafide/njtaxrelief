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
// Clean WatchdogIndex hosts use root-level routes; the legacy host keeps the
// /property/ boundary. Both stay same-origin and refuse onboarding/API targets.
assert.match(source, /path\.indexOf\(['"]\/property\/['"]\)\s*!==\s*0/,
  'OAuth continuation URLs must remain inside /property/ on the legacy host.');
assert.match(source, /cleanWatchdogHost[\s\S]{0,160}path\.indexOf\(['"]\/api\/['"]\)\s*===\s*0\)\s*return dashboardPath/,
  'OAuth continuation URLs on WatchdogIndex must refuse API paths.');
assert.match(source, /path\s*===\s*['"]\/onboarding['"]/,
  'OAuth continuation URLs on WatchdogIndex must refuse onboarding loops.');
assert.match(source, /google:\s*\{\s*label:['"]Google['"],\s*enabled:true\s*\}/,
  'The reviewed Google OAuth provider should remain explicitly configured.');
// Facebook and LinkedIn were reviewed and enabled after the 2026-08-19 social
// sign-in QA (see supabase-runtime-contract.mjs). Apple stays disabled until reviewed.
for (const provider of ['facebook', 'linkedin_oidc']) {
  assert.match(source, new RegExp(`${provider}:\\s*\\{[^}]*enabled:true`),
    `${provider} is a reviewed, explicitly configured provider.`);
}
assert.match(source, /apple:\s*\{[^}]*enabled:false/,
  'apple must remain disabled by default until deliberately reviewed and enabled.');
assert.match(source, /This sign-in provider is not enabled yet\./,
  'Disabled providers must fail closed.');
assert.match(source, /querySelectorAll\(['"]\.auth-magic['"]\)/,
  'Legacy email magic-link signup UI removal must remain part of the centralized auth runtime.');
assert.match(source, /signInWithOtp/,
  'The auth runtime must continue removing legacy signInWithOtp controls if old markup is injected.');

console.log('Watchdog ASVS authentication runtime contracts passed.');

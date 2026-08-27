import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout-session/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260827185932_closed_beta_trial_invites.sql'), 'utf8');
const betaPage = fs.readFileSync(path.join(root, 'property/beta/index.html'), 'utf8');
const devPage = fs.readFileSync(path.join(root, 'property/developer/beta-trials/index.html'), 'utf8');

assert.match(migration, /duration_days integer not null check \(duration_days in \(30,60\)\)/, 'database must allow only 30/60-day beta durations');
assert.match(migration, /tier text not null check \(tier in \('agent','pro','pro_plus'\)\)/, 'database must constrain beta tiers');
assert.match(migration, /code_hash text not null unique/, 'invite table must store a unique code hash');
assert.doesNotMatch(migration, /plaintext_code\s+text/i, 'database must never define plaintext code storage');
assert.match(migration, /alter table public\.billing_beta_invites enable row level security/, 'invite ledger must have RLS');
assert.match(migration, /revoke all on table public\.billing_beta_invites from anon, authenticated/, 'invite ledger must not be directly exposed');
assert.match(migration, /grant execute on function public\.claim_watchdog_beta_invite[\s\S]*to service_role/, 'atomic claim must remain service-role only');

assert.match(checkout, /action === 'create_beta_invite'/, 'developer must be able to create beta invitations');
assert.match(checkout, /action === 'list_beta_invites'/, 'developer must be able to list beta invitations');
assert.match(checkout, /action === 'revoke_beta_invite'/, 'developer must be able to revoke beta invitations');
assert.match(checkout, /rpc\('is_watchdog_developer'\)/, 'beta administration must require the developer role');
assert.match(checkout, /BETA_TRIAL_DAYS = new Set\(\[30, 60\]\)/, 'application must constrain beta durations to 30/60 days');
assert.match(checkout, /normalizeTier[\s\S]*\['agent', 'pro', 'pro_plus'\]/, 'application must constrain beta tiers');
assert.match(checkout, /sha256\(code\)/, 'plaintext beta codes must be hashed before storage/claim');
assert.match(checkout, /betaRedeem = action === 'redeem_beta_trial'/, 'beta redemption must be a distinct controlled path');
assert.match(checkout, /if \(!betaRedeem && control\.mode === 'controlled'/, 'beta redemption may bypass only the normal controlled-user allowlist');
assert.match(checkout, /if \(control\.mode !== 'controlled'\)[\s\S]*BETA_TRIAL_UNAVAILABLE/, 'beta redemption must fail outside controlled launch mode');
assert.match(checkout, /resolvePrice\(stripe, tier, 'monthly'\)/, 'beta continuation must use the governed monthly price');
assert.match(checkout, /trial_period_days: durationDays/, 'Stripe must own the beta trial clock');
assert.match(checkout, /missing_payment_method: 'cancel'/, 'Stripe must cancel at beta end when no payment method exists');
assert.match(checkout, /payment_method_collection: 'if_required'/, 'beta activation must not require a card');
assert.match(checkout, /automatic_tax: \{ enabled: true \}/, 'beta checkout must preserve automatic tax');
assert.match(checkout, /billing_address_collection: 'required'/, 'beta checkout must preserve billing address/tax-location collection');
assert.doesNotMatch(checkout, /from\('account_entitlements'\)[\s\S]{0,180}\.upsert\(/, 'Checkout must not directly grant a subscription entitlement');

assert.match(betaPage, /noindex,nofollow,noarchive/, 'beta redemption surface must not be indexed');
assert.match(betaPage, /sessionStorage\.setItem\('watchdog_beta_code'/, 'beta code must survive the sign-in redirect in tab storage');
assert.match(betaPage, /history\.replaceState/, 'beta code must be removed from the visible URL fragment promptly');
assert.match(betaPage, /action:'redeem_beta_trial'/, 'beta page must use the governed redemption action');
assert.match(betaPage, /No card to begin/, 'beta UX must clearly state no card is required');
assert.match(betaPage, /returns to Standard/, 'beta UX must clearly explain no-payment fallback');

assert.match(devPage, /data-access-require="developer"/, 'beta admin page must be developer-only');
assert.match(devPage, /action:'create_beta_invite'/, 'beta admin page must create invitations through the server boundary');
assert.match(devPage, /action:'list_beta_invites'/, 'beta admin page must list invitations through the server boundary');
assert.match(devPage, /action:'revoke_beta_invite'/, 'beta admin page must revoke invitations through the server boundary');
assert.match(devPage, /Plaintext code · shown once/, 'developer UX must explain that plaintext is one-time only');

console.log('closed beta trial contract: PASS');

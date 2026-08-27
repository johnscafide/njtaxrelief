import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const CANONICAL_SITE = 'https://www.watchdogindex.com';
const DEFAULT_SITE = CANONICAL_SITE;
const WATCHDOG_HOSTS = new Set(['watchdogindex.com', 'www.watchdogindex.com']);
const PRODUCTION_HOSTS = new Set([
  'njpropertytaxrelief.com',
  'www.njpropertytaxrelief.com',
  'watchdogindex.com',
  'www.watchdogindex.com'
]);
const CAPACITY = { agent: 25, pro: 250, pro_plus: 2500 } as const;
const PRICE_CATALOG = {
  agent: {
    monthly: { lookup_key: 'watchdog_agent_monthly', amount: 5900 },
    yearly: { lookup_key: 'watchdog_agent_yearly', amount: 59000 }
  },
  pro: {
    monthly: { lookup_key: 'watchdog_pro_monthly', amount: 12900 },
    yearly: { lookup_key: 'watchdog_pro_yearly', amount: 129000 }
  },
  pro_plus: {
    monthly: { lookup_key: 'watchdog_pro_plus_monthly', amount: 39900 },
    yearly: { lookup_key: 'watchdog_pro_plus_yearly', amount: 399000 }
  }
} as const;
const MOVE_PRICE = { lookup_key: 'watchdog_move_90_day', amount: 2900 } as const;
const CONTROLLED_AGENT_TRIAL = { offer: 'controlled_agent_7d_v1', days: 7 } as const;
const BETA_TRIAL_DAYS = new Set([30, 60]);
const BETA_MAX_REDEMPTIONS = 100;
const BETA_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
type Tier = keyof typeof CAPACITY;
type Cadence = 'monthly' | 'yearly';
type CheckoutMode = 'closed' | 'controlled' | 'open';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      PRODUCTION_HOSTS.has(host) ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.vercel.app')
    ) return origin;
  } catch (_) {}
  return DEFAULT_SITE;
}

function normalizeSite(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !PRODUCTION_HOSTS.has(host)) return '';
    if (WATCHDOG_HOSTS.has(host)) return CANONICAL_SITE;
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return '';
  }
}

function requestSite(req: Request) {
  const originSite = normalizeSite(req.headers.get('origin') || '');
  if (originSite) return originSite;
  const configuredSite = normalizeSite(String(Deno.env.get('PUBLIC_SITE_URL') || ''));
  return configuredSite || DEFAULT_SITE;
}

function accountPath(site: string) {
  try {
    return WATCHDOG_HOSTS.has(new URL(site).hostname.toLowerCase()) ? '/account' : '/property/account/';
  } catch (_) {
    return '/account';
  }
}

function betaPath(site: string) {
  try {
    return WATCHDOG_HOSTS.has(new URL(site).hostname.toLowerCase()) ? '/beta' : '/property/beta/';
  } catch (_) {
    return '/beta';
  }
}

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function validMode(value: unknown): CheckoutMode | null {
  const normalized = String(value || '').trim().toLowerCase();
  return ['closed', 'controlled', 'open'].includes(normalized) ? normalized as CheckoutMode : null;
}

function isStripeAuthError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as any).type === 'StripeAuthenticationError');
}

function requestedControlledTrial(body: any) {
  return body?.trial === true || String(body?.offer || '').trim().toLowerCase() === CONTROLLED_AGENT_TRIAL.offer;
}

function normalizeTier(value: unknown): Tier | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pro+') return 'pro_plus';
  return ['agent', 'pro', 'pro_plus'].includes(raw) ? raw as Tier : null;
}

function normalizeBetaCode(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function betaTierToken(tier: Tier) {
  return tier === 'pro_plus' ? 'PP' : tier === 'pro' ? 'PR' : 'AG';
}

function randomBetaCode(tier: Tier, days: number) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let token = '';
  for (const byte of bytes) token += BETA_CODE_ALPHABET[byte % BETA_CODE_ALPHABET.length];
  return `WDG-${betaTierToken(tier)}-${days}-${token}`;
}

function maskEmail(email: string) {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const safeLocal = local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}

async function isDeveloper(userClient: any) {
  const { data, error } = await userClient.rpc('is_watchdog_developer');
  return !error && data === true;
}

async function requireDeveloper(req: Request, userClient: any) {
  if (!(await isDeveloper(userClient))) {
    return json(req, { error: 'Developer access required.', code: 'DEVELOPER_REQUIRED' }, 403);
  }
  return null;
}

async function createBetaInvite(req: Request, body: any, user: any, userClient: any, admin: any) {
  const denied = await requireDeveloper(req, userClient);
  if (denied) return denied;

  const tier = normalizeTier(body?.tier);
  const durationDays = Number(body?.duration_days);
  const maxRedemptions = Number(body?.max_redemptions ?? 1);
  const label = String(body?.label || '').trim().slice(0, 160) || null;
  const recipientEmail = normalizeEmail(body?.recipient_email);
  const expiresInDays = Number(body?.expires_in_days ?? 14);

  if (!tier) return json(req, { error: 'Choose Agent, Pro, or Pro+.', code: 'BETA_INVALID_TIER' }, 400);
  if (!BETA_TRIAL_DAYS.has(durationDays)) return json(req, { error: 'Beta trials may be 30 or 60 days.', code: 'BETA_INVALID_DURATION' }, 400);
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > BETA_MAX_REDEMPTIONS) {
    return json(req, { error: `Beta invite redemptions must be between 1 and ${BETA_MAX_REDEMPTIONS}.`, code: 'BETA_INVALID_REDEMPTION_LIMIT' }, 400);
  }
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    return json(req, { error: 'Beta invite validity must be between 1 and 90 days.', code: 'BETA_INVALID_EXPIRY' }, 400);
  }
  if (recipientEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return json(req, { error: 'Enter a valid recipient email or leave it blank.', code: 'BETA_INVALID_EMAIL' }, 400);
  }

  let code = '';
  let inserted: any = null;
  let insertError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    code = randomBetaCode(tier, durationDays);
    const codeHash = await sha256(code);
    const recipientHash = recipientEmail ? await sha256(recipientEmail) : null;
    const result = await admin.from('billing_beta_invites').insert({
      code_hash: codeHash,
      code_prefix: code.slice(0, code.lastIndexOf('-') + 1),
      label,
      tier,
      duration_days: durationDays,
      max_redemptions: maxRedemptions,
      recipient_email_hash: recipientHash,
      recipient_hint: recipientEmail ? maskEmail(recipientEmail) : null,
      active: true,
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      created_by: user.id,
      metadata: { source: 'developer_closed_beta', plaintext_code_stored: false }
    }).select('id,code_prefix,label,tier,duration_days,max_redemptions,recipient_hint,active,expires_at,created_at').single();
    inserted = result.data;
    insertError = result.error;
    if (!insertError) break;
    if (insertError.code !== '23505') break;
  }
  if (insertError || !inserted) {
    console.error('BETA_INVITE_CREATE_ERROR', insertError);
    return json(req, { error: 'Could not create the beta invitation.', code: 'BETA_INVITE_CREATE_FAILED' }, 500);
  }

  await admin.from('access_audit_log').insert({
    user_id: user.id,
    event_type: 'billing.beta_invite_created',
    resource_type: 'beta_invite',
    resource_id: inserted.id,
    required_plan: 'developer',
    allowed: true,
    metadata: { tier, duration_days: durationDays, max_redemptions: maxRedemptions, recipient_locked: Boolean(recipientEmail), expires_at: inserted.expires_at }
  });

  const site = requestSite(req);
  return json(req, {
    invite: inserted,
    code,
    redeem_url: `${site}${betaPath(site)}#${encodeURIComponent(code)}`,
    plaintext_returned_once: true
  });
}

async function listBetaInvites(req: Request, userClient: any, admin: any) {
  const denied = await requireDeveloper(req, userClient);
  if (denied) return denied;
  const invites = await admin.from('billing_beta_invites')
    .select('id,code_prefix,label,tier,duration_days,max_redemptions,recipient_hint,active,expires_at,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (invites.error) return json(req, { error: 'Could not load beta invitations.', code: 'BETA_INVITE_LIST_FAILED' }, 500);
  const ids = (invites.data || []).map((row: any) => row.id);
  let redemptionRows: any[] = [];
  if (ids.length) {
    const redemptions = await admin.from('billing_beta_redemptions')
      .select('invite_id,status,reserved_until,redeemed_at,created_at')
      .in('invite_id', ids)
      .limit(5000);
    if (redemptions.error) return json(req, { error: 'Could not load beta redemption counts.', code: 'BETA_REDEMPTION_LIST_FAILED' }, 500);
    redemptionRows = redemptions.data || [];
  }
  const now = Date.now();
  const counts = new Map<string, { consumed: number; reserved: number; failed: number }>();
  for (const row of redemptionRows) {
    const current = counts.get(row.invite_id) || { consumed: 0, reserved: 0, failed: 0 };
    if (row.status === 'completed') current.consumed += 1;
    else if (row.status === 'reserved' && new Date(row.reserved_until).getTime() > now) current.reserved += 1;
    else if (row.status === 'failed' || row.status === 'expired' || row.status === 'reserved') current.failed += 1;
    counts.set(row.invite_id, current);
  }
  return json(req, {
    invites: (invites.data || []).map((invite: any) => ({ ...invite, redemptions: counts.get(invite.id) || { consumed: 0, reserved: 0, failed: 0 } }))
  });
}

async function revokeBetaInvite(req: Request, body: any, user: any, userClient: any, admin: any) {
  const denied = await requireDeveloper(req, userClient);
  if (denied) return denied;
  const inviteId = String(body?.invite_id || '').trim();
  if (!inviteId) return json(req, { error: 'Invite ID is required.', code: 'BETA_INVITE_ID_REQUIRED' }, 400);
  const result = await admin.from('billing_beta_invites')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', inviteId)
    .select('id,code_prefix,label,tier,duration_days,active,expires_at')
    .maybeSingle();
  if (result.error) return json(req, { error: 'Could not revoke beta invitation.', code: 'BETA_INVITE_REVOKE_FAILED' }, 500);
  if (!result.data) return json(req, { error: 'Beta invitation not found.', code: 'BETA_INVITE_NOT_FOUND' }, 404);
  await admin.from('access_audit_log').insert({
    user_id: user.id,
    event_type: 'billing.beta_invite_revoked',
    resource_type: 'beta_invite',
    resource_id: inviteId,
    required_plan: 'developer',
    allowed: true,
    metadata: { tier: result.data.tier, duration_days: result.data.duration_days }
  });
  return json(req, { invite: result.data });
}

async function releaseControl(admin: any) {
  const envMode = validMode(Deno.env.get('BILLING_CHECKOUT_MODE') || Deno.env.get('STRIPE_LIVE_CHECKOUT_MODE'));
  const envUsers = String(Deno.env.get('BILLING_CONTROLLED_USER_IDS') || Deno.env.get('STRIPE_LIVE_CONTROLLED_USER_IDS') || '')
    .split(',').map(v => v.trim()).filter(Boolean);

  const { data, error } = await admin
    .from('platform_release_gates')
    .select('status,evidence')
    .eq('gate_key', 'live_billing_lifecycle')
    .maybeSingle();
  if (error) throw error;

  const evidence = data?.evidence && typeof data.evidence === 'object' ? data.evidence : {};
  const gateMode = validMode((evidence as any).checkout_mode || (evidence as any).public_checkout);
  const gateUsers = Array.isArray((evidence as any).controlled_user_ids)
    ? (evidence as any).controlled_user_ids.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    : [];

  return {
    mode: envMode || gateMode || 'closed' as CheckoutMode,
    controlledUsers: new Set(envUsers.length ? envUsers : gateUsers),
    source: envMode ? 'environment_override' : gateMode ? 'release_gate' : 'fail_closed_default',
    liveGatePassed: data?.status === 'passed'
  };
}

async function moveReleaseControl(admin: any) {
  const envMode = validMode(Deno.env.get('MOVE_CHECKOUT_MODE'));
  const envUsers = String(Deno.env.get('MOVE_CONTROLLED_USER_IDS') || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  const { data, error } = await admin
    .from('platform_release_gates')
    .select('status,evidence')
    .eq('gate_key', 'watchdog_move_paid_checkout')
    .maybeSingle();
  if (error) throw error;
  const evidence = data?.evidence && typeof data.evidence === 'object' ? data.evidence : {};
  const gateMode = validMode((evidence as any).checkout_mode);
  const gateUsers = Array.isArray((evidence as any).controlled_user_ids)
    ? (evidence as any).controlled_user_ids.map((v: unknown) => String(v || '').trim()).filter(Boolean)
    : [];
  return {
    mode: envMode || gateMode || 'closed' as CheckoutMode,
    controlledUsers: new Set(envUsers.length ? envUsers : gateUsers),
    source: envMode ? 'environment_override' : gateMode ? 'release_gate' : 'fail_closed_default',
    liveGatePassed: data?.status === 'passed'
  };
}

function configuredPriceId(tier: Tier, cadence: Cadence) {
  const names: Record<Tier, Record<Cadence, string>> = {
    agent: {
      monthly: 'STRIPE_PRICE_AGENT_MONTHLY',
      yearly: 'STRIPE_PRICE_AGENT_YEARLY'
    },
    pro: {
      monthly: 'STRIPE_PRICE_PRO_MONTHLY',
      yearly: 'STRIPE_PRICE_PRO_YEARLY'
    },
    pro_plus: {
      monthly: 'STRIPE_PRICE_PRO_PLUS_MONTHLY',
      yearly: 'STRIPE_PRICE_PRO_PLUS_YEARLY'
    }
  };
  const configured = String(Deno.env.get(names[tier][cadence]) || '').trim();
  return configured || null;
}

function matchesSubscriptionPrice(price: Stripe.Price, tier: Tier, cadence: Cadence) {
  const expected = PRICE_CATALOG[tier][cadence];
  return (
    price.active &&
    price.currency.toLowerCase() === 'usd' &&
    price.unit_amount === expected.amount &&
    price.type === 'recurring' &&
    price.recurring?.interval === (cadence === 'monthly' ? 'month' : 'year')
  );
}

async function resolvePrice(stripe: Stripe, tier: Tier, cadence: Cadence) {
  const override = configuredPriceId(tier, cadence);
  if (override) {
    const price = await stripe.prices.retrieve(override);
    if (!matchesSubscriptionPrice(price, tier, cadence)) {
      throw new Error(`Configured Stripe Price does not match the governed ${tier} ${cadence} catalog entry.`);
    }
    return price;
  }

  const expected = PRICE_CATALOG[tier][cadence];
  const result = await stripe.prices.list({ lookup_keys: [expected.lookup_key], active: true, limit: 10 });
  const matches = result.data.filter(price => matchesSubscriptionPrice(price, tier, cadence));
  if (matches.length !== 1) throw new Error(`Expected exactly one active Stripe Price for ${expected.lookup_key}; found ${matches.length}.`);
  return matches[0];
}

async function resolveMovePrice(stripe: Stripe) {
  const override = String(Deno.env.get('STRIPE_PRICE_WATCHDOG_MOVE') || '').trim();
  if (override) {
    const price = await stripe.prices.retrieve(override);
    if (!price.active || price.currency.toLowerCase() !== 'usd' || price.unit_amount !== MOVE_PRICE.amount || price.type !== 'one_time' || price.recurring) {
      throw new Error('Configured Watchdog Move Stripe Price does not match the governed one-time $29 price.');
    }
    return price;
  }
  const result = await stripe.prices.list({ lookup_keys: [MOVE_PRICE.lookup_key], active: true, limit: 10 });
  const matches = result.data.filter(price =>
    price.currency.toLowerCase() === 'usd' &&
    price.unit_amount === MOVE_PRICE.amount &&
    price.type === 'one_time' &&
    !price.recurring
  );
  if (matches.length !== 1) throw new Error(`Expected exactly one active Stripe Price for ${MOVE_PRICE.lookup_key}; found ${matches.length}.`);
  return matches[0];
}

async function readEntitlement(admin: any, userId: string) {
  return admin
    .from('account_entitlements')
    .select('plan_tier,billing_tier,provider,provider_customer_id,provider_subscription_id,provider_price_id,subscription_status')
    .eq('user_id', userId)
    .maybeSingle();
}

async function redeemBetaTrial(req: Request, body: any, user: any, admin: any, control: any, stripe: Stripe, site: string, isTest: boolean) {
  if (control.mode !== 'controlled') {
    return json(req, { error: 'Closed-beta trials are only available while Watchdog is in controlled launch.', code: 'BETA_TRIAL_UNAVAILABLE' }, 403);
  }

  const code = normalizeBetaCode(body?.code || body?.beta_code);
  if (!/^WDG-(AG|PR|PP)-(30|60)-[A-Z2-9]{12}$/.test(code)) {
    return json(req, { error: 'Enter a valid Watchdog beta invitation code.', code: 'BETA_CODE_INVALID' }, 400);
  }

  const entitlementResult = await readEntitlement(admin, user.id);
  if (entitlementResult.error) return json(req, { error: 'Could not read billing state.', code: 'ENTITLEMENT_READ_FAILED' }, 500);
  const entitlement = entitlementResult.data;
  const hasLiveLikeSubscription = ['active', 'trialing', 'past_due', 'paused'].includes(entitlement?.subscription_status || '');
  if (entitlement?.provider_subscription_id || hasLiveLikeSubscription) {
    return json(req, { error: 'This account already has subscription history and is not eligible for a closed-beta trial.', code: 'BETA_TRIAL_NOT_ELIGIBLE' }, 409);
  }

  const codeHash = await sha256(code);
  const emailHash = user.email ? await sha256(normalizeEmail(user.email)) : '';
  const claimed = await admin.rpc('claim_watchdog_beta_invite', {
    p_code_hash: codeHash,
    p_user_id: user.id,
    p_user_email_hash: emailHash
  });
  if (claimed.error) {
    const message = String(claimed.error.message || '');
    if (message.includes('BETA_CODE_RECIPIENT_MISMATCH')) return json(req, { error: 'This invitation was issued to a different email address.', code: 'BETA_CODE_RECIPIENT_MISMATCH' }, 403);
    if (message.includes('BETA_CODE_REDEMPTION_LIMIT')) return json(req, { error: 'This beta invitation has reached its redemption limit.', code: 'BETA_CODE_REDEMPTION_LIMIT' }, 409);
    if (message.includes('BETA_TRIAL_ALREADY_USED_OR_RESERVED')) return json(req, { error: 'This account has already used or reserved a closed-beta trial.', code: 'BETA_TRIAL_ALREADY_USED' }, 409);
    return json(req, { error: 'This beta invitation is invalid, expired, or no longer active.', code: 'BETA_CODE_INVALID' }, 404);
  }
  const claim = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
  const tier = normalizeTier(claim?.tier);
  const durationDays = Number(claim?.duration_days);
  const redemptionId = String(claim?.redemption_id || '');
  const inviteId = String(claim?.invite_id || '');
  if (!tier || !BETA_TRIAL_DAYS.has(durationDays) || !redemptionId || !inviteId) {
    return json(req, { error: 'The beta invitation could not be resolved safely.', code: 'BETA_CLAIM_INVALID' }, 500);
  }

  let price: Stripe.Price;
  try {
    price = await resolvePrice(stripe, tier, 'monthly');
  } catch (error) {
    await admin.from('billing_beta_redemptions').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { failure: 'price_resolution' } }).eq('id', redemptionId).eq('user_id', user.id);
    const errorCode = isStripeAuthError(error) ? 'STRIPE_API_KEY_INVALID' : 'PRICE_NOT_CONFIGURED';
    return json(req, { error: errorCode === 'STRIPE_API_KEY_INVALID' ? 'Stripe rejected the configured Checkout API credential.' : 'That beta plan price could not be resolved safely.', code: errorCode }, 503);
  }

  const liveMode = price.livemode === true;
  if (liveMode && isTest) {
    await admin.from('billing_beta_redemptions').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { failure: 'test_account_live_object_denied' } }).eq('id', redemptionId).eq('user_id', user.id);
    return json(req, { error: 'Watchdog test accounts cannot create Live Stripe subscription objects.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
  }

  const metadata = {
    supabase_user_id: user.id,
    watchdog_user_id: user.id,
    product: 'watchdog_subscription',
    billing_tier: tier,
    plan_tier: tier,
    billing_interval: 'monthly',
    property_capacity: String(CAPACITY[tier]),
    beta_trial: 'true',
    beta_invite_id: inviteId,
    beta_redemption_id: redemptionId,
    trial_days: String(durationDays),
    trial_requires_payment_method: 'false',
    auto_cancel_without_payment_method: 'true'
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      ...(user.email ? { customer_email: user.email } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: {
        metadata,
        trial_period_days: durationDays,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      },
      payment_method_collection: 'if_required',
      automatic_tax: { enabled: true },
      success_url: `${site}${accountPath(site)}?beta=activated&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}${betaPath(site)}?beta=cancelled`,
      billing_address_collection: 'required',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      integration_identifier: 'watchdog_web_kqrmxpta'
    });

    const redemptionUpdate = await admin.from('billing_beta_redemptions').update({
      status: 'completed',
      checkout_session_id: session.id,
      redeemed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        source: 'closed_beta_invite',
        redemption_state: 'checkout_session_created',
        stripe_mode: liveMode ? 'live' : 'test',
        checkout_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
      }
    }).eq('id', redemptionId).eq('user_id', user.id);
    if (redemptionUpdate.error) {
      console.error('BETA_REDEMPTION_LEDGER_ERROR', redemptionUpdate.error);
      try { await stripe.checkout.sessions.expire(session.id); } catch (_) {}
      return json(req, { error: 'The beta Checkout session could not be recorded safely.', code: 'BETA_REDEMPTION_LEDGER_FAILED' }, 500);
    }

    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: 'billing.beta_trial_checkout_created',
      resource_type: 'checkout_session',
      resource_id: session.id,
      required_plan: tier,
      allowed: true,
      metadata: {
        provider: 'stripe', beta_invite_id: inviteId, beta_redemption_id: redemptionId,
        billing_tier: tier, duration_days: durationDays, price_id: price.id,
        checkout_mode: control.mode, checkout_control_source: control.source,
        stripe_mode: liveMode ? 'live' : 'test', automatic_tax: true,
        payment_method_collection: 'if_required', missing_payment_method_end_behavior: 'cancel',
        checkout_expires_at: session.expires_at || null
      }
    });

    return json(req, {
      provider: 'stripe', destination: 'checkout', url: session.url,
      session_id: session.id, beta_trial: true, tier, cadence: 'monthly',
      trial_days: durationDays, auto_cancel_without_payment_method: true,
      payment_method_required_to_start: false, stripe_mode: liveMode ? 'live' : 'test'
    });
  } catch (error) {
    console.error('STRIPE_BETA_TRIAL_CHECKOUT_ERROR', error);
    await admin.from('billing_beta_redemptions').update({
      status: 'failed', updated_at: new Date().toISOString(),
      metadata: { failure: 'stripe_checkout_create', message: error instanceof Error ? error.message.slice(0, 240) : 'unknown' }
    }).eq('id', redemptionId).eq('user_id', user.id);
    return json(req, { error: 'Could not create the closed-beta Checkout session.', code: 'STRIPE_BETA_TRIAL_CHECKOUT_ERROR' }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Sign in required', code: 'SIGN_IN_REQUIRED' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json(req, { error: 'Sign in required', code: 'SIGN_IN_REQUIRED' }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim().toLowerCase();
  if (action === 'create_beta_invite') return createBetaInvite(req, body, user, userClient, admin);
  if (action === 'list_beta_invites') return listBetaInvites(req, userClient, admin);
  if (action === 'revoke_beta_invite') return revokeBetaInvite(req, body, user, userClient, admin);

  const requestedProduct = String(body?.product || '').trim().toLowerCase();
  const rawTier = String(body?.tier || body?.plan || '').toLowerCase();
  const isMove = requestedProduct === 'watchdog_move' || rawTier === 'move' || rawTier === 'watchdog_move';
  const betaRedeem = action === 'redeem_beta_trial';
  const controlledTrial = !isMove && !betaRedeem && requestedControlledTrial(body);

  let control;
  try {
    control = isMove ? await moveReleaseControl(admin) : await releaseControl(admin);
  } catch (error) {
    console.error(isMove ? 'MOVE_RELEASE_CONTROL_ERROR' : 'BILLING_RELEASE_CONTROL_ERROR', error);
    return json(req, { error: isMove ? 'Watchdog Move enrollment is not available right now.' : 'Paid enrollment is not available right now.', code: isMove ? 'MOVE_RELEASE_CONTROL_ERROR' : 'BILLING_RELEASE_CONTROL_ERROR' }, 503);
  }
  if (control.mode === 'closed') return json(req, { error: isMove ? 'Watchdog Move paid enrollment is not open yet.' : 'Paid enrollment is not open yet.', code: isMove ? 'MOVE_ENROLLMENT_CLOSED' : 'BILLING_ENROLLMENT_CLOSED' }, 503);
  if (!betaRedeem && control.mode === 'controlled' && !control.controlledUsers.has(user.id)) {
    return json(req, { error: isMove ? 'Watchdog Move enrollment is currently limited to controlled launch accounts.' : 'Paid enrollment is currently limited to controlled launch accounts.', code: isMove ? 'MOVE_CONTROLLED_ONLY' : 'BILLING_CONTROLLED_ONLY' }, 403);
  }
  if (control.mode === 'open' && !control.liveGatePassed) {
    return json(req, { error: isMove ? 'Watchdog Move is awaiting final paid lifecycle acceptance.' : 'Paid enrollment is awaiting final Live billing acceptance.', code: isMove ? 'MOVE_GATE_NOT_PASSED' : 'BILLING_GATE_NOT_PASSED' }, 503);
  }
  if (controlledTrial && control.mode !== 'controlled') {
    return json(req, { error: 'The Agent trial is only available inside the controlled launch.', code: 'CONTROLLED_TRIAL_UNAVAILABLE' }, 403);
  }

  const stripeKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '').trim();
  if (!stripeKey) return json(req, { error: 'Stripe Checkout is not configured yet.', code: 'STRIPE_NOT_CONFIGURED' }, 503);

  const stripe = new Stripe(stripeKey, { apiVersion: '2026-06-24.dahlia' });
  const site = requestSite(req);
  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });

  if (betaRedeem) return redeemBetaTrial(req, body, user, admin, control, stripe, site, Boolean(isTest));

  if (isMove) {
    let price: Stripe.Price;
    try {
      price = await resolveMovePrice(stripe);
    } catch (error) {
      console.error('STRIPE_MOVE_PRICE_RESOLUTION_ERROR', error);
      const code = isStripeAuthError(error) ? 'STRIPE_API_KEY_INVALID' : 'MOVE_PRICE_NOT_CONFIGURED';
      const message = code === 'STRIPE_API_KEY_INVALID'
        ? 'Stripe rejected the configured Checkout API credential.'
        : 'The Watchdog Move price could not be resolved safely in this environment.';
      return json(req, { error: message, code }, 503);
    }
    const liveMode = price.livemode === true;
    if (liveMode && isTest) return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
    const priceId = price.id;

    const metadata = {
      supabase_user_id: user.id,
      watchdog_user_id: user.id,
      product: 'watchdog_move',
      duration_days: '90',
      auto_renew: 'false'
    };

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        ...(user.email ? { customer_email: user.email } : {}),
        client_reference_id: user.id,
        metadata,
        payment_intent_data: { metadata },
        success_url: `${site}/move/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/move/?checkout=cancelled`,
        billing_address_collection: 'auto',
        integration_identifier: 'watchdog_web_kqrmxpta'
      });

      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.move_checkout_created',
        resource_type: 'checkout_session',
        resource_id: session.id,
        required_plan: 'standard',
        allowed: true,
        metadata: {
          provider: 'stripe',
          product: 'watchdog_move',
          duration_days: 90,
          price_id: priceId,
          checkout_mode: control.mode,
          checkout_control_source: control.source,
          stripe_mode: liveMode ? 'live' : 'test',
          return_site: site
        }
      });

      return json(req, {
        provider: 'stripe',
        product: 'watchdog_move',
        destination: 'checkout',
        url: session.url,
        session_id: session.id,
        duration_days: 90,
        auto_renew: false,
        stripe_mode: liveMode ? 'live' : 'test'
      });
    } catch (error) {
      console.error('STRIPE_MOVE_CHECKOUT_ERROR', error);
      return json(req, { error: error instanceof Error ? error.message : 'Could not create Watchdog Move Checkout.', code: 'STRIPE_MOVE_CHECKOUT_ERROR' }, 502);
    }
  }

  if (rawTier === 'teams') return json(req, { error: 'Teams enrollment is not open yet.', code: 'TEAMS_ENROLLMENT_CLOSED' }, 409);
  if (!['agent', 'pro', 'pro_plus', 'pro+'].includes(rawTier)) return json(req, { error: 'Choose Agent, Pro, or Pro+.', code: 'INVALID_PLAN' }, 400);
  const tier = (rawTier === 'pro+' ? 'pro_plus' : rawTier) as Tier;
  if (controlledTrial && tier !== 'agent') return json(req, { error: 'The controlled trial is limited to Agent.', code: 'CONTROLLED_TRIAL_AGENT_ONLY' }, 400);
  const cadence: Cadence = controlledTrial ? 'monthly' : (String(body?.cadence || 'yearly').toLowerCase() === 'monthly' ? 'monthly' : 'yearly');

  const { data: entitlement, error: entitlementError } = await readEntitlement(admin, user.id);
  if (entitlementError) return json(req, { error: 'Could not read billing state.', code: 'ENTITLEMENT_READ_FAILED' }, 500);

  const hasLiveLikeSubscription = ['active', 'trialing', 'past_due', 'paused'].includes(entitlement?.subscription_status || '');
  if (entitlement?.provider === 'paddle' && entitlement?.provider_subscription_id && hasLiveLikeSubscription) {
    return json(req, {
      error: 'This account still has a legacy Paddle subscription. Contact Watchdog support before starting Stripe billing so you are not charged twice.',
      code: 'LEGACY_SUBSCRIPTION_MIGRATION_REQUIRED'
    }, 409);
  }

  if (entitlement?.provider === 'stripe' && entitlement?.provider_customer_id && entitlement?.provider_subscription_id && hasLiveLikeSubscription) {
    try {
      const portal = await stripe.billingPortal.sessions.create({ customer: entitlement.provider_customer_id, return_url: `${site}${accountPath(site)}` });
      await admin.from('access_audit_log').insert({
        user_id: user.id,
        event_type: 'billing.existing_subscription_redirected_to_portal',
        resource_type: 'subscription',
        resource_id: entitlement.provider_subscription_id,
        required_plan: tier,
        allowed: true,
        metadata: { provider: 'stripe', requested_tier: tier, requested_cadence: cadence, current_price_id: entitlement.provider_price_id, checkout_control_source: control.source, return_site: site }
      });
      return json(req, { provider: 'stripe', destination: 'portal', url: portal.url });
    } catch (error) {
      console.error('STRIPE_PORTAL_FROM_CHECKOUT_ERROR', error);
      return json(req, { error: 'Could not open Stripe billing management.', code: 'STRIPE_PORTAL_ERROR' }, 502);
    }
  }

  if (controlledTrial) {
    if (entitlement?.provider_subscription_id) {
      return json(req, { error: 'This account is not eligible for the first-use Agent trial.', code: 'CONTROLLED_TRIAL_NOT_ELIGIBLE' }, 409);
    }
    const priorTrial = await admin
      .from('access_audit_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_type', 'billing.controlled_agent_trial_checkout_created')
      .limit(1)
      .maybeSingle();
    if (priorTrial.error) return json(req, { error: 'Could not verify trial eligibility.', code: 'CONTROLLED_TRIAL_ELIGIBILITY_FAILED' }, 500);
    if (priorTrial.data) return json(req, { error: 'This account has already used the controlled Agent trial.', code: 'CONTROLLED_TRIAL_ALREADY_USED' }, 409);
  }

  let price: Stripe.Price;
  try {
    price = await resolvePrice(stripe, tier, cadence);
  } catch (error) {
    console.error('STRIPE_PRICE_RESOLUTION_ERROR', error);
    const code = isStripeAuthError(error) ? 'STRIPE_API_KEY_INVALID' : 'PRICE_NOT_CONFIGURED';
    const message = code === 'STRIPE_API_KEY_INVALID'
      ? 'Stripe rejected the configured Checkout API credential.'
      : 'That Stripe price could not be resolved safely in this environment.';
    return json(req, { error: message, code }, 503);
  }
  const liveMode = price.livemode === true;
  if (liveMode && isTest) return json(req, { error: 'Watchdog test accounts cannot create real charges.', code: 'WATCHDOG_TEST_NO_REAL_SPEND' }, 403);
  const priceId = price.id;

  const account = accountPath(site);
  const customerId = entitlement?.provider === 'stripe' ? entitlement.provider_customer_id : null;
  const metadata = {
    supabase_user_id: user.id,
    watchdog_user_id: user.id,
    product: 'watchdog_subscription',
    billing_tier: tier,
    plan_tier: tier,
    billing_interval: cadence,
    property_capacity: String(CAPACITY[tier]),
    ...(controlledTrial ? {
      trial_offer: CONTROLLED_AGENT_TRIAL.offer,
      trial_days: String(CONTROLLED_AGENT_TRIAL.days),
      trial_requires_payment_method: 'false'
    } : {})
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerId ? { customer: customerId } : user.email ? { customer_email: user.email } : {}),
      ...(customerId ? { customer_update: { address: 'auto' } } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: controlledTrial ? {
        metadata,
        trial_period_days: CONTROLLED_AGENT_TRIAL.days,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      } : { metadata },
      ...(controlledTrial ? { payment_method_collection: 'if_required' as const } : {}),
      automatic_tax: { enabled: true },
      success_url: `${site}${account}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}${account}?checkout=cancelled`,
      billing_address_collection: 'required',
      integration_identifier: 'watchdog_web_kqrmxpta'
    });

    await admin.from('access_audit_log').insert({
      user_id: user.id,
      event_type: controlledTrial ? 'billing.controlled_agent_trial_checkout_created' : 'billing.checkout_created',
      resource_type: 'checkout_session',
      resource_id: session.id,
      required_plan: tier,
      allowed: true,
      metadata: {
        provider: 'stripe', billing_tier: tier, cadence, price_id: priceId,
        checkout_mode: control.mode, checkout_control_source: control.source,
        stripe_mode: liveMode ? 'live' : 'test', return_site: site,
        automatic_tax: true,
        ...(controlledTrial ? {
          trial_offer: CONTROLLED_AGENT_TRIAL.offer,
          trial_days: CONTROLLED_AGENT_TRIAL.days,
          payment_method_collection: 'if_required',
          missing_payment_method_end_behavior: 'cancel'
        } : {})
      }
    });

    return json(req, {
      provider: 'stripe', destination: 'checkout', url: session.url,
      session_id: session.id, tier, cadence, stripe_mode: liveMode ? 'live' : 'test',
      ...(controlledTrial ? { trial: true, trial_days: CONTROLLED_AGENT_TRIAL.days, auto_cancel_without_payment_method: true } : {})
    });
  } catch (error) {
    console.error('STRIPE_CHECKOUT_ERROR', error);
    return json(req, { error: error instanceof Error ? error.message : 'Could not create Stripe Checkout.', code: 'STRIPE_CHECKOUT_ERROR' }, 502);
  }
});

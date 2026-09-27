// Shared PostcardMania (PCM Integrations) Direct Mail API v3 client.
//
// Contract (PCM v3 docs, retrieved 2026-09-27):
//   Base URL        https://v3.pcmintegrations.com
//   Login           POST /auth/login {apiKey, apiSecret, childRefNbr?} -> {token, expires}
//   Child accounts  childRefNbr (<= 50 chars) scopes designs and orders to one agent.
//   Sandbox keys    orders are accepted but never printed or billed.
//
// Every Watchdog agent is a PCM child account keyed by their Supabase user id, so
// their designs, proofs and orders stay separate from every other agent's.

export const PCM_BASE = (Deno.env.get('PCM_API_BASE_URL') || 'https://v3.pcmintegrations.com').replace(/\/+$/, '');
export const PCM_PORTAL = 'https://portal.pcmintegrations.com';
export const PCM_POSTCARD_SIZE = '68'; // 6 x 8.5
export const PCM_POSTCARD_SIZE_LABEL = '6 x 8.5';

export type PcmEnvironment = 'live' | 'sandbox';

function clean(value: unknown, max = 500) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

export function pcmCredentials(environment: PcmEnvironment) {
  if (environment === 'sandbox') {
    return {
      key: clean(Deno.env.get('PCM_SANDBOX_API_KEY'), 1000),
      secret: clean(Deno.env.get('PCM_SANDBOX_API_SECRET') || Deno.env.get('PCM_API_SECRET'), 2000),
    };
  }
  return {
    key: clean(Deno.env.get('PCM_API_KEY'), 1000),
    secret: clean(Deno.env.get('PCM_API_SECRET'), 2000),
  };
}

export function pcmConfigured(environment: PcmEnvironment) {
  const c = pcmCredentials(environment);
  return Boolean(c.key && c.secret);
}

export function childRef(userId: string) {
  return clean(userId, 50);
}

const tokens = new Map<string, { token: string; until: number }>();

export async function pcmLogin(environment: PcmEnvironment, child: string) {
  const cacheKey = `${environment}:${child}`;
  const hit = tokens.get(cacheKey);
  if (hit && Date.now() < hit.until) return hit.token;
  const { key, secret } = pcmCredentials(environment);
  if (!key || !secret) throw new PcmError(503, 'PCM_NOT_CONNECTED', `PCM ${environment} credentials are not connected`);
  const res = await fetch(PCM_BASE + '/auth/login', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key, apiSecret: secret, ...(child ? { childRefNbr: child } : {}) }),
  });
  const data: any = await res.json().catch(() => ({}));
  const token = clean(data?.token ?? data?.accessToken ?? data?.access_token, 4000);
  if (!res.ok || !token) throw new PcmError(502, 'PCM_LOGIN_FAILED', `PCM ${environment} login failed (${res.status})`);
  const expires = Date.parse(String(data?.expires || ''));
  // Refresh ten minutes early; PCM tokens last about 24 hours.
  const until = Number.isFinite(expires) ? expires - 10 * 60000 : Date.now() + 50 * 60000;
  tokens.set(cacheKey, { token, until });
  return token;
}

export class PcmError extends Error {
  status: number;
  code: string;
  detail: unknown;
  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function providerMessage(data: any) {
  const e = data?.error;
  const parts = [clean(e?.message ?? data?.message ?? '', 300)];
  if (Array.isArray(e?.data)) {
    for (const item of e.data.slice(0, 5)) {
      const m = clean(item?.message, 200);
      if (m) parts.push(item?.property ? `${clean(item.property, 60)}: ${m}` : m);
    }
  }
  return parts.filter(Boolean).join(' · ');
}

export async function pcmRequest(
  environment: PcmEnvironment,
  child: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const token = await pcmLogin(environment, child);
  const res = await fetch(PCM_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 204) return { status: 204, data: null as any };
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: clean(text, 300) };
  }
  if (!res.ok) {
    throw new PcmError(res.status, 'PCM_REQUEST_FAILED', `PCM ${method} ${path.split('?')[0]} failed (${res.status})${providerMessage(data) ? ': ' + providerMessage(data) : ''}`, data);
  }
  return { status: res.status, data };
}

export function editorUrl(designId: string | number, token: string) {
  return `${PCM_PORTAL}/integrated/embed/editor/${encodeURIComponent(String(designId))}?token=${encodeURIComponent(token)}`;
}

// PCM stops accepting cancellations at 11:30 PM Eastern on the day an order is
// placed; after that it is batched to print.
export function cancelDeadline(submittedAt: string | Date) {
  const placed = new Date(submittedAt);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'shortOffset',
  }).formatToParts(placed);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const offset = (get('timeZoneName').match(/GMT([+-]\d+)/)?.[1]) || '-5';
  const hours = String(Math.abs(Number(offset))).padStart(2, '0');
  const sign = Number(offset) < 0 ? '-' : '+';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T23:30:00${sign}${hours}:00`);
}

export type ReturnAddress = {
  company?: string;
  firstName?: string;
  lastName?: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
};

export function returnAddressFrom(value: any): ReturnAddress | null {
  const address = clean(value?.address, 140);
  const city = clean(value?.city, 80);
  const state = clean(value?.state, 2).toUpperCase();
  const zipCode = clean(value?.zipCode ?? value?.zip, 10).replace(/[^\d-]/g, '');
  const company = clean(value?.company, 100);
  if (!address || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(-\d{4})?$/.test(zipCode) || !company) return null;
  const out: ReturnAddress = { company, address, city, state, zipCode };
  const address2 = clean(value?.address2, 80);
  if (address2) out.address2 = address2;
  const firstName = clean(value?.firstName, 60);
  const lastName = clean(value?.lastName, 60);
  if (firstName) out.firstName = firstName;
  if (lastName) out.lastName = lastName;
  return out;
}

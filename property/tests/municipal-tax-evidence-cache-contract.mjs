// municipal-property-tax-evidence used to call Edmunds WIPP (3-4 requests) on every
// Property Home load. Runs the function's own handler against a fake WIPP API: a matched
// record and a definite miss are reused, town metadata is reused across addresses,
// transient provider failures are not cached, and sign-in is still required first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const raw = fs.readFileSync('supabase/functions/municipal-property-tax-evidence/index.ts', 'utf8');
assert.match(raw, /\nDeno\.serve\(async\(req:Request\)=>\{/, 'handler entry point');
const ts = raw
  .split('\n').filter((line) => !/^import\s/.test(line)).join('\n')
  .replace('\nDeno.serve(async(req:Request)=>{', '\n__serve(async(req:Request)=>{');
const js = stripTypeScriptTypes(ts);

const calls = [];
let searchStatus = 200;
let searchRows = [{ propertyLoc: '12 MAIN ST', accountId: 'A1', blqId: '1.2', ownerName: 'X' }];
async function fakeFetch(url) {
  const u = String(url);
  calls.push(u.replace('https://api.edmundsgovtech.cloud/wipp-core/v1', ''));
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (u.includes('/metadata/')) return json(200, { cityName: 'Absecon City' });
  if (u.includes('/wippPropInfo/search')) return searchStatus === 200 ? json(200, { content: searchRows }) : json(searchStatus, null);
  if (u.includes('/wippTaxes/')) return json(200, { propertyInfo: { totalAssessedValue: 300000 }, taxYears: {} });
  return json(404, null);
}
let handler = null;
const fakeDeno = { env: { get: () => 'configured' } };
const fakeCreateClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
new Function('__serve', 'fetch', 'Deno', 'createClient', js)((h) => { handler = h; }, fakeFetch, fakeDeno, fakeCreateClient);
assert.ok(handler, 'handler registered');

const call = async (body, auth = 'Bearer token') => {
  const res = await handler(new Request('https://fn.local/', { method: 'POST', headers: { origin: 'https://www.watchdogindex.com', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const home = { municipality_code: '0101', address: '12 Main Street', block: '1', lot: '2' };

// 1. First load asks WIPP (metadata, search, detail); the second load is served from cache.
let r = await call(home);
assert.equal(r.body.status, 'exact_match');
assert.deepEqual(calls.map((c) => c.split('?')[0]), ['/metadata/0101', '/wippPropInfo/search', '/wippTaxes/A1']);
r = await call({ ...home, address: '12 MAIN ST' });
assert.equal(r.body.status, 'exact_match');
assert.equal(r.body.cache, 'hit', 'same parcel, same normalized address: cache hit');
assert.equal(calls.length, 3, 'no new WIPP requests');

// 2. Another address in the same town reuses the town metadata.
searchRows = [{ propertyLoc: '9 OAK AVE', accountId: 'B2', blqId: '3.4' }];
r = await call({ municipality_code: '0101', address: '9 Oak Avenue', block: '3', lot: '4' });
assert.equal(r.body.status, 'exact_match');
assert.deepEqual(calls.slice(3).map((c) => c.split('?')[0]), ['/wippPropInfo/search', '/wippTaxes/B2'], 'metadata not requested again');

// 3. A definite miss is cached; a transient failure is not.
searchRows = [];
r = await call({ municipality_code: '0101', address: '1 Nowhere Rd', block: '9', lot: '9' });
assert.equal(r.body.status, 'no_exact_match');
const afterMiss = calls.length;
r = await call({ municipality_code: '0101', address: '1 Nowhere Rd', block: '9', lot: '9' });
assert.equal(r.body.cache, 'hit');
assert.equal(calls.length, afterMiss, 'miss served from cache');
searchStatus = 503;
r = await call({ municipality_code: '0101', address: '5 Elm St', block: '5', lot: '5' });
assert.equal(r.body.status, 'provider_search_unavailable');
const afterFail = calls.length;
r = await call({ municipality_code: '0101', address: '5 Elm St', block: '5', lot: '5' });
assert.equal(r.body.status, 'provider_search_unavailable');
assert.ok(calls.length > afterFail, 'transient failure is retried, never cached');

// 4. Sign-in is checked before the cache.
r = await call(home, null);
assert.equal(r.status, 401);
assert.equal(r.body.cache, undefined);

console.log('Municipal tax evidence cache contract passed.');

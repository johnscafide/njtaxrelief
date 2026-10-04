import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Town Needs: the public /town-needs page, its submission route and the Backoffice review queue.
// Runs both server routes against a fake Supabase so the rules are checked, not just the text.
const read = (p) => fs.readFileSync(p, 'utf8');
const require = createRequire(import.meta.url);
const needs = JSON.parse(read('property/data/municipal-requirements/town-needs.json'));
const migration = read('supabase/migrations/20260930210000_town_info_submissions.sql');
const correctionMigration = read('supabase/migrations/20261004130000_town_info_submissions_corrections.sql');
// The Add / Report a correction form now lives on each town page (/co/<county>/<town>).
const coPage = read('api/_co-pages.js') + read('co/co-town.js');
const page = read('property/town-needs/index.html');
const pageJs = read('property/js/town-needs.js');
const reviewPage = read('property/backoffice/town-info/index.html');
const vercel = JSON.parse(read('vercel.json'));

// ---------- data ----------
const KEYS = ['co_required', 'co_fee', 'co_contact', 'fire_fee', 'fire_contact'];
assert.deepEqual(Object.keys(needs.needs), KEYS.concat(['correction']), 'need keys, plus correction for /co');
assert.ok(needs.towns.length > 0, 'there are towns to list');
for (const t of needs.towns) {
  assert.match(t.code, /^\d{4}$/, `${t.town}: code`);
  assert.ok(t.needs.length && t.needs.every((k) => KEYS.includes(k)), `${t.code}: needs`);
  assert.equal(typeof t.live, 'boolean', `${t.code}: live flag`);
}
assert.ok(!JSON.stringify(needs).match(/"(phone|email|evidence|fees)"/), 'the public list carries only towns and missing items, never research');

// ---------- database ----------
assert.match(migration, /enable row level security/, 'RLS on');
assert.match(migration, /revoke all on table public\.town_info_submissions from public, anon, authenticated/, 'service role only');
assert.match(migration, /check \(source_url is not null or file_path is not null\)/, 'a document or link is required in the database too');
assert.match(migration, /\('town-info-submissions', 'town-info-submissions', false, 10485760/, 'uploads stay private, 10 MB');
assert.match(migration, /\('town-info-evidence', 'town-info-evidence', true, 10485760/, 'approved files go to a public evidence bucket');
for (const k of KEYS) assert.ok(migration.includes(`'${k}'`), `migration allows ${k}`);
for (const k of KEYS.concat(['correction'])) assert.ok(correctionMigration.includes(`'${k}'`), `corrections migration keeps ${k}`);
assert.match(correctionMigration, /drop constraint if exists town_info_submissions_need_keys_check/, 'replaces the need key check by name');

// ---------- routing ----------
assert.ok(vercel.rewrites.some((r) => r.source === '/backoffice/town-info' && r.destination === '/property/backoffice/town-info/index.html'), 'review page route');
assert.ok(vercel.rewrites.some((r) => r.source === '/town-needs'), 'public page route');
assert.equal(vercel.functions['api/watchdog-town-needs.js'].includeFiles, '{property/data/municipal-requirements/town-needs.json,co/towns.json}', 'the submission route ships with the needs list and the full NJ town list');

// ---------- public page ----------
assert.match(page, /<link rel="canonical" href="https:\/\/www\.watchdogindex\.com\/town-needs">/, 'canonical clean URL');
assert.match(page, /<meta name="robots" content="noindex,follow">/, 'shared by link, not indexed');
assert.ok(!/<a\b[^>]*href="\/property\//.test(page), 'no /property/ links');
assert.match(page, /A document or a link to the town's page is required\. A typed answer alone isn't enough\./, 'the rule is stated');
assert.match(page, /name="website" tabindex="-1"/, 'spam trap field');
assert.match(pageJs, /API = '\/api\/watchdog-town-needs'/, 'posts to the same-origin route');
assert.ok((pageJs.match(/innerHTML/g) || []).length === 1 && /content-architecture: dynamic — the shared site footer partial\.\n\s*host\.innerHTML = html;/.test(pageJs), 'town data is set with textContent; only the shared footer uses innerHTML');
assert.match(pageJs, /if \(!file && !link\) return status\(form,/, 'the form asks for a document or link before sending');

// ---------- Backoffice ----------
for (const p of ['property/backoffice/index.html', 'property/backoffice/reviews/index.html', 'property/backoffice/professional-verifications/index.html', 'property/backoffice/town-info/index.html', 'property/backoffice/realestate/index.html']) {
  assert.match(read(p), /<a href="\/backoffice\/town-info"[^>]*data-bo-dev-only hidden>Town Info <span class="bo-review-badge" data-bo-badge="town" hidden>/, `${p}: Town Info nav link`);
}
assert.match(read('property/backoffice/backoffice-shell.js'), /refreshCount\(TOWN_INFO_API,'town'\)/, 'waiting count badge');
assert.match(reviewPage, /data-access-require="developer"/, 'review page keeps the developer gate');

// ---------- fake Supabase ----------
const URL_BASE = 'https://fake.supabase.test';
process.env.SUPABASE_URL = URL_BASE;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
let calls = [], state = {};
function reset(extra) { calls = []; state = Object.assign({ rows: [], objects: {}, allowed: true, developer: true, operator: true }, extra || {}); }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, headers) }); }
globalThis.fetch = async (input, opts = {}) => {
  const url = String(input), method = (opts.method || 'GET').toUpperCase();
  calls.push({ url, method, body: opts.body, headers: opts.headers || {} });
  const path = url.slice(URL_BASE.length);
  if (path.startsWith('/rest/v1/rpc/consume_public_request_budget')) return json([{ allowed: state.allowed, remaining: 1 }]);
  if (path.startsWith('/rest/v1/rpc/record_public_request_security_event')) return new Response(null, { status: 204 });
  if (path.startsWith('/rest/v1/rpc/is_watchdog_developer')) return json(state.developer);
  if (path.startsWith('/auth/v1/user')) return json({ id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com' });
  if (path.startsWith('/rest/v1/backoffice_operators')) return json(state.operator ? [{ user_id: '11111111-1111-4111-8111-111111111111' }] : []);
  if (path.startsWith('/rest/v1/town_info_submissions')) {
    if (method === 'POST') { state.rows.push(Object.assign({ status: 'pending' }, JSON.parse(opts.body))); return new Response(null, { status: 201 }); }
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${state.rows.filter((r) => r.status === 'pending').length}` } });
    const id = (path.match(/id=eq\.([0-9a-f-]{36})/) || [])[1];
    const found = state.rows.filter((r) => (!id || r.id === id) && (!/status=eq\.pending/.test(path) || r.status === 'pending'));
    if (method === 'PATCH') { found.forEach((r) => Object.assign(r, JSON.parse(opts.body))); return json(found); }
    return json(found);
  }
  if (path.startsWith('/storage/v1/object/upload/sign/')) return json({ url: '/object/upload/sign/' + path.split('/upload/sign/')[1] + '?token=t' });
  if (path.startsWith('/storage/v1/object/authenticated/')) { const key = path.split('/authenticated/')[1]; return state.objects[key] ? new Response(state.objects[key], { status: 200 }) : json({ error: 'not found' }, 404); }
  if (path.startsWith('/storage/v1/object/sign/')) return json({ signedURL: '/object/sign/x?token=v' });
  if (method === 'DELETE' && path.startsWith('/storage/v1/object/')) { JSON.parse(opts.body).prefixes.forEach((p) => { delete state.objects[path.split('/object/')[1] + '/' + p]; }); return json([]); }
  if (method === 'POST' && path.startsWith('/storage/v1/object/town-info-evidence/')) { state.objects[path.split('/object/')[1]] = opts.body; return json({ Key: 'ok' }); }
  throw new Error('unexpected fetch ' + method + ' ' + url);
};
function reqRes(body, headers = {}) {
  const res = { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { method: 'POST', body, headers: Object.assign({ host: 'www.watchdogindex.com', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0', origin: 'https://www.watchdogindex.com' }, headers) };
  return { req, res };
}

// ---------- public submission route ----------
const submit = require('../../api/watchdog-town-needs.js');
const { sniff, sameFamily, safeFileName, httpsUrl } = submit._test;
assert.equal(sniff(Buffer.from('%PDF-1.7\n')), 'application/pdf');
assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
assert.equal(sniff(Buffer.from('<html>not a pdf')), '');
assert.ok(sameFamily('image/heif', 'image/heic') && !sameFamily('application/pdf', 'image/png'));
assert.equal(safeFileName('../../Fee Sheet (2026).PDF', 'application/pdf'), 'Fee-Sheet-2026.pdf', 'file names are made safe');
assert.equal(httpsUrl('http://town.gov/x'), null, 'http links are refused');
assert.equal(httpsUrl('https://10.0.0.1/x'), null, 'IP links are refused');
const town = needs.towns[0];
const base = { action: 'start', code: town.code, needs: [town.needs[0], 'not_a_need'], answer: 'The fee is $100.', elapsed_ms: 9000 };

reset();
let t = reqRes(Object.assign({}, base));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'a typed answer alone is refused');
assert.match(t.res.body.error, /A typed answer alone isn’t enough/);

reset();
t = reqRes(Object.assign({}, base, { source_url: 'https://www.example-town.gov/construction' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 201, 'link-only submission accepted');
assert.equal(state.rows.length, 1);
assert.deepEqual(state.rows[0].need_keys, [town.needs[0]], 'only this town\'s needs are kept');
assert.equal(state.rows[0].file_status, 'none');
assert.equal(state.rows[0].municipality_name, town.town, 'town name comes from the list, not the request');
assert.equal(state.rows[0].client_hash.length, 64, 'client is stored as a keyed hash, not an IP');

// /co: any NJ town can get a submission, even one not on the needs list yet.
const coTowns = JSON.parse(read('co/towns.json')).towns;
const unlisted = coTowns.find((x) => !needs.towns.some((n) => n.code === x.c));
reset();
t = reqRes(Object.assign({}, base, { code: unlisted.c, needs: KEYS.concat(['not_a_need']), source_url: 'https://www.example-town.gov/co' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 201, 'a town not on the needs list is accepted');
assert.deepEqual(state.rows[0].need_keys, KEYS, 'every real need is kept for it, nothing else');
assert.equal(state.rows[0].municipality_name, unlisted.n, 'its name comes from the full town list');
// /co "Report a correction": any town, correction only, and it must say what's wrong.
assert.match(coPage, /data-fix>Report a correction<\/button>/, 'town pages have the Report a correction button');
assert.match(coPage, /needs: fixing \? \['correction'\] : NEED_KEYS/, 'town pages send the correction key');
const liveCode = Object.keys(JSON.parse(read('property/data/municipal-requirements/approvals.json')).towns)[0];
reset();
t = reqRes(Object.assign({}, base, { code: liveCode, needs: ['correction', 'co_fee'], answer: 'The fee is now $150.', source_url: 'https://www.example-town.gov/fees' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 201, 'a correction for a live town is accepted');
assert.deepEqual(state.rows[0].need_keys, ['correction'], 'a correction stands alone');
assert.equal(state.rows[0].answer, 'The fee is now $150.');
reset();
t = reqRes(Object.assign({}, base, { code: liveCode, needs: ['correction'], answer: '  ', source_url: 'https://www.example-town.gov/fees' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'a correction has to say what is wrong');
reset();
t = reqRes(Object.assign({}, base, { code: liveCode, needs: ['correction'], answer: 'Wrong phone.' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'a correction still needs a document or link');

reset();
t = reqRes(Object.assign({}, base, { code: '9999', source_url: 'https://x.gov/y' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'a code that is no NJ town is refused');

reset();
t = reqRes(Object.assign({}, base, { website: 'spam.example' , source_url: 'https://x.gov/y' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 200);
assert.equal(state.rows.length, 0, 'spam trap: nothing stored');

reset();
t = reqRes(Object.assign({}, base, { source_url: 'https://x.gov/y' }), { host: 'evil.example.com', origin: 'https://evil.example.com' });
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 403, 'other sites cannot post');

reset();
t = reqRes(Object.assign({}, base, { source_url: 'https://x.gov/y' }), { 'user-agent': 'python-requests/2.31' });
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 403, 'scripts are blocked');

reset({ allowed: false });
t = reqRes(Object.assign({}, base, { source_url: 'https://x.gov/y' }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 429, 'rate limited');

reset();
t = reqRes(Object.assign({}, base, { file: { name: 'fees.exe', type: 'application/x-msdownload', size: 100 } }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'only PDFs and photos');
t = reqRes(Object.assign({}, base, { file: { name: 'big.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 } }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, '10 MB limit');

reset();
t = reqRes(Object.assign({}, base, { file: { name: 'Fee sheet.pdf', type: 'application/pdf', size: 2048 } }));
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 201, 'file submission accepted');
const row = state.rows[0];
assert.match(row.file_path, /^pending\/[0-9a-f-]{36}\/Fee-sheet\.pdf$/);
assert.equal(row.file_status, 'awaiting_upload');
assert.equal(t.res.body.upload_url, `${URL_BASE}/storage/v1/object/upload/sign/town-info-submissions/${row.file_path}?token=t`, 'one-time upload URL into the private bucket');
state.objects[`town-info-submissions/${row.file_path}`] = Buffer.from('<html>not a pdf</html>');
t = reqRes({ action: 'finish', id: row.id });
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 422, 'a file that is not really a PDF is refused');
assert.equal(row.file_status, 'rejected_type');
assert.equal(row.status, 'rejected', 'no link either, so the submission is closed');
assert.ok(!state.objects[`town-info-submissions/${row.file_path}`], 'and the file is deleted');

reset();
t = reqRes(Object.assign({}, base, { file: { name: 'fees.pdf', type: 'application/pdf', size: 2048 } }));
await submit(t.req, t.res);
const good = state.rows[0];
state.objects[`town-info-submissions/${good.file_path}`] = Buffer.from('%PDF-1.4 real');
t = reqRes({ action: 'finish', id: good.id });
await submit(t.req, t.res);
assert.equal(t.res.statusCode, 200);
assert.equal(good.file_status, 'uploaded', 'real PDF kept for review');
assert.equal(good.status, 'pending', 'nothing goes live on its own');

// ---------- Backoffice review route ----------
const review = (await import('../../api/watchdog-backoffice-town-needs.js')).default;
const auth = { authorization: 'Bearer user-token' };
reset({ developer: false });
t = reqRes({ action: 'list' }, auth);
await review(t.req, t.res);
assert.equal(t.res.statusCode, 403, 'non-developers are refused');
reset({ operator: false });
t = reqRes({ action: 'list' }, auth);
await review(t.req, t.res);
assert.equal(t.res.statusCode, 403, 'developers who are not the Backoffice owner are refused');
reset();
t = reqRes({ action: 'list' });
await review(t.req, t.res);
assert.equal(t.res.statusCode, 401, 'signed out is refused');

reset();
const pendingRow = Object.assign({}, good, { status: 'pending' });
state.rows.push(pendingRow);
state.objects[`town-info-submissions/${pendingRow.file_path}`] = Buffer.from('%PDF-1.4 real');
t = reqRes({ action: 'review', id: pendingRow.id, status: 'approved', note: 'Matches the fee sheet' }, auth);
await review(t.req, t.res);
assert.equal(t.res.statusCode, 200, 'owner can approve');
assert.equal(pendingRow.status, 'approved');
assert.equal(pendingRow.reviewed_by, '11111111-1111-4111-8111-111111111111');
assert.equal(pendingRow.evidence_url, `${URL_BASE}/storage/v1/object/public/town-info-evidence/${pendingRow.municipality_code}/${pendingRow.id}/fees.pdf`, 'approved file becomes the public source');
assert.ok(state.objects[`town-info-evidence/${pendingRow.municipality_code}/${pendingRow.id}/fees.pdf`], 'copied to the evidence bucket');
assert.ok(!state.objects[`town-info-submissions/${pendingRow.file_path}`], 'private copy removed');
t = reqRes({ action: 'review', id: pendingRow.id, status: 'rejected' }, auth);
await review(t.req, t.res);
assert.equal(t.res.statusCode, 409, 'a decision cannot be made twice');

reset();
const linkRow = { id: '22222222-2222-4222-8222-222222222222', municipality_code: town.code, municipality_name: town.town, need_keys: [town.needs[0]], source_url: 'https://x.gov/y', file_path: null, file_status: 'none', status: 'pending' };
state.rows.push(linkRow);
t = reqRes({ action: 'review', id: linkRow.id, status: 'rejected', note: 'Wrong town' }, auth);
await review(t.req, t.res);
assert.equal(t.res.statusCode, 200);
assert.equal(linkRow.status, 'rejected');
assert.equal(linkRow.evidence_url, null, 'rejected info has no source');

console.log(`Town Needs contract passed (${needs.towns.length} towns listed).`);

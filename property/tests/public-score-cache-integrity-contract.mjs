// The public score cache (public_watchdog_score_cache_v1) is keyed by PIN and read by
// property pages, search and alerts, so the public_score mode must never write a score
// built from caller-supplied facts. Runs workbench-score's own handlePublicScore against
// a fake database: precomputed rows are served even when the caller sends other values,
// parcels we hold are scored from our facts, parcels we do not hold are never cached,
// and a score without SR-1A evidence never replaces a stored one.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('supabase/functions/workbench-score/index.ts', 'utf8');
const pick = (name) => {
  const m = src.match(new RegExp('(?:^|\\n)((?:async function|function|const) ' + name + '\\b[\\s\\S]*?\\n\\}\\n)'));
  assert.ok(m, `workbench-score defines ${name}`);
  return m[1];
};
const code = ['stripZero', 'canonicalPin', 'clean', 'num', 'hashPublicFacts', 'warehouseFacts', 'sanitizePublicRow', 'cachedComponents', 'handlePublicScore']
  .map((name) => (['clean', 'num'].includes(name) ? (src.match(new RegExp('\\nfunction ' + name + '\\([^\\n]*\\n')) || [''])[0] : pick(name)))
  .join('\n');
assert.match(code, /function clean\(/);
assert.match(code, /function num\(/);

const SCORE_MODEL = (src.match(/const SCORE_MODEL = "([^"]+)"/) || [])[1];
assert.ok(SCORE_MODEL, 'SCORE_MODEL');

function harness({ warehouse = [], cache = [], evidenceFails = false } = {}) {
  const upserts = [];
  const scored = [];
  const admin = {
    from(table) {
      return {
        select() { return this; },
        async in(_col, pins) {
          const rows = table === 'property_lookups' ? warehouse : table === 'public_watchdog_score_cache_v1' ? cache : [];
          return { data: rows.filter((r) => pins.includes(String(r.pams_pin))), error: null };
        },
        async upsert(rows) { upserts.push(...rows.map((r) => ({ table, ...r }))); return { error: null }; },
      };
    },
  };
  const deps = {
    ORIGINS: new Set(['https://www.watchdogindex.com']),
    SCORE_MODEL,
    PUBLIC_MAX_ROWS: 8,
    PUBLIC_CACHE_MS: 86400000,
    out: (_req, status, body) => ({ status, body }),
    publicRateAllowed: () => true,
    sources: async () => ({}),
    subjectEvidence: async () => { if (evidenceFails) throw new Error('sr1a down'); return new Map(); },
    // Deterministic stand-in for the formula: the score follows the assessed value it was given.
    robustScore: (row) => {
      scored.push({ pin: row.pams_pin, assessed_value: row.assessed_value });
      return { score: Math.round(row.assessed_value / 10000), coverage: 0.8, confidence: 'medium', verdict: 'x', detail: {}, market: null, chapter: null };
    },
  };
  const names = Object.keys(deps);
  const f = new Function(...names, code + '\nreturn { handlePublicScore, hashPublicFacts, warehouseFacts };')(...names.map((n) => deps[n]));
  const req = { headers: new Map([['origin', 'https://www.watchdogindex.com'], ['apikey', 'anon']]) };
  req.headers.get = Map.prototype.get.bind(req.headers);
  return { f, admin, req, upserts, scored };
}

const ownParcel = { pams_pin: '0905_261.03_1_C0216', town: 'HOBOKEN CITY', county: 'HUDSON', block: '261.03', lot: '1', qualifier: 'C0216', assessed_value: 500000, last_year_tax: 9000 };
const fake = { pams_pin: ownParcel.pams_pin, town: 'HOBOKEN CITY', county: 'HUDSON', block: '261.03', lot: '1', qualifier: 'C0216', assessed_value: 1, last_year_tax: 999999 };

// 1. A precomputed row is served even when the caller sends other values, and nothing is written.
{
  const h = harness({ warehouse: [ownParcel] });
  const hash = await h.f.hashPublicFacts(h.f.warehouseFacts(ownParcel));
  const cacheRow = { pams_pin: ownParcel.pams_pin, score: 61, evidence_coverage: 0.9, confidence: 'high', verdict: 'v', inputs: { precomputed: true, components: { burden: 70 } }, model_version: SCORE_MODEL, facts_hash: hash, expires_at: new Date(Date.now() + 864e5 * 30).toISOString(), computed_at: '2026-10-01T18:00:00Z' };
  const h2 = harness({ warehouse: [ownParcel], cache: [cacheRow] });
  const res = await h2.f.handlePublicScore(h2.req, { rows: [fake] }, h2.admin);
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].source, 'robust_public_cache', 'caller-sent values cannot force a recompute of a precomputed parcel');
  assert.equal(res.body.rows[0].watchdog_score, 61);
  assert.deepEqual(res.body.rows[0].components, { burden: { score: 70 } }, 'precomputed parts are expanded');
  assert.equal(h2.upserts.length, 0, 'nothing written');
  assert.equal(h2.scored.length, 0, 'nothing recomputed');
}

// 2. A parcel we hold, with no cached row, is scored from our facts, not the caller's, and cached.
{
  const h = harness({ warehouse: [ownParcel] });
  const res = await h.f.handlePublicScore(h.req, { rows: [fake] }, h.admin);
  assert.equal(res.body.rows[0].source, 'robust_on_demand');
  assert.deepEqual(h.scored, [{ pin: ownParcel.pams_pin, assessed_value: 500000 }], 'scored with the warehouse assessed value');
  assert.equal(h.upserts.length, 1, 'cached once');
  assert.equal(h.upserts[0].facts_hash, await h.f.hashPublicFacts(h.f.warehouseFacts(ownParcel)), 'cached under the warehouse facts hash');
  assert.equal(h.upserts[0].score, 50);
}

// 3. A parcel we do not hold is scored from the caller's facts but never cached.
{
  const h = harness({ warehouse: [] });
  const res = await h.f.handlePublicScore(h.req, { rows: [{ ...fake, pams_pin: '0101_1_1' }] }, h.admin);
  assert.equal(res.body.rows[0].source, 'robust_on_demand');
  assert.equal(res.body.rows[0].watchdog_score, 0);
  assert.equal(h.upserts.length, 0, 'caller-supplied facts are never written to the shared cache');
}

// 4. Without SR-1A evidence the score is returned but never cached.
{
  const h = harness({ warehouse: [ownParcel], evidenceFails: true });
  const res = await h.f.handlePublicScore(h.req, { rows: [fake] }, h.admin);
  assert.equal(res.status, 200);
  assert.equal(res.body.rows[0].watchdog_score, 50);
  assert.equal(h.upserts.length, 0, 'a degraded score never replaces a stored one');
}

// 5. The on-demand facts hash is built exactly like the batch pass's hash.
assert.match(src, /facts_hash: await hashPublicFacts\(\{ pams_pin: row\.pams_pin, town: clean\(row\.town, 100\), county: clean\(row\.county, 60\), block: clean\(row\.block, 30\), lot: clean\(row\.lot, 30\), qualifier: clean\(row\.qualifier, 30\), assessed_value: num\(row\.assessed_value\), last_year_tax: num\(row\.last_year_tax\) \}\)/, 'batch hash shape');
assert.match(pick('warehouseFacts'), /town: clean\(raw\.town, 100\), county: clean\(raw\.county, 60\),\s*block: clean\(raw\.block, 30\), lot: clean\(raw\.lot, 30\), qualifier: clean\(raw\.qualifier, 30\),\s*assessed_value: num\(raw\.assessed_value\), last_year_tax: num\(raw\.last_year_tax\)/, 'warehouseFacts matches the batch hash shape');

console.log('Public score cache integrity contract passed.');

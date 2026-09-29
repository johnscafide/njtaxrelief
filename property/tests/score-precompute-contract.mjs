import assert from 'node:assert/strict';
import fs from 'node:fs';

// Watchdog Score batch precompute: same ROBUST-v1 formula, server key only,
// compact cache rows, resumable statewide run after the monthly parcel sync.
const fn = fs.readFileSync('supabase/functions/workbench-score/index.ts', 'utf8');
assert.match(fn, /if \(body\?\.mode === "batch_precompute"\) return handleBatchPrecompute\(req, body, admin, service\);/);
assert.match(fn, /if \(!isServerCaller\(req, service\)\) return out\(req, 401, \{ error: "Server key required" \}\);/, 'only the server key can run batch scoring');
assert.match(fn, /const jobToken = Deno\.env\.get\("SCORE_PRECOMPUTE_TOKEN"\) \|\| "";/, 'batch scoring reads the dedicated job token');
assert.match(fn, /if \(jobToken\.length >= 32 && sentToken && sameKey\(sentToken, jobToken\)\) return true;/, 'the job token must be long and match exactly');
assert.match(fn, /SUPABASE_SECRET_KEYS/, 'batch scoring accepts the newer sb_secret_ keys');
assert.match(fn, /function sameKey\(a, b\)/, 'server keys are compared in constant time');
assert.match(fn, /filter\(\(k\) => k\.length >= 20\)/, 'empty or short keys never match');
assert.match(fn, /const wd = robustScore\(row, src, null\);\n    if \(!wd\) continue;/, 'batch uses the same robustScore() as on-demand scoring');
assert.match(fn, /const BATCH_MAX_ROWS = 1000;/);
assert.match(fn, /const BATCH_CACHE_MS = 40 \* 24 \* 60 \* 60 \* 1000;/, 'kept until after the next monthly refresh');
assert.match(fn, /inputs: \{ framework: "ROBUST", components, coverage_weight: wd\.coverage/, 'compact cache rows');
assert.match(fn, /\.not\("county", "is", null\)\.neq\("county", ""\)\.not\("assessed_value", "is", null\)/, 'map-only parcels are skipped');

const py = fs.readFileSync('property/scripts/precompute_scores.py', 'utf8');
assert.match(py, /"mode": "batch_precompute"/);
assert.match(py, /SCOPE = "score:statewide"/);
assert.match(py, /"cursor": after/, 'progress is saved after every call');

assert.match(py, /"x-score-precompute-token": self\.job_token/, 'the batch job sends its dedicated token');
assert.match(py, /if len\(job_token\) < 32:/, 'the batch job refuses to run without a real token');
const wf = fs.readFileSync('.github/workflows/parcel-composite-sync.yml', 'utf8');
assert.match(wf, /name: Precompute Watchdog Scores\n\s+if: github\.event_name == 'schedule' \|\| inputs\.what == 'scores' \|\| inputs\.what == 'both'/, 'scores refresh after every monthly parcel sync');
assert.match(wf, /SCORE_PRECOMPUTE_TOKEN: \$\{\{ secrets\.SCORE_PRECOMPUTE_TOKEN \}\}/, 'the workflow passes the job token from secrets');
assert.match(fn, /components: cachedComponents\(hit\.inputs\), observed_at: hit\.computed_at, source: "robust_public_cache"/, 'public cache hits go through the component expander');
assert.match(fn, /if \(!inputs\?\.precomputed\) return parts;/, 'on-demand cache rows are returned unchanged');
assert.match(fn, /\{ score: value \?\? null \}/, 'precomputed bare scores become { score } objects');
// Every property gets a score: the job keeps going every 6 hours, always resumes
// an unfinished pass, and brakes itself instead of adding load (the Sept 28
// outage came from two heavy jobs at once).
assert.match(wf, /- cron: '41 \*\/6 \* \* \*'/, 'scores resume every 6 hours');
assert.match(wf, /name: Sync parcels\n\s+if: \(github\.event_name == 'schedule' && github\.event\.schedule == '17 7 3 \* \*'\)/, 'only the monthly schedule syncs parcels');
assert.match(wf, /group: parcel-composite-sync-/, 'one loader at a time: parcel sync and scoring never overlap');
assert.match(wf, /--max-minutes 330/, 'stops cleanly before the job limit');
assert.match(py, /run_row = api\.latest_run\(\)\n    if run_row:/, 'an unfinished pass is always resumed');
assert.match(py, /while busy\(api\.db_load\(\), args\.max_active, args\.max_query_seconds\)/, 'waits while the database is busy');
assert.match(py, /time\.sleep\(args\.pause\)/, 'rests between calls');
const load = fs.readFileSync('supabase/migrations/20260929160000_watchdog_db_load.sql', 'utf8');
assert.match(load, /revoke all on function public\.watchdog_db_load\(\) from public, anon, authenticated;/);
assert.match(load, /grant execute on function public\.watchdog_db_load\(\) to service_role;/);
console.log('Score precompute contract passed.');

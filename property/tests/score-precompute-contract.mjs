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
assert.match(wf, /name: Sync parcels\n(?:\s+#[^\n]*\n)*\s+if: \(github\.event_name == 'schedule' && github\.event\.schedule == '17 7 3 \* \*'\)/, 'only the monthly schedule syncs parcels');
assert.match(wf, /group: parcel-composite-sync-/, 'one loader at a time: parcel sync and scoring never overlap');
assert.match(wf, /--max-minutes 330/, 'stops cleanly before the job limit');
assert.match(py, /run_row = api\.latest_run\(\)\n    if run_row:/, 'an unfinished pass is always resumed');
assert.match(py, /sleep\(args\.pause\)/, 'rests between calls');

// Sep 30 2026: lookup_sr1a_subject_evidence timed out on every batch page, the
// function still cached 1,000 scores per page without SR-1A evidence for 40
// days, and the job's brake failed open. Batch pages now fail closed and the
// job uses the shared fail-closed brake (property/scripts/db_brake.py).
const batch = (fn.match(/async function handleBatchPrecompute\([\s\S]*?\n\}\n/) || [''])[0];
assert.ok(batch, 'handleBatchPrecompute is present');
assert.match(fn, /const BATCH_RETRY_AFTER_SECONDS = 60;/);
assert.match(batch, /try \{ subjects = await subjectEvidence\(admin, rows\); \} catch \(err\) \{\n\s+console\.error\([^\n]*\);\n\s+return out\(req, 503, \{ error: "subject_evidence_unavailable", retry_after_seconds: BATCH_RETRY_AFTER_SECONDS, next_after: after \|\| null \}\);\n\s+\}/, 'a failed SR-1A lookup returns 503 and writes nothing for the page');
assert.doesNotMatch(batch, /subjectEvidenceStatus = "unavailable"/, 'batch never caches scores without subject evidence');
assert.ok(batch.indexOf('"subject_evidence_unavailable"') < batch.indexOf('.upsert('), 'the 503 comes before any cache write');
assert.match(batch, /done: rows\.length < limit/, 'cursor semantics unchanged on success');
assert.match(fn, /try \{ subjects = await subjectEvidence\(admin, missing\); \} catch \(error\) \{ subjectEvidenceStatus = "unavailable";/, 'public on-demand scoring still degrades gracefully');
assert.match(fn, /subjectEvidenceStatus = "unavailable";\n\s+console\.error\("SR-1A subject evidence lookup failed:", error\);/, 'signed-in on-demand scoring still degrades gracefully');

assert.match(py, /from db_brake import [^\n]*\bBrake\b[^\n]*\bBreaker\b[^\n]*\bOverloaded\b/, 'uses the shared brake');
assert.doesNotMatch(py, /def busy\(|def db_load\(/, 'the fail-open brake is gone');
assert.match(py, /Brake\(api\.s, api\.url, "scores", max_wait=BRAKE_MAX_WAIT, limits=brake_limits\(args\.max_active, args\.max_query_seconds\)\)/, 'CLI limits feed the brake');
assert.match(py, /default=LIMITS\["max_active"\]/);
assert.match(py, /default=LIMITS\["max_query_seconds"\]/);
const brakeSrc = fs.readFileSync('property/scripts/db_brake.py', 'utf8');
assert.match(brakeSrc, /"max_active": 5,/, 'default: wait while more than 5 queries are active');
assert.match(brakeSrc, /"max_query_seconds": 5(\.0)?,/, 'default: wait while a query has run longer than 5 s');
assert.match(py, /brake_wait\(\)\n\s+res = api\.score_page\(after, args\.limit, brake_wait, breaker/, 'brakes before every page');
assert.match(py, /sleep\(wait\)\n\s+brake_wait\(\)/, 'backs off and brakes before every retry');
assert.match(py, /FAILURE_LIMIT = 3\b/);
assert.match(py, /Breaker\("scores", limit=FAILURE_LIMIT\)/, 'three failed pages in a row stop the job');
assert.match(py, /BACKOFF = \(30, 60, 120\)/);
assert.match(py, /CALL_TIMEOUT = 90\b/);
assert.match(py, /FATAL_STATUSES = \(400, 401, 403\)/, 'bad requests and tokens are not retried');
assert.match(py, /except \(Overloaded, OutOfTime\) as exc:[\s\S]*?"status": "stopped", "error": reason\[:500\], "cursor": after/, 'an overload stop saves the reason and the cursor');
assert.match(py, /EXIT_OVERLOADED = 75/);
assert.match(py, /return exit_code\(run\(args\)\)/, 'an overload stop exits non-zero');
assert.match(py, /"--self-test"/, 'offline self-test for the decision logic');
assert.match(py, /if body\.get\("subject_evidence_status"\) != "unavailable":\n\s+breaker\.ok\(\)\n\s+return body/, 'a page scored without SR-1A evidence is never accepted');
const load = fs.readFileSync('supabase/migrations/20260929160000_watchdog_db_load.sql', 'utf8');
assert.match(load, /revoke all on function public\.watchdog_db_load\(\) from public, anon, authenticated;/);
assert.match(load, /grant execute on function public\.watchdog_db_load\(\) to service_role;/);
console.log('Score precompute contract passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const read = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');

const publicScore = read('property/js/watchdog-score-public.js');
const recent = read('property/js/landing-recent-intelligence.js');
const migration = read('supabase/migrations/20260825213000_public_canonical_robust_score_details.sql');

assert.match(publicScore, /get_public_property_watchdog_score_details/,
  'public property detail must read the public-safe canonical score RPC');
assert.match(publicScore, /Core\.isCanonicalVersion/,
  'public property detail must reject non-canonical score versions');
assert.doesNotMatch(publicScore, /peerMed|overassessmentPosition|loadJSON\(/,
  'public property detail must not recompute an unqualified Watchdog Score from peer or local reference evidence');

assert.match(recent, /SCORE_MARKER='watchdog\.watchdog_score'/,
  'recent cards must read the governed Watchdog Score marker');
assert.match(recent, /SCORE_MODEL='ROBUST-v1'/,
  'recent cards must require the ROBUST-v1 model');

assert.match(migration, /marker_id = 'watchdog\.watchdog_score'/,
  'public-safe RPC must select only the canonical Watchdog Score marker');
assert.match(migration, /model_version = 'ROBUST-v1'/,
  'public-safe RPC must select only ROBUST-v1 observations');
assert.doesNotMatch(migration, /returns table\([\s\S]*inputs jsonb/i,
  'public-safe RPC must not expose raw canonical score inputs');

console.log('public canonical Watchdog Score single-source contract: ok');

// The public score panel reads the six ROBUST parts from
// get_public_property_watchdog_score_details. Precomputed cache rows store each part
// as a bare number ({"burden": 62}); on-demand rows store {"burden": {"score": 62}}.
// The newest definition must read both shapes and keep its security settings.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const latest = fs.readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => `supabase/migrations/${name}`)
  .filter((path) => /create\s+or\s+replace\s+function\s+public\.get_public_property_watchdog_score_details\s*\(/i.test(fs.readFileSync(path, 'utf8')))
  .pop();
assert.ok(latest, 'a migration defines get_public_property_watchdog_score_details');
const sql = fs.readFileSync(latest, 'utf8');

const parts = { recourse: 'recourse_score', fairness: 'overassessment_score', burden: 'burden_score', uniformity: 'uniformity_score', stability: 'stability_score', trajectory: 'trajectory_score' };
for (const [part, column] of Object.entries(parts)) {
  const block = new RegExp(
    `case\\s+jsonb_typeof\\(c\\.inputs\\s*#>\\s*'\\{components,${part}\\}'\\)\\s*` +
    `when\\s+'number'\\s+then\\s+c\\.inputs\\s*#>>\\s*'\\{components,${part}\\}'\\s*` +
    `when\\s+'object'\\s+then\\s+c\\.inputs\\s*#>>\\s*'\\{components,${part},score\\}'\\s*end,\\s*` +
    `o\\.inputs\\s*#>>\\s*'\\{components,${part},score\\}'\\),\\s*''\\)::numeric\\s+as\\s+${column}`, 'i');
  assert.match(sql, block, `${column} reads both the bare-number and the {score} shape`);
}
assert.match(sql, /security\s+definer/i, 'stays SECURITY DEFINER (anon cannot read the cache table directly)');
assert.match(sql, /set\s+search_path\s+to\s+'public',\s*'pg_temp'/i, 'pins search_path');
assert.match(sql, /c\.model_version\s*=\s*'ROBUST-v1'\s+and\s+c\.expires_at\s*>\s*now\(\)/i, 'only unexpired ROBUST-v1 cache rows');
assert.match(sql, /limit\s+100/i, 'bounded input');
assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.get_public_property_watchdog_score_details\(text\[\]\)\s+from\s+public/i);
assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.get_public_property_watchdog_score_details\(text\[\]\)\s+to\s+anon,\s*authenticated,\s*service_role/i);
console.log(`Public score details parts contract passed (${latest}).`);

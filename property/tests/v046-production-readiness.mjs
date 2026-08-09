import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260810013000_watchdog_v046_production_readiness.sql');
const config = read('supabase/config.toml');
const dataCenter = read('property/js/data-center.js');
const report = read('property/js/report-builder.js');
const workflow = read('.github/workflows/watchdog-automation.yml');
const versions = JSON.parse(read('property/data/versions.json'));

for (const table of ['property_record_snapshots','property_field_changes','professional_reports','professional_report_versions','professional_report_shares','data_center_delivery_jobs','data_center_provider_coverage']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
assert.match(migration, /revoke all on table public\.property_record_snapshots from anon, authenticated/);
assert.match(migration, /Controlled Paddle Live lifecycle/);
assert.match(config, /\[functions\.report-share\][\s\S]*verify_jwt = false/);
assert.match(config, /\[functions\.watchdog-automation\][\s\S]*verify_jwt = false/);
assert.match(dataCenter, /Not connected/);
assert.match(dataCenter, /data_center_delivery_jobs/);
assert.match(report, /professional_report_versions/);
assert.match(report, /Save version/);
assert.match(workflow, /safely skipped/);
assert.equal(versions.active_roadmap.length, 3);
assert.ok(versions.releases.some(release => release.version === '0.46.0'));
console.log('v0.46 production-readiness contracts passed');

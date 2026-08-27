import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migrationNames = fs.readdirSync(migrationsDir)
  .filter((name) => /njw_270_watchdog_index_distribution_(research_v1|subgeo_fix)\.sql$/.test(name))
  .sort();

if (migrationNames.length !== 2) {
  throw new Error(`Expected 2 NJW-270 Watchdog Index distribution migrations, found ${migrationNames.length}`);
}

const sql = migrationNames
  .map((name) => fs.readFileSync(`${migrationsDir}/${name}`, 'utf8'))
  .join('\n');

const must = (pattern, label) => {
  if (!pattern.test(sql)) throw new Error(`Missing Watchdog Index contract: ${label}`);
};

must(/ROBUST-v1/g, 'canonical ROBUST-v1 lineage');
must(/promotion_status\s+text\s+not\s+null\s+default\s+'research_only'/i, 'research-only promotion gate');
must(/score_p10[\s\S]*score_p25[\s\S]*score_median[\s\S]*score_p75[\s\S]*score_p90/i, 'score distribution percentiles');
must(/score_iqr[\s\S]*score_p90_p10_span/i, 'dispersion metrics');
must(/highly_pressured_tail_pct[\s\S]*strong_tail_pct/i, 'tail preservation');
must(/evidence_p10[\s\S]*evidence_p25[\s\S]*evidence_median[\s\S]*evidence_p75[\s\S]*evidence_p90/i, 'evidence coverage distribution');
must(/component_distributions/i, 'ROBUST component distributions');
must(/'recourse','recourse','R'[\s\S]*'fairness','overassessment_position','O'[\s\S]*'burden','burden','B'[\s\S]*'uniformity','uniformity','U'[\s\S]*'stability','stability','S'[\s\S]*'trajectory','trajectory','T'/i, 'R/O/B/U/S/T component lineage');
must(/source_observation_fingerprint/i, 'source observation fingerprint');
must(/public_watchdog_score_cache_v1[\s\S]*on_demand_cache_excluded',true/i, 'demand-selected on-demand cache exclusion');
must(/source_municipality[\s\S]*source_county/i, 'corrected subgeography concentration lineage');
must(/security\s+invoker/i, 'security-invoker refresh function');
must(/revoke\s+all\s+on\s+public\.watchdog_index_distribution_runs\s+from\s+public,\s*anon,\s*authenticated/i, 'run-table browser revoke');
must(/revoke\s+all\s+on\s+public\.watchdog_index_distribution_snapshots\s+from\s+public,\s*anon,\s*authenticated/i, 'snapshot-table browser revoke');
must(/Research-only distribution snapshot: no geographic Watchdog Index score is calculated\./i, 'explicit no-geographic-score assertion');

if (/\bavg\s*\(\s*(?:[a-z_][a-z0-9_]*\.)?score\s*\)/i.test(sql)) {
  throw new Error('Watchdog Index contract forbids naive average parcel score aggregation');
}

console.log('Watchdog Index distribution governance contract OK');
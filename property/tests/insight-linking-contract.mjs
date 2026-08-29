import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const cohort = await read('scripts/apply-search-growth-cohort.mjs');
const insightLinksMigration = await read('supabase/migrations/20260829144500_insight_entity_links.sql');

// Independent contract so concurrent Search Growth UI tests can evolve without weakening SEO link governance.
// Evidence-led internal linking is bounded: every municipality gets one relevant statewide
// assessment-record Insight at build time, while published Insights link only explicit entities.
assert.match(cohort, /town-manifest\.json/);
assert.match(cohort, /manifest\.pages\.length !== 564/);
assert.match(cohort, /data-search-growth="town-insight-link"/);
assert.match(cohort, /\/insights\/nj-2026-modiv-property-assessment-files/);
assert.match(cohort, /href="\/insights\/"/);
assert.doesNotMatch(cohort, /href="\/property\/insights\/"/);
assert.match(insightLinksMigration, /slug = '2026-revaluation-reassessment-list'/);
assert.match(insightLinksMigration, /slug = 'south-jersey-housing-market-summer-2026'/);
for (const target of [
  '/towns/camden/lindenwold-borough.html',
  '/towns/camden/pine-hill-borough.html',
  '/towns/gloucester/clayton-borough.html',
  '/towns/gloucester/logan-township.html',
  '/towns/gloucester/west-deptford-township.html',
  '/towns/gloucester/westville-borough.html',
  '/towns/salem/lower-alloways-creek-township.html',
  '/property-tax-appeal.html',
  '/insights/equalization-ratios'
]) assert.match(insightLinksMigration, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(insightLinksMigration, /Expected exactly one current 2026 revaluation insight row/);
assert.match(insightLinksMigration, /Expected exactly one current South Jersey housing insight row/);
assert.doesNotMatch(insightLinksMigration, /e71941a4|\buuid\b/i);

console.log('insight linking contract: ok');

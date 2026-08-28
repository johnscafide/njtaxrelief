import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const generator = await read('scripts/generate_town_pages.py');
const signals = await read('property/analytics/web-signals/index.html');

// Evidence-led opportunity queue stays transparent and advisory.
assert.match(signals, /Search opportunities/);
assert.match(signals, /position>=8&&position<=25/);
assert.match(signals, /CTR opportunity/);
assert.match(signals, /Build authority/);
assert.match(signals, /never publishes content automatically/i);
assert.match(signals, /Town\/county tax & records section/);

// Durable town generator keeps one canonical entity page and answers proven tax/record intent.
assert.match(generator, /Property Taxes, Assessments & Records \| Watchdog/);
assert.match(generator, /Property tax &amp; records/);
assert.match(generator, /property tax, assessment and record lookup/);
assert.match(generator, /Search .* property records →/);
assert.match(generator, /Watchdog is not the municipal tax collector/);
assert.match(generator, /county_href = f"\/towns\/\{slug\(county\)\}\/"/);
assert.match(generator, /Look up a property/);
assert.match(generator, /Property Tax Records & Assessments \| Watchdog/);
assert.match(generator, /official assessor, collector and county offices remain the source/);

// SEO rollout keeps the existing canonical path construction instead of spawning intent duplicates.
assert.match(generator, /canonical = SITE \+ "\/" \+ path/);
assert.doesNotMatch(generator, /assessor-page|tax-collector-page|property-records-page/);

console.log('search growth contract: ok');
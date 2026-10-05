import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../../api/_tax-town.js');
const handler = require('../../api/tax-town-page.js');

function render(query) {
  let status = 200, body = '';
  handler({ method: 'GET', query }, { statusCode: 200, setHeader() {}, end(b) { status = this.statusCode; body = String(b || ''); } });
  return { status, body };
}

const bills = JSON.parse(fs.readFileSync('property/data/town-tax/bills.json', 'utf8'));
const counties = T.publishedCounties();
assert.ok(counties.length >= 1, 'at least one county is published');
counties.forEach((c) => {
  const towns = c.towns.filter((t) => t.published);
  assert.ok(towns.length > 0, `${c.name} has published towns`);
  towns.forEach((t) => assert.ok(bills.towns[t.code], `${t.name} has bill data`));
});

const story = fs.readFileSync('co/index.html', 'utf8').match(/<!--\s*\n\s*\n\s*Hi There[\s\S]*?-->/)[0];
let pages = 0;
for (const c of counties) {
  const county = render({ county: c.slug });
  assert.equal(county.status, 200, `${c.slug} county page`);
  for (const t of c.towns.filter((x) => x.published)) {
    const r = render({ county: c.slug, town: t.slug });
    assert.equal(r.status, 200, t.path);
    assert.ok(r.body.includes(`<link rel="canonical" href="https://www.watchdogindex.com${t.path}">`), `${t.path} canonical`);
    assert.ok(r.body.includes(story), `${t.path} has John's story comment`);
    assert.ok(!/href="https:\/\/www\.watchdogindex\.com\/property\//.test(r.body), `${t.path} has no /property/ public links`);
    assert.ok(r.body.includes('"@type":"FAQPage"'), `${t.path} FAQ schema`);
    assert.ok(!/NaN|undefined/.test(r.body.replace(/<script[\s\S]*?<\/script>/g, '')), `${t.path} has no NaN/undefined`);
    assert.ok(county.body.includes(`href="${t.path}"`), `${c.slug} county page links ${t.path}`);
    pages++;
  }
}

assert.equal(render({}).status, 200, '/property-tax index');
assert.equal(render({ county: 'bergen', town: 'not-a-town' }).status, 404);
const unpublished = [...T.towns().counties.values()].find((c) => !c.published);
if (unpublished) assert.equal(render({ county: unpublished.slug }).status, 404, 'unpublished county is 404');

const rows = T.sitemapRows();
assert.equal(rows.length, 1 + counties.length + pages, 'sitemap rows: index, counties and towns');

const middleware = fs.readFileSync('middleware.js', 'utf8');
const re = new RegExp(middleware.match(/const TAX_PAGE_PATH = \/(.+)\/;/)[1]);
['/property-tax', '/property-tax/', '/property-tax/bergen', '/property-tax/bergen/teaneck-township'].forEach((p) => assert.ok(re.test(p), p));
['/property-tax-estimator', '/property-tax/bergen/x/y', '/property-tax/town-tax.css'].forEach((p) => assert.ok(!re.test(p), p));

const deadline = handler.nextDeadline;
assert.equal(deadline({ alternateCalendar: false }, new Date('2026-10-05T12:00:00Z')).text, 'April 1, 2027');
assert.equal(deadline({ alternateCalendar: false }, new Date('2027-03-01T12:00:00Z')).text, 'April 1, 2027');
assert.equal(deadline({ alternateCalendar: true }, new Date('2026-10-05T12:00:00Z')).text, 'January 15, 2027');

console.log(`tax town pages contract passed: ${pages} town pages, ${counties.length} counties, ${rows.length} sitemap rows`);

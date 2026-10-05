const fs = require('fs');
const { execFileSync } = require('child_process');

const P = JSON.parse(fs.readFileSync('property/data/play-catalog.json'));
const G = JSON.parse(fs.readFileSync('property/data/glossary.json'));
const errors = [];

// ---------- play catalog ----------
let seen = new Set();
for (const [prof, items] of Object.entries(P.professions)) {
  for (const x of items) {
    const k = prof + '/' + x.slug;
    if (seen.has(k)) errors.push('duplicate play ' + k);
    seen.add(k);
    for (const f of ['title', 'query', 'example', 'limits']) if (!String(x[f] || '').trim()) errors.push(k + ' missing ' + f);
    if (String(x.example).length < 90) errors.push(k + ' example too thin');
    if (String(x.limits).length < 55) errors.push(k + ' limits too thin');
  }
}

// ---------- glossary ----------
// Every term cites an official New Jersey government source: nj.gov and its
// agency subdomains, the Judiciary (njcourts.gov) or the Legislature's
// published statutes and laws (njleg.state.nj.us).
const OFFICIAL_SOURCE = /^https:\/\/(?:(?:[a-z0-9-]+\.)*nj\.gov|www\.njcourts\.gov|(?:pub|www)\.njleg\.state\.nj\.us)\//;
const categories = new Set((G.categories || []).map((c) => c.id));
if (!categories.size) errors.push('glossary has no categories');
const index = fs.readFileSync('property/glossary/index.html', 'utf8');
const sitemap = fs.readFileSync('sitemap-glossary.xml', 'utf8');
seen = new Set();
for (const x of G.terms) {
  if (seen.has(x.slug)) errors.push('duplicate glossary ' + x.slug);
  seen.add(x.slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.slug)) errors.push(x.slug + ' slug is not kebab-case');
  for (const f of ['term', 'definition', 'example', 'source', 'category']) if (!String(x[f] || '').trim()) errors.push(x.slug + ' missing ' + f);
  if (!OFFICIAL_SOURCE.test(x.source)) errors.push(x.slug + ' source is not an official New Jersey government site');
  if (!categories.has(x.category)) errors.push(x.slug + ' has unknown category ' + x.category);
  if (x.example.length < 70) errors.push(x.slug + ' example too thin');
  if (x.definition.length > 300) errors.push(x.slug + ' definition is too long for a card');
  if (/[–\u2014]/.test(x.term + x.definition + x.example)) errors.push(x.slug + ' uses an em or en dash');
  if (x.aliases && (!Array.isArray(x.aliases) || x.aliases.some((a) => a !== String(a).toLowerCase()))) errors.push(x.slug + ' aliases must be lowercase strings');
  if (!index.includes(`href="/glossary/${x.slug}"`)) errors.push(x.slug + ' is missing from the glossary page');
  if (!sitemap.includes(`/glossary/${x.slug}</loc>`)) errors.push(x.slug + ' is missing from sitemap-glossary.xml');
}
try {
  execFileSync('node', ['scripts/build-glossary.mjs', '--check'], { stdio: 'pipe' });
} catch (error) {
  errors.push('glossary page or sitemap is stale: run node scripts/build-glossary.mjs');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('SEO content guard passed:', seen.size, 'glossary terms; play catalog validated.');

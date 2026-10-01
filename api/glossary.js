// Glossary term pages: /glossary/<slug> (physically /property/glossary/<slug>/,
// rewritten here by vercel.json). One page per term in property/data/glossary.json.
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://www.watchdogindex.com';
const D = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'property/data/glossary.json'), 'utf8'));
const CATEGORY = new Map((D.categories || []).map((c) => [c.id, c]));
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const j = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const byName = (a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' });

function related(x) {
  // Up to six neighbors around this term (alphabetically, wrapping) in the
  // same topic, so every term page links on to others.
  const all = D.terms.filter((t) => t.category === x.category).sort(byName);
  const at = all.findIndex((t) => t.slug === x.slug);
  const n = Math.min(6, all.length - 1);
  const out = [];
  for (let step = 1; out.length < n; step++) {
    out.push(all[(at + step) % all.length]);
    if (out.length < n) out.push(all[(at - step + all.length) % all.length]);
  }
  return [...new Set(out)].sort(byName);
}

function render(x) {
  const url = `${ORIGIN}/glossary/${x.slug}`;
  const cat = CATEGORY.get(x.category);
  const faq = [
    { q: `What does ${x.term} mean in New Jersey?`, a: x.definition },
    { q: 'Should I rely on this definition for a filing or transaction?', a: 'Use it as a plain-English starting point. Check the official source, statute or a professional before you file or sign anything.' }
  ];
  const schema = [
    { '@context': 'https://schema.org', '@type': 'DefinedTerm', name: x.term, description: x.definition, url, inDefinedTermSet: `${ORIGIN}/glossary` },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Glossary', item: `${ORIGIN}/glossary` },
      { '@type': 'ListItem', position: 2, name: x.term, item: url }
    ] }
  ];
  const links = related(x).map((t) => `<li><a href="/glossary/${t.slug}">${e(t.term)}</a></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow">
<title>${e(x.term)} in New Jersey | Watchdog Glossary</title>
<meta name="description" content="${e(x.definition)}">
<link rel="canonical" href="${url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/property/css/watchdog-games.css?v=20261001b">
<link rel="stylesheet" href="/property/css/watchdog-glossary.css?v=20261001a">
${schema.map((s) => `<script type="application/ld+json">${j(s)}</script>`).join('')}
</head><body class="wg">
<a class="wg-skip" href="#wg-main">Skip to the definition</a>
<header class="wg-bar"><div class="wg-bar-in"><a class="wg-brand" href="/">Watchdog</a><nav class="wg-nav" aria-label="Learn"><a href="/games">Games</a><a href="/glossary" aria-current="page">Glossary</a><a href="/">Look up a home</a></nav></div></header>
<main class="wg-main" id="wg-main"><div class="wg-narrow">
<ol class="gl-crumbs" aria-label="Breadcrumb"><li><a href="/glossary">Glossary</a></li>${cat ? `<li><a href="/glossary#${cat.id}">${e(cat.label)}</a></li>` : ''}</ol>
<h1>${e(x.term)}</h1>
<p class="gl-def">${e(x.definition)}</p>
<section class="wg-card"><h2>New Jersey example</h2><p class="gl-example">${e(x.example)}</p></section>
<section class="wg-card gl-source"><h2>Official source</h2><p><a href="${e(x.source)}" rel="noopener">${e(x.source_title || x.source)}</a></p><p class="gl-disclaimer">This is a plain-English summary. Rules and dollar amounts change, so check the official source or a professional before you file or sign anything.</p></section>
${links ? `<section class="wg-card"><h2>Related terms</h2><ul class="gl-related">${links}</ul></section>` : ''}
<section class="wg-card"><h2>Put it to work</h2><div class="wg-actions"><a class="wg-btn" href="/">Look up your home</a><a class="wg-btn wg-btn-quiet" href="/games">Play today's games</a></div></section>
</div></main>
<footer class="wg-foot"><div class="wg-foot-in"><span>Watchdog glossary</span><a href="/glossary">All terms</a><a href="/games">Games</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>
</body></html>`;
}

module.exports = (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase();
  const x = D.terms.find((v) => v.slug === slug);
  if (!x) {
    res.status(404).send('Glossary term not found');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(render(x));
};

module.exports._render = render;

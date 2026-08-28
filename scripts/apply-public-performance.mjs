import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS = '<script src="/property/js/product-analytics.js" defer></script>';
const PROPERTY_HERO_DESKTOP = 'https://images.unsplash.com/photo-1628624747186-a941c476b7ef?w=1200&auto=format&fit=crop&q=80';
const PROPERTY_HERO_MOBILE = 'https://images.unsplash.com/photo-1628624747186-a941c476b7ef?w=900&auto=format&fit=crop&q=72';
const MARKER = 'data-search-performance="lcp-20260828"';

function ensureAnalytics(html) {
  if (html.includes('/property/js/product-analytics.js')) return html;
  if (!html.includes('</body>')) throw new Error('Missing </body> while attaching product analytics');
  return html.replace('</body>', `${ANALYTICS}</body>`);
}

function injectBefore(html, needle, addition, label) {
  if (html.includes(addition)) return html;
  if (!html.includes(needle)) throw new Error(`Could not locate ${label}`);
  return html.replace(needle, addition + needle);
}

function findRootHeroUrl(css) {
  const blocks = css.match(/\.hero(?:\s|,|:)[^{]*\{[^}]*\}/gi) || [];
  for (const block of blocks) {
    const urls = [...block.matchAll(/url\((['"]?)(https:\/\/images\.unsplash\.com\/[^)'"\s]+)\1\)/gi)];
    if (urls.length) return urls[0][2].replace(/&amp;/g, '&');
  }
  return '';
}

async function patchPropertyLookup() {
  const htmlPath = path.join(ROOT, 'property/index.html');
  let html = await readFile(htmlPath, 'utf8');
  html = ensureAnalytics(html);
  if (!html.includes(MARKER)) {
    const critical = `<link ${MARKER} rel="stylesheet" href="/property/css/lookup/01-search-hero.css">\n  <link rel="preload" as="image" href="${PROPERTY_HERO_MOBILE}" media="(max-width: 760px)" fetchpriority="high">\n  <link rel="preload" as="image" href="${PROPERTY_HERO_DESKTOP}" media="(min-width: 761px)" fetchpriority="high">\n  `;
    html = injectBefore(html, '<link rel="stylesheet" href="/property/css/lookup.css">', critical, 'lookup stylesheet link');
  }
  await writeFile(htmlPath, html, 'utf8');

  const cssPath = path.join(ROOT, 'property/css/lookup/01-search-hero.css');
  let css = await readFile(cssPath, 'utf8');
  if (!css.includes('NJW-288 mobile LCP asset')) {
    css += `\n/* NJW-288 mobile LCP asset: same editorial image, smaller transfer for narrow viewports. */\n@media (max-width: 760px) {\n  .pl-hero-bg { background-image: url('${PROPERTY_HERO_MOBILE}'); }\n}\n`;
    await writeFile(cssPath, css, 'utf8');
  }
}

async function patchRootHome() {
  const htmlPath = path.join(ROOT, 'index.html');
  const css = await readFile(path.join(ROOT, 'styles.css'), 'utf8');
  let html = await readFile(htmlPath, 'utf8');
  html = ensureAnalytics(html);
  const hero = findRootHeroUrl(css);
  if (hero && !html.includes('data-search-performance="root-hero-preload"')) {
    const preload = `<link data-search-performance="root-hero-preload" rel="preload" as="image" href="${hero.replace(/&/g, '&amp;')}" fetchpriority="high">\n  `;
    html = injectBefore(html, '</head>', preload, 'root </head>');
  }
  await writeFile(htmlPath, html, 'utf8');
  return hero;
}

await patchPropertyLookup();
const rootHero = await patchRootHome();
console.log(`Public performance prepared: property hero preloaded + mobile-sized; root hero preload ${rootHero ? 'attached' : 'not found'}; product analytics attached to public acquisition pages.`);

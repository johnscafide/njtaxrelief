import fs from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = 'https://www.watchdogindex.com/';
const LEGACY_PROPERTY_ORIGIN = 'https://njpropertytaxrelief.com/property/';
const WATCHDOG_PROPERTY_ORIGIN = 'https://www.watchdogindex.com/property/';
const GA_TAG = '  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ENP9182L0J"></script>\n';
const GA_CONFIG = '  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'G-ENP9182L0J\');</script>\n';
const CLARITY_TAG = '  <script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","wjeklv0exl");</script>\n';
const CONSENT_TAG = '  <script src="/property/js/watchdog-consent.js"></script>\n';
const OWNERSHIP_TAG = '<script src="/property/js/ownership-verification.js"></script>';
const FREE_GRID_TAG = '<script src="/property/js/free-imagery-grid-runtime.js"></script>\n';
const SUPABASE_TAG = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>\n';
const SUPABASE_SINGLETON_TAG = '<script src="/property/js/supabase-client-singleton-guard.js"></script>\n';
const PAID_LAUNCH_META = '  <meta name="watchdog-paid-launch" content="2026-09-16">\n';
const PAID_LAUNCH_TAG = '  <script defer src="/property/js/paid-launch-banner.js"></script>\n';
const ENTITY_GRAPH_ID = 'watchdog-entity-graph';
const ENTITY_GRAPH = `<script type="application/ld+json" id="${ENTITY_GRAPH_ID}">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.watchdogindex.com/#organization",
      "name": "Watchdog",
      "alternateName": "Watchdog Property Intelligence",
      "url": "https://www.watchdogindex.com/",
      "description": "New Jersey property intelligence for homeowners and real-estate professionals, combining public-source property evidence with Watchdog-derived decision intelligence.",
      "areaServed": { "@type": "State", "name": "New Jersey" }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.watchdogindex.com/#website",
      "url": "https://www.watchdogindex.com/",
      "name": "Watchdog",
      "publisher": { "@id": "https://www.watchdogindex.com/#organization" },
      "inLanguage": "en-US"
    }
  ]
}
</script>\n`;

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function useSharedFooter(source, footer) {
  if (!footer) return source;
  const footerStart = source.indexOf('<div\n    id="wd-property-footer"');
  const scriptsStart = source.indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet', footerStart);
  if (footerStart < 0 || scriptsStart < 0) {
    console.warn('WATCHDOG_SHARED_FOOTER_MARKERS_MISSING');
    return source;
  }
  return `${source.slice(0, footerStart)}${footer.trim()}\n\n${source.slice(scriptsStart)}`;
}

function installConsentFirstAnalytics(source) {
  if (!source.includes(GA_TAG) || !source.includes(GA_CONFIG) || !source.includes(CLARITY_TAG)) {
    console.warn('WATCHDOG_CONSENT_ANALYTICS_MARKERS_MISSING');
    return source;
  }
  return source
    .replace(GA_TAG, CONSENT_TAG)
    .replace(GA_CONFIG, '')
    .replace(CLARITY_TAG, '');
}

function installFreeGridImagery(source) {
  if (source.includes('/property/js/free-imagery-grid-runtime.js')) return source;
  if (!source.includes(OWNERSHIP_TAG)) {
    console.warn('WATCHDOG_FREE_GRID_IMAGERY_MARKER_MISSING');
    return source;
  }
  return source.replace(OWNERSHIP_TAG, FREE_GRID_TAG + OWNERSHIP_TAG);
}

function installSupabaseSingletonGuard(source) {
  if (source.includes('/property/js/supabase-client-singleton-guard.js')) return source;
  if (!source.includes(SUPABASE_TAG)) {
    console.warn('WATCHDOG_SUPABASE_SINGLETON_MARKER_MISSING');
    return source;
  }
  return source.replace(SUPABASE_TAG, SUPABASE_TAG + SUPABASE_SINGLETON_TAG);
}

function installPaidLaunch(source) {
  if (source.includes('name="watchdog-paid-launch"') && source.includes('/property/js/paid-launch-banner.js')) return source;
  if (source.includes('</head>')) {
    return source.replace('</head>', `${PAID_LAUNCH_META}${PAID_LAUNCH_TAG}</head>`);
  }
  if (source.includes('</body>')) {
    console.warn('WATCHDOG_PAID_LAUNCH_HEAD_MARKER_MISSING_USING_BODY');
    return source.replace('</body>', `${PAID_LAUNCH_TAG}</body>`);
  }
  console.warn('WATCHDOG_PAID_LAUNCH_HTML_MARKERS_MISSING');
  return `${source}\n${PAID_LAUNCH_TAG}`;
}

function installEntityGraph(source) {
  if (source.includes(`id="${ENTITY_GRAPH_ID}"`)) return source;
  if (!source.includes('</head>')) {
    console.warn('WATCHDOG_ENTITY_GRAPH_HEAD_MARKER_MISSING');
    return source;
  }
  return source.replace('</head>', `${ENTITY_GRAPH}</head>`);
}

function canonicalizeWatchdogHtml(source) {
  const canonicalized = source
    .split(LEGACY_PROPERTY_ORIGIN).join(WATCHDOG_PROPERTY_ORIGIN)
    .replace(
      '<link rel="canonical" href="https://www.watchdogindex.com/property/">',
      `<link rel="canonical" href="${CANONICAL_ORIGIN}">`
    )
    .replace(
      '<meta property="og:url" content="https://www.watchdogindex.com/property/">',
      `<meta property="og:url" content="${CANONICAL_ORIGIN}">`
    )
    .replace(
      '<link rel="manifest" href="/site.webmanifest">',
      '<link rel="manifest" href="/property/site.webmanifest">'
    )
    .replace(
      '"@id": "https://www.watchdogindex.com/property/#app"',
      '"@id": "https://www.watchdogindex.com/#app"'
    )
    .replace(
      '"url": "https://www.watchdogindex.com/property/"',
      '"url": "https://www.watchdogindex.com/"'
    )
    .replace(
      '<meta property="og:site_name" content="NJ Property Tax Relief Guide">',
      '<meta property="og:site_name" content="Watchdog">'
    )
    .replace(
      '"item": "https://njpropertytaxrelief.com/"',
      '"item": "https://www.watchdogindex.com/"'
    );

  return installEntityGraph(canonicalized);
}

export default async function handler(req, res) {
  if (requestHost(req) !== CANONICAL_HOST) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Not found');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Method not allowed');
  }

  try {
    const sourcePath = path.join(process.cwd(), 'property', 'index.html');
    const footerPath = path.join(process.cwd(), 'property', 'partials', 'footer.html');
    const [source, sharedFooter] = await Promise.all([
      fs.readFile(sourcePath, 'utf8'),
      fs.readFile(footerPath, 'utf8')
    ]);
    const consentFirst = installConsentFirstAnalytics(source);
    const freeImagery = installFreeGridImagery(consentFirst);
    const singletonAuth = installSupabaseSingletonGuard(freeImagery);
    const canonical = canonicalizeWatchdogHtml(useSharedFooter(singletonAuth, sharedFooter));
    const html = installPaidLaunch(canonical);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Link', '<https://www.watchdogindex.com/>; rel="canonical"');
    res.setHeader('Vary', 'Host');
    res.setHeader('X-Watchdog-Paid-Launch', html.includes('/property/js/paid-launch-banner.js') ? '2026-09-16' : 'missing');

    if (req.method === 'HEAD') return res.end();
    return res.end(html);
  } catch (error) {
    console.error('WATCHDOG_INDEX_ENTRY_ERROR', error);
    res.statusCode = 500;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Watchdog is temporarily unavailable.');
  }
}

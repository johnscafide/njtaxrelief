import { next, rewrite } from '@vercel/functions';

const WATCHDOG_HOST = 'www.watchdogindex.com';
const LEGACY_NJPTR_HOSTS = new Set(['njpropertytaxrelief.com', 'www.njpropertytaxrelief.com']);
const LEGACY_WATCHDOG_PROMO_PATHS = new Set(['/', '/index.html', '/anchor-estimator.html', '/anchor-program.html', '/senior-programs.html', '/resources.html', '/anchor-auto-file-letters-2026.html']);
const INDEXNOW_KEY_PATH = '/c04eb5246cd74475b86188f12c31e21b.txt';
const RESERVED_ROOT_PREFIXES = ['/api', '/towns', '/.well-known', '/_vercel'];
const STATIC_FILE = /\.[A-Za-z0-9]{1,10}$/;
const TYPED_SITEMAP_FILE = /^\/sitemap-[a-z0-9-]+\.xml$/i;
const BULK_SALES_FILE = /^\/property\/sales-[a-z-]+\.json$/i;
// Watchdog Games answer banks and group lists: read only by /api/watchdog-games, never public.
const GAMES_PRIVATE_FILE = /^\/property\/data\/games\/private\//i;
// Repository working notes for code editors, never a public page on either site.
const REPO_NOTES_FILE = /^\/agents\.md$/i;
const AGENT_PORTAL_PATH = /^\/agent\/([a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9]))\/?$/i;
const LEGACY_AGENT_PORTAL_PATH = /^\/property\/agent\/([a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9]))\/?$/i;
// Agent portal addresses are /agent/<slug>. These names are real /agent/* pages or kept
// for future ones, so they never resolve to a portal (also blocked when reserving a slug).
const AGENT_RESERVED_SEGMENTS = new Set(['agent','agents','analytics','assets','buyers','client-room','clients','contacts','desk','edit','extension','farm-map','index','leads','listing-prep','new','onboarding','open-house','portal','reports','settings','shared','sphere','team','teams','today','training','workspace']);
// Watchdog host only: old NJPropertyTaxRelief tool pages linked from Watchdog now
// have Watchdog versions at clean root URLs. NJPropertyTaxRelief keeps its own.
const WATCHDOG_TOOL_REDIRECTS = new Map([['/resources.html','/glossary'],['/resources','/glossary'],['/home-improvement-abatement.html','/home-improvement-abatement'],['/mortgage-calculator.html','/mortgage-calculator'],['/home-value.html','/home-value'],['/search-homes.html','/search-homes']]);
const SALES_API_PATH = '/api/sales-by-district';
// Public property pages: /nj/<town>/<address>/<pams_pin> (or /nj/property/<pin>, redirected to the full form).
const PROPERTY_PAGE_PATH = /^\/nj\/[^/]+\/[^/]+(?:\/[^/]+)?\/?$/i;
// Free CO lookup pages: /co/<county>/<town> (and /print, the client checklist), /co/<county>,
// /co/website (embed setup) and /co/embed/<county>/<town> (one town inside the embed).
// /co itself, /co/embed and the files under /co/ are static.
const CO_EMBED_TOWN_PATH = /^\/co\/embed\/([a-z0-9-]{1,80})\/([a-z0-9-]{1,80})\/?$/;
const CO_PAGE_PATH = /^\/co\/([a-z0-9-]{1,80})(?:\/([a-z0-9-]{1,80})(?:\/(print))?)?\/?$/;
// Town property tax pages: /property-tax, /property-tax/<county> and /property-tax/<county>/<town>.
const TAX_PAGE_PATH = /^\/property-tax(?:\/([a-z0-9-]{1,80})(?:\/([a-z0-9-]{1,80}))?)?\/?$/;
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const ROOT_STATIC_PAGES = new Set(['/move', '/contact', '/search', '/agent', '/lender', '/attorney', '/investor', '/developer/communications', '/transaction', '/transaction/shared', '/account/profile', '/account/professional-profile', '/agent/listing-prep', '/agent/buyers', '/agent/open-house', '/agent/training', '/open-house', '/client-room', '/preview', '/preview/home', '/co']);
const ROOT_COMPAT_REDIRECTS = new Map([['/contact.html', '/contact']]);
const LEGACY_FAQ_PATHS = new Set(['/property/faq','/property/faq/','/property/faq.html','/property/faq/index.html']);
const LEGACY_PUBLIC_REDIRECTS = new Map([
['/property/privacy','/privacy'],['/property/privacy/','/privacy'],['/property/privacy/index.html','/privacy'],['/property/terms','/terms'],['/property/terms/','/terms'],['/property/terms/index.html','/terms'],['/property/refunds','/refunds'],['/property/refunds/','/refunds'],['/property/refunds/index.html','/refunds'],['/property/support','/support'],['/property/support/','/support'],['/property/support/index.html','/support'],['/property/data-deletion','/data-deletion'],['/property/data-deletion/','/data-deletion'],['/property/data-deletion/index.html','/data-deletion']]);
function isReservedRootPath(pathname){return RESERVED_ROOT_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));}
function cleanPublicPath(pathname){let path=String(pathname||'/').replace(/\/{2,}/g,'/');path=path.replace(/\/index\.html$/i,'');path=path.replace(/\.html$/i,'');if(path.length>1)path=path.replace(/\/+$/,'');return path||'/';}
function legacyWatchdogPath(pathname){const raw=String(pathname||'/');if(raw==='/property'||raw==='/property/')return '/';const remainder=raw.slice('/property'.length)||'/';if(STATIC_FILE.test(remainder)&&!/\.html$/i.test(remainder))return '/property'+remainder;return cleanPublicPath(remainder);}
function cameFromLegacyNjptr(request){const referrer=request.headers.get('referer')||'';if(!referrer)return false;try{return LEGACY_NJPTR_HOSTS.has(new URL(referrer).hostname.toLowerCase());}catch(_error){return false;}}
function redirectLegacyWatchdogHost(request,url){const destination=new URL(legacyWatchdogPath(url.pathname),`https://${WATCHDOG_HOST}`);destination.search=url.search;if(cameFromLegacyNjptr(request)&&!destination.searchParams.has('utm_source')){destination.searchParams.set('utm_source','njpropertytaxrelief');destination.searchParams.set('utm_medium','referral');destination.searchParams.set('utm_campaign','watchdog_cross_site');destination.searchParams.set('utm_content','legacy_property_link');}return Response.redirect(destination,308);}
function rewriteLegacyAcquisitionPage(request,pathname){const destination=new URL('/api/njptr-watchdog-acquisition-page',request.url);destination.searchParams.set('path',pathname);return rewrite(destination);}
function rewriteCleanPage(request,publicPath){const destination=new URL('/api/watchdog-index-page-contact-safe',request.url);destination.searchParams.set('path',publicPath);return rewrite(destination);}
function coPageRewrite(request,url){const p=url.pathname;if(p==='/co/embed'||p==='/co/embed/')return null;const city=url.searchParams.get('city');let m=p.match(CO_EMBED_TOWN_PATH);if(m){const d=new URL('/api/co-embed-page',request.url);d.searchParams.set('county',m[1]);d.searchParams.set('town',m[2]);if(city)d.searchParams.set('city',city);return rewrite(d);}
if(p==='/co/website'||p==='/co/website/'){const d=new URL('/api/co-town-page',request.url);d.searchParams.set('view','website');return rewrite(d);}
m=p.match(CO_PAGE_PATH);if(!m||m[1]==='embed')return null;const d=new URL('/api/co-town-page',request.url);d.searchParams.set('county',m[1]);if(m[2])d.searchParams.set('town',m[2]);if(m[3])d.searchParams.set('view','print');if(city)d.searchParams.set('city',city);return rewrite(d);}
function rewriteWatchdogSystemFile(request,apiPath){return rewrite(new URL(apiPath,request.url));}
function redirectCanonical(request,url,pathname){const destination=new URL(pathname,request.url);destination.search=url.search;return Response.redirect(destination,308);}
function blockedDataResponse(status,message,cacheControl){return new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cacheControl,'X-Robots-Tag':'noindex, nofollow, noarchive','X-Watchdog-Data-Access':'scoped-only'}});}
function securityBackend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key};}
async function edgeClientHash(request,key){const forwarded=String(request.headers.get('x-forwarded-for')||'').split(',')[0].trim();if(!forwarded)return '';const encoder=new TextEncoder();const hmacKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',hmacKey,encoder.encode(forwarded));return Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,'0')).join('');}
async function recordEdgeSecurityEvent(request,eventType,route,automationHint=false){try{const config=securityBackend();const clientHash=await edgeClientHash(request,config.key);const response=await fetch(`${config.url}/rest/v1/rpc/record_public_request_security_event`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_event_type:eventType,p_client_hash:clientHash||null,p_route:route,p_scope:null,p_automation_hint:Boolean(automationHint),p_detail:{}})});if(!response.ok)throw new Error(`security event http ${response.status}`);}catch(error){console.error('watchdog-data-edge telemetry',error&&error.message||error);}}
export default async function middleware(request){const url=new URL(request.url);const host=url.hostname.toLowerCase();const userAgent=request.headers.get('user-agent')||'';
if(LEGACY_NJPTR_HOSTS.has(host)&&(url.pathname==='/property'||url.pathname==='/property/'||url.pathname.startsWith('/property/')))return redirectLegacyWatchdogHost(request,url);
// The CO lookup is a Watchdog page; send NJPropertyTaxRelief visitors to it on the Watchdog host.
if(LEGACY_NJPTR_HOSTS.has(host)&&(url.pathname==='/co'||url.pathname==='/co/'||url.pathname==='/co/index.html')){const destination=new URL('/co',`https://${WATCHDOG_HOST}`);destination.search=url.search;return Response.redirect(destination,308);}
if(LEGACY_NJPTR_HOSTS.has(host)&&url.pathname.startsWith('/co/')&&!STATIC_FILE.test(url.pathname)){const destination=new URL(url.pathname,`https://${WATCHDOG_HOST}`);destination.search=url.search;return Response.redirect(destination,308);}
if(LEGACY_NJPTR_HOSTS.has(host)&&LEGACY_WATCHDOG_PROMO_PATHS.has(url.pathname))return rewriteLegacyAcquisitionPage(request,url.pathname);
if(BULK_SALES_FILE.test(url.pathname)){console.warn('watchdog-data-edge',JSON.stringify({event:'bulk_sales_blocked',path:url.pathname}));await recordEdgeSecurityEvent(request,'bulk_sales_blocked',url.pathname,AUTOMATION_UA.test(userAgent));return blockedDataResponse(404,'Bulk sales files are not a public delivery surface.','public, max-age=300, s-maxage=86400');}
if(GAMES_PRIVATE_FILE.test(url.pathname))return blockedDataResponse(404,'Not found.','public, max-age=300, s-maxage=86400');
if(REPO_NOTES_FILE.test(url.pathname))return blockedDataResponse(404,'Not found.','public, max-age=300, s-maxage=86400');
if(url.pathname===SALES_API_PATH&&AUTOMATION_UA.test(userAgent)){console.warn('watchdog-data-edge',JSON.stringify({event:'automation_client_blocked',path:url.pathname}));await recordEdgeSecurityEvent(request,'automation_client_blocked',url.pathname,true);return blockedDataResponse(403,'Automated bulk extraction is not permitted on this endpoint.','no-store');}
// CO town pages work on the Watchdog host and on preview deployments (NJPropertyTaxRelief was redirected above).
// Files like /co/co.css never match the page patterns, so coPageRewrite leaves them to the static checks below.
const taxMatch=url.pathname.match(TAX_PAGE_PATH);if(taxMatch){if(LEGACY_NJPTR_HOSTS.has(host)){const destination=new URL(url.pathname,`https://${WATCHDOG_HOST}`);destination.search=url.search;return Response.redirect(destination,308);}const d=new URL('/api/tax-town-page',request.url);if(taxMatch[1])d.searchParams.set('county',taxMatch[1]);if(taxMatch[2])d.searchParams.set('town',taxMatch[2]);return rewrite(d);}
if(url.pathname.startsWith('/co/')){if(url.pathname==='/co/embed'||url.pathname==='/co/embed/')return next();const co=coPageRewrite(request,url);if(co)return co;}
if(host.endsWith('.vercel.app')&&PROPERTY_PAGE_PATH.test(url.pathname)){const destination=new URL('/api/watchdog-property-page',request.url);destination.searchParams.set('path',url.pathname);return rewrite(destination);}
if(host!==WATCHDOG_HOST)return next();
if(WATCHDOG_TOOL_REDIRECTS.has(url.pathname))return redirectCanonical(request,url,WATCHDOG_TOOL_REDIRECTS.get(url.pathname));
if(url.pathname==='/anchor-estimator.html'||url.pathname==='/anchor-estimator'){const destination=new URL('/anchor-estimator.html','https://njpropertytaxrelief.com');destination.search=url.search;return Response.redirect(destination,308);}
if(url.pathname===INDEXNOW_KEY_PATH)return rewriteWatchdogSystemFile(request,'/api/watchdog-index-indexnow-key');
if(url.pathname==='/robots.txt')return rewriteWatchdogSystemFile(request,'/api/watchdog-index-robots');
if(url.pathname==='/sitemap.xml')return rewriteWatchdogSystemFile(request,'/api/watchdog-index-sitemap');
if(url.pathname==='/sitemap-properties.xml')return rewriteWatchdogSystemFile(request,'/api/watchdog-property-sitemap');
if(TYPED_SITEMAP_FILE.test(url.pathname))return next();
if(url.pathname==='/checkup'||url.pathname==='/checkup/'){const destination=new URL('/api/watchdog-checkup',request.url);destination.search=url.search;return rewrite(destination);}
if(url.pathname==='/true-cost'||url.pathname==='/true-cost/'){const destination=new URL('/api/watchdog-true-cost',request.url);destination.search=url.search;destination.searchParams.delete('q');return rewrite(destination);}
if(url.pathname==='/alerts/confirm'||url.pathname==='/alerts/unsubscribe'){const destination=new URL('/api/watchdog-property-alerts',request.url);destination.search=url.search;destination.searchParams.set('action',url.pathname.slice('/alerts/'.length));return rewrite(destination);}
if(PROPERTY_PAGE_PATH.test(url.pathname)){const destination=new URL('/api/watchdog-property-page',request.url);destination.searchParams.set('path',url.pathname);return rewrite(destination);}
if(ROOT_COMPAT_REDIRECTS.has(url.pathname))return redirectCanonical(request,url,ROOT_COMPAT_REDIRECTS.get(url.pathname));
if(LEGACY_FAQ_PATHS.has(url.pathname))return redirectCanonical(request,url,'/faq');
if(LEGACY_PUBLIC_REDIRECTS.has(url.pathname))return redirectCanonical(request,url,LEGACY_PUBLIC_REDIRECTS.get(url.pathname));
// One public homepage identity: exact legacy /property entry URLs permanently resolve to the canonical root. Do not redirect the /property/* implementation namespace.
if(url.pathname==='/property'||url.pathname==='/property/')return redirectCanonical(request,url,'/');
const publicPath=cleanPublicPath(url.pathname);
if(ROOT_STATIC_PAGES.has(publicPath))return next();
const legacyPortalMatch=url.pathname.match(LEGACY_AGENT_PORTAL_PATH);if(legacyPortalMatch&&!AGENT_RESERVED_SEGMENTS.has(legacyPortalMatch[1].toLowerCase()))return redirectCanonical(request,url,`/agent/${legacyPortalMatch[1].toLowerCase()}`);
const agentPortalMatch=url.pathname.match(AGENT_PORTAL_PATH);if(agentPortalMatch&&!AGENT_RESERVED_SEGMENTS.has(agentPortalMatch[1].toLowerCase())){const destination=new URL('/api/agent-portal-page',request.url);destination.searchParams.set('slug',agentPortalMatch[1].toLowerCase());return rewrite(destination);}
if(url.pathname.startsWith('/property/'))return next();
if(isReservedRootPath(url.pathname)||STATIC_FILE.test(url.pathname))return next();
return rewriteCleanPage(request,publicPath);}
export const config={matcher:['/((?!property/js/|property/css/).*)']};

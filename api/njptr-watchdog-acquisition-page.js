const UPSTREAM_ORIGIN = 'https://njtaxrelief.vercel.app';
const LEGACY_HOSTS = new Set(['njpropertytaxrelief.com','www.njpropertytaxrelief.com']);
const PAGE_MAP = new Map([
  ['/','/index.html'],
  ['/index.html','/index.html'],
  ['/anchor-estimator.html','/anchor-estimator.html'],
  ['/anchor-program.html','/anchor-program.html'],
  ['/senior-programs.html','/senior-programs.html'],
  ['/resources.html','/resources.html'],
  ['/anchor-auto-file-letters-2026.html','/anchor-auto-file-letters-2026.html']
]);

function first(value){return Array.isArray(value)?value[0]:value;}
function host(req){return String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'');}
function injectScript(out,src){
  const escaped=src.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp('(?:src=["\\\']'+escaped+'["\\\']|'+escaped+')','i').test(out))return out;
  return out.replace(/<\/body>/i,'<script defer src="'+src+'"></script>\n</body>');
}
function inject(html, pathname){
  let out=String(html||'');
  if(!/watchdog-promo\.css/i.test(out)) out=out.replace(/<\/head>/i,'  <link rel="stylesheet" href="/watchdog-promo.css">\n</head>');
  out=injectScript(out,'/watchdog-promo.js');
  if(pathname==='/anchor-estimator.html') out=injectScript(out,'/anchor-watchdog-handoff.js');
  return out;
}

module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');return res.end('Method not allowed');}
  if(!LEGACY_HOSTS.has(host(req))){res.statusCode=404;res.setHeader('Cache-Control','no-store');return res.end('Not found');}
  const pathname=String(first(req.query&&req.query.path)||'/').split('?')[0];
  const source=PAGE_MAP.get(pathname);
  if(!source){res.statusCode=404;res.setHeader('Cache-Control','no-store');return res.end('Not found');}
  try{
    const upstream=await fetch(new URL(source,UPSTREAM_ORIGIN),{headers:{'user-agent':'WatchdogNJPTRAcquisition/1.0'},redirect:'follow'});
    const body=await upstream.text();
    if(!upstream.ok||!/<html[\s>]/i.test(body)){throw new Error('legacy source unavailable '+upstream.status);}
    const html=inject(body,pathname);
    res.statusCode=200;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control',pathname==='/anchor-estimator.html'?'private, no-store, max-age=0':'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Vary','Host');
    res.setHeader('X-Watchdog-Acquisition','njptr-handoff-v1');
    if(req.method==='HEAD')return res.end();
    return res.end(html);
  }catch(error){
    console.error('NJPTR_WATCHDOG_ACQUISITION_PAGE',error);
    res.statusCode=502;res.setHeader('Cache-Control','no-store');return res.end('The page is temporarily unavailable.');
  }
};

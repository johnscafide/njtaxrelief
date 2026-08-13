const fs=require('fs'),path=require('path');
let errors=[];
function read(p){if(!fs.existsSync(p)){errors.push('missing '+p);return''}return fs.readFileSync(p,'utf8')}
const staticPlays=['assessment-change','appeal-window-farm','permit-complete'];
for(const slug of staticPlays){
 const p=`property/plays/${slug}/index.html`,h=read(p);
 const must=[/<title>[^<]{15,}<\/title>/i,/<meta\s+name=["']description["'][^>]+content=["'][^"']{70,}["']/i,/<link\s+rel=["']canonical["'][^>]+>/i,/<h1[^>]*>[\s\S]*?<\/h1>/i,/application\/ld\+json/i,/What the data cannot tell you/i,/Official sources to verify/i];
 must.forEach((rx,i)=>{if(!rx.test(h))errors.push(`${p} failed requirement ${i+1}`)});
 if(/noindex/i.test((h.match(/<meta[^>]+robots[^>]*>/i)||[''])[0]))errors.push(p+' is noindex');
 const text=h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 if(text.length<1400)errors.push(p+' unique body is too thin');
}
const v=JSON.parse(read('vercel.json')||'{}'),redirects=v.redirects||[],headers=v.headers||[];
const redirectSources=new Set();for(const r of redirects){if(redirectSources.has(r.source))errors.push('duplicate redirect '+r.source);redirectSources.add(r.source)}
for(const need of ['/index-old.html','/index_1.html','/property/towns/:path*'])if(!redirectSources.has(need))errors.push('missing crawl redirect '+need);
const noindexPaths=new Set(headers.filter(x=>(x.headers||[]).some(h=>h.key==='X-Robots-Tag'&&/noindex/i.test(h.value))).map(x=>x.source));
for(const need of ['/btc.html','/leadiq.html','/qscore.html','/property/insights/admin.html','/property/data-workbench.html','/property/data-center.html','/property/growth/(.*)'])if(!noindexPaths.has(need))errors.push('missing X-Robots-Tag noindex '+need);
const robots=read('robots.txt');for(const sm of ['sitemap.xml','sitemap-content.xml','sitemap-plays.xml','sitemap-glossary.xml'])if(!robots.includes(sm))errors.push('robots missing '+sm);
for(const sm of ['sitemap.xml','sitemap-content.xml','sitemap-plays.xml','sitemap-glossary.xml'])if(fs.existsSync(sm)){const x=read(sm),urls=[...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);if(new Set(urls).size!==urls.length)errors.push(sm+' contains duplicate URLs');for(const u of urls)if(/\/property\/towns\/|\/(?:btc|leadiq|qscore)\.html/.test(u))errors.push(sm+' contains excluded URL '+u)}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}console.log('Static SEO/crawl guard passed for NJW-121, NJW-128 and NJW-135.');
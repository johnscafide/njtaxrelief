function clean(v,n){return String(v??'').trim().slice(0,n)}
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
async function requireUser(req){
  const token=String(req.headers&&req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw Object.assign(new Error('Authentication required.'),{status:401});
  const c=backend(),r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token}});
  if(!r.ok)throw Object.assign(new Error('Authentication required.'),{status:401});return r.json();
}
function decode(s){return String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#x27;/gi,"'").replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function rows(html){
  const out=[];
  for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>decode(m[1]));
    if(cells.length<6)continue;
    const [name,employer_ref,license_number,business,license_type,status,authorities]=cells;
    if(!/\d{5,}/.test(license_number||''))continue;
    out.push({name,employer_ref,license_number,business,license_type,status,authorities:authorities||''});
    if(out.length>=12)break;
  }
  return out;
}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
  try{await requireUser(req)}catch(e){return res.status(e.status||401).json({error:e.message||'Authentication required.'})}
  const name=clean(req.query&&req.query.name,120),ref=clean(req.query&&req.query.license,30).replace(/[^0-9]/g,'');
  if(!name&&!ref)return res.status(400).json({error:'Enter a last name (recommended) or NJ license reference number.'});
  const url=new URL('https://www-dobi.nj.gov/DOBI_LicSearch/recLicenseeSearchServlet');
  url.searchParams.set('BookMark','recSearch.jsp');url.searchParams.set('Division','R');url.searchParams.set('LicenseStatus','');url.searchParams.set('LicenseType','');
  url.searchParams.set('LicenseeName',name);url.searchParams.set('LicenseeRefNum',ref);
  try{
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WatchdogLicenseVerification/1.0','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('NJDOBI returned HTTP '+r.status);
    const html=(await r.text()).slice(0,1200000),results=rows(html);
    return res.status(200).json({results,source:'New Jersey Department of Banking and Insurance Real Estate Commission',source_url:'https://www.nj.gov/dobi/division_rec/licensing/online_Instructions/licSearch.html',freshness:'NJDOBI states search data reflects changes on the next day.'});
  }catch(e){console.error('njrec-license-search',e.message);return res.status(502).json({error:'NJ Real Estate Commission lookup is temporarily unavailable.'})}
};
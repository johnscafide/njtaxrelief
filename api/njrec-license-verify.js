function clean(v,n){return String(v??'').trim().slice(0,n)}
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
async function requireUser(req){
  const token=String(req.headers&&req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw Object.assign(new Error('Authentication required.'),{status:401});
  const c=backend(),r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token}});
  if(!r.ok)throw Object.assign(new Error('Authentication required.'),{status:401});
  return {user:await r.json(),config:c};
}
async function rest(path,c){
  const r=await fetch(c.url+'/rest/v1/'+path,{headers:{apikey:c.key,Authorization:'Bearer '+c.key,Accept:'application/json'}});
  if(!r.ok)throw new Error('data http '+r.status);
  return r.json();
}
async function rpc(name,body,c){
  const r=await fetch(c.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:c.key,Authorization:'Bearer '+c.key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  const text=await r.text(),data=text?JSON.parse(text):null;if(!r.ok)throw new Error(data&&data.message||name+' http '+r.status);return data;
}
function decode(s){return String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#x27;/gi,"'").replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function rows(html){
  const out=[];for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>decode(m[1]));
    if(cells.length<6)continue;
    const [name,employer_ref,license_number,business,license_type,status,authorities]=cells;
    if(!/\d{5,}/.test(license_number||''))continue;
    out.push({name,employer_ref,license_number,business,license_type,status,authorities:authorities||''});
  }return out;
}
function digits(v){return String(v||'').replace(/\D/g,'')}
async function officialSearch(ref){
  const url=new URL('https://www-dobi.nj.gov/DOBI_LicSearch/recLicenseeSearchServlet');
  url.searchParams.set('BookMark','recSearch.jsp');url.searchParams.set('Division','R');url.searchParams.set('LicenseStatus','');url.searchParams.set('LicenseType','');url.searchParams.set('LicenseeName','');url.searchParams.set('LicenseeRefNum',ref);
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 WatchdogLicenseVerification/2.0','Accept':'text/html,application/xhtml+xml','Accept-Language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(8500)});
  if(!r.ok)throw Object.assign(new Error('NJDOBI returned HTTP '+r.status),{temporary:true});
  return rows((await r.text()).slice(0,1200000));
}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
  let auth;try{auth=await requireUser(req)}catch(e){return res.status(e.status||401).json({error:e.message||'Authentication required.'})}
  const body=req.body&&typeof req.body==='object'?req.body:{},license=clean(body.license_number,30),ref=digits(license);
  if(!/^\d{5,10}$/.test(ref))return res.status(400).json({error:'Enter a valid NJ real-estate license number.'});
  try{
    const profiles=await rest('watchdog_onboarding_profiles?select=primary_profession&user_id=eq.'+encodeURIComponent(auth.user.id)+'&limit=1',auth.config);
    if(!profiles[0]||profiles[0].primary_profession!=='real_estate')return res.status(403).json({error:'Real-estate professional profile required.'});
    const results=await officialSearch(ref),match=results.find(x=>digits(x.license_number)===ref);
    if(!match)return res.status(422).json({error:'No exact NJDOBI record matched this number. Use the license finder above and search by last name, then select the correct record.'});
    if(!/^(?:active(?:\s|$)|actively\s+licensed(?:\s|$))/i.test(String(match.status||'').trim()))return res.status(422).json({error:'NJDOBI found this license, but its status is '+(match.status||'not active')+'.',record:match});
    const verified=await rpc('verify_professional_license_official_v2',{p_user_id:auth.user.id,p_license_number:ref,p_licensee_name:match.name,p_source_status:match.status},auth.config);
    return res.status(200).json({verified:true,record:match,verification:Array.isArray(verified)?verified[0]||null:verified,source:'New Jersey Department of Banking and Insurance Real Estate Commission'});
  }catch(e){
    console.error('njrec-license-verify',e.message);
    return res.status(e.temporary?503:500).json({error:e.temporary?'NJ Real Estate Commission verification is temporarily unavailable.': 'License verification could not be completed.',temporary:Boolean(e.temporary)});
  }
};
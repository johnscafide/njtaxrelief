const DCA='https://data.nj.gov/resource/w9se-dmra.json';
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('backend unavailable');return{url,key}}
function clean(v,n){return String(v??'').trim().slice(0,n)}
function adminHeaders(c){return{apikey:c.key,Authorization:'Bearer '+c.key,Accept:'application/json'}}
async function jsonFetch(url,options={}){const r=await fetch(url,options);const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data?.message||data?.error||('http '+r.status));return data}
function municipalityStem(v){return clean(v,120).replace(/\./g,' ').replace(/\b(TOWNSHIP|TWP|BOROUGH|BORO|CITY|TOWN|VILLAGE)\b/ig,' ').replace(/\s+/g,' ').trim()}
function permitKey(v){return clean(v,100).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function permitSummary(rows){
 const groups=new Map(),issuedWithoutKey=[];
 for(const row of rows||[]){const key=permitKey(row?.permitno),status=clean(row?.status,10).toUpperCase();if(!key){if(status==='P')issuedWithoutKey.push(row);continue}const g=groups.get(key)||[];g.push(row);groups.set(key,g)}
 let candidates=0,certified=0,latest=null;
 for(const group of groups.values()){const cert=group.some(x=>clean(x?.status,10).toUpperCase()==='C'&&clean(x?.certdate,80));if(cert){certified++;continue}const issued=group.filter(x=>clean(x?.status,10).toUpperCase()==='P');if(!issued.length)continue;candidates++;for(const x of issued){const d=clean(x?.permitdate,80);if(d&&(!latest||d>latest))latest=d}}
 return{status:'available',verification_candidates:candidates,certified_lifecycles:certified,unmatchable_issued:issuedWithoutKey.length,latest_candidate_permit_date:latest,interpretation:'Permit/certificate verification candidates, not a legal finding that a permit is open.'}
}
async function permitReview(row){
 const digits=clean(row?.pams_pin,100).replace(/\D/g,''),tc=digits.slice(0,4),block=clean(row?.block,40),lot=clean(row?.lot,40);
 if(!/^\d{4}$/.test(tc)||!block||!lot)return{status:'missing_key',verification_candidates:null,interpretation:'Parcel keys are incomplete for an exact NJ DCA permit lookup.'};
 const esc=v=>String(v).replace(/'/g,"''"),p=new URLSearchParams({$where:`treasurycode='${esc(tc)}' AND block='${esc(block)}' AND lot='${esc(lot)}'`,$limit:'5000',$order:'permitdate DESC'});
 try{const rr=await fetch(DCA+'?'+p.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(3500)});if(!rr.ok)return{status:'provider_error',verification_candidates:null,interpretation:'NJ DCA permit source could not be checked.'};const rows=await rr.json();if(!Array.isArray(rows)||!rows.length)return{status:'no_rows',verification_candidates:0,interpretation:'No DCA rows were returned. This is coverage information, not proof that no permit issue exists.'};return permitSummary(rows)}catch{return{status:'provider_error',verification_candidates:null,interpretation:'NJ DCA permit source could not be checked.'}}
}
async function municipalRequirements(row,c){
 const stem=municipalityStem(row?.town||row?.city),county=clean(row?.county,80);if(!stem)return[];
 const p=new URLSearchParams({select:'requirement_key,requirement_state,title,application_url,department_url,last_verified_at,source_excerpt',municipality_name:'ilike.*'+stem+'*',limit:'8'});if(county)p.set('county','ilike.'+county);
 try{const rows=await jsonFetch(c.url+'/rest/v1/transaction_municipal_requirements?'+p.toString(),{headers:adminHeaders(c)});return(Array.isArray(rows)?rows:[]).map(x=>({requirement_key:x.requirement_key,requirement_state:x.requirement_state,title:x.title,application_url:x.application_url,department_url:x.department_url,last_verified_at:x.last_verified_at,source_excerpt:clean(x.source_excerpt,280)||null}))}catch{return[]}
}
module.exports=async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 const auth=String(req.headers.authorization||'');if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Sign in required.'});
 const token=auth.slice(7),q=clean(req.query?.q,120);if(q.length<3)return res.status(200).json({rows:[]});
 try{
   const c=backend();
   const user=await jsonFetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token,Accept:'application/json'}});if(!user?.id)return res.status(401).json({error:'Sign in required.'});
   const allowed=await jsonFetch(c.url+'/rest/v1/rpc/has_watchdog_plan',{method:'POST',headers:{apikey:c.key,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({required_plan:'agent'})});
   if(allowed!==true)return res.status(403).json({error:'Agent access required.'});
   const params=new URLSearchParams({select:'pams_pin,address,town,city,county,zip,block,lot,qualifier,prop_class,year_built,acres,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year',address:'ilike.*'+q.replace(/[%_*]/g,' ')+'*',limit:String(Math.min(Math.max(Number(req.query?.limit)||8,1),12))});
   const rows=await jsonFetch(c.url+'/rest/v1/property_lookups?'+params.toString(),{headers:adminHeaders(c)}),safe=Array.isArray(rows)?rows:[];
   const enriched=await Promise.all(safe.map(async row=>({...row,permit_review:await permitReview(row),municipal_requirements:await municipalRequirements(row,c)})));
   return res.status(200).json({rows:enriched});
 }catch(e){console.error('agent-property-search',e.message);return res.status(500).json({error:'Property search is unavailable right now.'})}
};
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('backend unavailable');return{url,key}}
function clean(v,n){return String(v??'').trim().slice(0,n)}
async function jsonFetch(url,options={}){const r=await fetch(url,options);const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data?.message||data?.error||('http '+r.status));return data}
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
   const params=new URLSearchParams({select:'pams_pin,address,town,city,county,zip,block,lot,qualifier,prop_class,year_built,acres,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year',address:'ilike.*'+q.replace(/[%_*]/g,' ')+'*',limit:String(Math.min(Math.max(Number(req.query?.limit)||8,1),15))});
   const rows=await jsonFetch(c.url+'/rest/v1/property_lookups?'+params.toString(),{headers:{apikey:c.key,Authorization:'Bearer '+c.key,Accept:'application/json'}});
   return res.status(200).json({rows:Array.isArray(rows)?rows:[]});
 }catch(e){console.error('agent-property-search',e.message);return res.status(500).json({error:'Property search is unavailable right now.'})}
};
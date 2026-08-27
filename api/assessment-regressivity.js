const crypto=require('crypto');
const AUTOMATION_UA=/\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS=[
  {bucket:'assessment_regressivity_minute',seconds:60,limit:30},
  {bucket:'assessment_regressivity_hour',seconds:3600,limit:120}
];
function backend(){
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('security backend unavailable');
  return {url,key};
}
function clientHash(req,key){
  const forwarded=String(req.headers&&req.headers['x-forwarded-for']||'').split(',')[0].trim();
  if(!forwarded)return '';
  return crypto.createHmac('sha256',key).update(forwarded).digest('hex');
}
async function rpc(name,body,config){
  const response=await fetch(config.url+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)
  });
  if(!response.ok)throw new Error(name+' http '+response.status);
  const text=await response.text();
  return text?JSON.parse(text):[];
}
async function event(config,type,hash,scope,automationHint,detail){
  try{await rpc('record_public_request_security_event',{
    p_event_type:type,p_client_hash:hash||null,p_route:'/api/assessment-regressivity',p_scope:scope||null,p_automation_hint:Boolean(automationHint),p_detail:detail||{}
  },config);}catch(err){console.error('assessment-regressivity security-event',err&&err.message||err);}
}
async function budget(req,district,automationHint){
  const config=backend();
  const hash=clientHash(req,config.key);
  if(!hash)throw new Error('client identity unavailable');
  if(automationHint){
    await event(config,'automation_client_blocked',hash,district,true,{});
    return {allowed:false,automation:true};
  }
  const checks=[];
  for(const b of BUDGETS){
    const rows=await rpc('consume_public_request_budget',{p_client_hash:hash,p_bucket:b.bucket,p_window_seconds:b.seconds,p_limit:b.limit},config);
    checks.push({b,row:Array.isArray(rows)?rows[0]||{}:rows||{}});
  }
  const blocked=checks.filter(x=>x.row.allowed!==true);
  if(blocked.length){
    await event(config,'rate_limited',hash,district,false,{});
    const reset=Math.max(...blocked.map(x=>Date.parse(x.row.reset_at)||Date.now()+60000));
    return {allowed:false,retryAfter:Math.max(1,Math.ceil((reset-Date.now())/1000))};
  }
  return {allowed:true,config,hash};
}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=900, stale-while-revalidate=3600');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const district=String(req.query&&req.query.district||'').replace(/\D/g,'').slice(0,4);
  const automationHint=AUTOMATION_UA.test(String(req.headers&&req.headers['user-agent']||''));
  let gate;
  try{gate=await budget(req,district||'unknown',automationHint);}catch(err){console.error('assessment-regressivity rate-limit',err&&err.message||err);res.setHeader('Retry-After','60');return res.status(503).json({error:'Assessment fairness data is temporarily unavailable.'});}
  if(gate.automation){console.warn('assessment-regressivity',JSON.stringify({event:'automation_client_blocked',district}));return res.status(403).json({error:'Automated extraction is not supported on this endpoint.'});}
  if(!gate.allowed){console.warn('assessment-regressivity',JSON.stringify({event:'rate_limited',district}));res.setHeader('Retry-After',String(gate.retryAfter||60));return res.status(429).json({error:'Request limit exceeded. Please retry later.'});}
  if(district.length!==4){
    console.warn('assessment-regressivity',JSON.stringify({event:'invalid_scope',district_length:district.length}));
    await event(gate.config,'invalid_scope',gate.hash,district||'unknown',false,{district_length:district.length});
    return res.status(400).json({error:'A four-digit New Jersey tax district is required.'});
  }
  try{
    const select='district_code,sample_count,sale_year_min,sale_year_max,lower_value_median_ratio,upper_value_median_ratio,lower_vs_upper_gap_pct,pattern,deciles,methodology_version,source_imported_at,refreshed_at';
    const response=await fetch(gate.config.url+'/rest/v1/assessment_regressivity_metrics?select='+encodeURIComponent(select)+'&district_code=eq.'+encodeURIComponent(district)+'&limit=1',{
      headers:{apikey:gate.config.key,Authorization:'Bearer '+gate.config.key,Accept:'application/json'}
    });
    if(!response.ok)throw new Error('metrics http '+response.status);
    const rows=await response.json();
    if(!Array.isArray(rows)||!rows.length)return res.status(404).json({district,available:false,reason:'Insufficient usable sales for a 10-decile study.'});
    return res.status(200).json({district,available:true,metric:rows[0],disclaimer:'Descriptive assessment-to-sale ratio pattern only. It does not establish assessor intent or a legal conclusion.'});
  }catch(err){console.error('assessment-regressivity',err&&err.message||err);return res.status(500).json({error:'Assessment fairness data is temporarily unavailable.'});}
};

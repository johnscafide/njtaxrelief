const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const ALLOWED=new Set(['atlantic','bergen','burlington','camden','cape-may','cumberland','essex','gloucester','hudson','hunterdon','mercer','middlesex','monmouth','morris','ocean','passaic','salem','somerset','sussex','union','warren']);
const AUTOMATION_UA=/\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS=[
  {bucket:'sales_by_district_minute',seconds:60,limit:20},
  {bucket:'sales_by_district_hour',seconds:3600,limit:80}
];
const cache=new Map();

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
    method:'POST',
    headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body)
  });
  if(!response.ok)throw new Error(name+' http '+response.status);
  const data=await response.json();
  return Array.isArray(data)?data:[data];
}
async function recordSecurityEvent(config,eventType,hash,scope,automationHint,detail){
  try{
    await rpc('record_public_request_security_event',{
      p_event_type:eventType,
      p_client_hash:hash||null,
      p_route:'/api/sales-by-district',
      p_scope:scope||null,
      p_automation_hint:Boolean(automationHint),
      p_detail:detail||{}
    },config);
  }catch(err){console.error('sales-by-district security-event',err&&err.message||err);}
}
async function enforceBudget(req,scope,automationHint){
  const config=backend();
  const hash=clientHash(req,config.key);
  if(!hash)throw new Error('client identity unavailable');
  const results=await Promise.all(BUDGETS.map(async function(budget){
    const rows=await rpc('consume_public_request_budget',{
      p_client_hash:hash,
      p_bucket:budget.bucket,
      p_window_seconds:budget.seconds,
      p_limit:budget.limit
    },config);
    const row=rows[0]||{};
    return {budget,row};
  }));
  const blocked=results.filter(function(item){return item.row.allowed!==true;});
  if(blocked.length){
    const resetMs=Math.max.apply(null,blocked.map(function(item){return Date.parse(item.row.reset_at)||Date.now()+60000;}));
    await recordSecurityEvent(config,'rate_limited',hash,scope,automationHint,{
      minute_remaining:Number(results[0]&&results[0].row.remaining||0),
      hour_remaining:Number(results[1]&&results[1].row.remaining||0)
    });
    return {allowed:false,retryAfter:Math.max(1,Math.ceil((resetMs-Date.now())/1000))};
  }
  if(automationHint){
    await recordSecurityEvent(config,'automation_hint',hash,scope,true,{});
  }
  return {allowed:true,config,hash};
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, max-age=300');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  res.setHeader('X-Watchdog-Sales-Scope','municipality');
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'Method not allowed'}));}
  const county=String(req.query&&req.query.county||'').toLowerCase().replace(/[^a-z-]/g,'');
  const district=String(req.query&&req.query.district||'').replace(/\D/g,'').slice(0,4);
  const automationHint=AUTOMATION_UA.test(String(req.headers&&req.headers['user-agent']||''));
  const scope=(county||'unknown')+':'+(district||'unknown');
  let budget;
  try{
    budget=await enforceBudget(req,scope,automationHint);
  }catch(err){
    console.error('sales-by-district rate-limit',err&&err.message||err);
    res.setHeader('Retry-After','60');
    return res.status(503).json({error:'Verified sales are temporarily unavailable.'});
  }
  if(!budget.allowed){
    console.warn('sales-by-district',JSON.stringify({event:'rate_limited',county,district,automation_hint:automationHint}));
    res.setHeader('Retry-After',String(budget.retryAfter));
    return res.status(429).json({error:'Request limit exceeded. Please retry later.'});
  }
  if(!ALLOWED.has(county)||district.length!==4){
    console.warn('sales-by-district',JSON.stringify({event:'invalid_scope',county,district_length:district.length,automation_hint:automationHint}));
    await recordSecurityEvent(budget.config,'invalid_scope',budget.hash,scope,automationHint,{district_length:district.length});
    return res.status(400).json({error:'Valid county and four-digit district are required.'});
  }
  try{
    let all=cache.get(county);
    if(!all){
      const file=path.join(process.cwd(),'property','sales-'+county+'.json');
      const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
      all=Array.isArray(parsed.sales)?parsed.sales:[];
      cache.set(county,all);
      if(cache.size>5)cache.delete(cache.keys().next().value);
    }
    const sales=all.filter(row=>String(row&&row.d||'').replace(/\D/g,'').slice(0,4)===district);
    console.info('sales-by-district',JSON.stringify({event:'served',county,district,rows:sales.length,automation_hint:automationHint}));
    return res.status(200).json({district,county,count:sales.length,sales});
  }catch(err){
    console.error('sales-by-district',err);
    return res.status(500).json({error:'Verified sales are temporarily unavailable.'});
  }
};

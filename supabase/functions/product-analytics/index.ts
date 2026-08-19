const ALLOWED_ORIGINS=new Set([
  'https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com',
  'https://watchdogre.com','https://www.watchdogre.com',
  'http://localhost:3000','http://localhost:5500','http://127.0.0.1:5500'
]);
const EVENTS=new Set([
  'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded',
  'export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed',
  'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
  'intent_question_shown','intent_question_answered','intent_question_skipped',
  'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened',
  'trust_evidence_opened'
]);
const PROPERTY_KEYS=new Set([
  'marker_id','plan','tool','action','format','source','result_count_bucket','status','billing_period','tier',
  'surface','interaction','model','intent_status','queue_state','reason_count_bucket'
]);
function cors(origin:string){return {'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(origin)?origin:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'};}
function s(v:any,n=120){return String(v??'').trim().slice(0,n)}
function uuid(v:any){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST'||!ALLOWED_ORIGINS.has(origin))return new Response('{"error":"not_allowed"}',{status:403,headers:cors(origin)});
 const len=Number(req.headers.get('content-length')||0);if(len>6000)return new Response('{"error":"too_large"}',{status:413,headers:cors(origin)});
 let b:any;try{b=await req.json()}catch{return new Response('{"error":"invalid_json"}',{status:400,headers:cors(origin)})}
 if(!EVENTS.has(String(b.event_name))||!uuid(b.visitor_id)||!uuid(b.session_id))return new Response('{"error":"invalid_event"}',{status:400,headers:cors(origin)});
 let props:any={};if(b.properties&&typeof b.properties==='object'&&!Array.isArray(b.properties)){for(const [k,v] of Object.entries(b.properties))if(PROPERTY_KEYS.has(k))props[k]=s(v,100)}
 const row={event_name:b.event_name,visitor_id:b.visitor_id,session_id:b.session_id,path:s(b.path,240),tool:s(b.tool,80),referrer_host:s(b.referrer_host,120),utm_source:s(b.utm_source,80),utm_medium:s(b.utm_medium,80),utm_campaign:s(b.utm_campaign,120),utm_content:s(b.utm_content,120),utm_term:s(b.utm_term,120),properties:props};
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return new Response('{"error":"server_config"}',{status:500,headers:cors(origin)});
 const r=await fetch(url+'/rest/v1/watchdog_product_events',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
 if(!r.ok){console.error('product analytics insert failed',r.status,await r.text());return new Response('{"error":"insert_failed"}',{status:500,headers:cors(origin)})}
 return new Response('{"ok":true}',{status:202,headers:cors(origin)});
});
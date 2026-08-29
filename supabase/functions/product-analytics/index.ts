import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ALLOWED_ORIGINS=new Set([
  'https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com',
  'https://watchdogre.com','https://www.watchdogre.com',
  'https://watchdogindex.com','https://www.watchdogindex.com',
  'http://localhost:3000','http://localhost:5500','http://127.0.0.1:5500'
]);
const EVENTS=new Set([
  'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded',
  'export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed',
  'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
  'intent_question_shown','intent_question_answered','intent_question_skipped',
  'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened',
  'trust_evidence_opened','presence_heartbeat'
]);
const PROPERTY_KEYS=new Set([
  'marker_id','plan','tool','action','format','source','result_count_bucket','status','billing_period','tier',
  'surface','interaction','model','intent_status','queue_state','reason_count_bucket'
]);
const AUDIENCE_CLASSES=new Set(['external_visitor','external_account','internal_owner','internal_agent','internal_developer','internal_test']);
const CLICK_SOURCES=new Set(['google_ads','meta_ads','microsoft_ads','tiktok_ads','linkedin_ads','other_paid']);
function cors(origin:string){return {'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(origin)?origin:'https://watchdogindex.com','Access-Control-Allow-Headers':'content-type, authorization, apikey, x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Max-Age':'7200','Vary':'Origin','Content-Type':'application/json'};}
function s(v:any,n=120){return String(v??'').trim().slice(0,n)}
function uuid(v:any){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function pathOnly(v:any,n=240){return s(v,n).split(/[?#]/,1)[0]}
function safeReferrer(v:any){const raw=s(v,700);if(!raw)return'';try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol))return'';return (u.origin+u.pathname).slice(0,500)}catch{return''}}

Deno.serve(async(req)=>{
  const origin=req.headers.get('origin')||'';
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST'||!ALLOWED_ORIGINS.has(origin))return new Response('{"error":"not_allowed"}',{status:403,headers:cors(origin)});
  const len=Number(req.headers.get('content-length')||0);if(len>9000)return new Response('{"error":"too_large"}',{status:413,headers:cors(origin)});
  let b:any;try{b=await req.json()}catch{return new Response('{"error":"invalid_json"}',{status:400,headers:cors(origin)})}
  if(!EVENTS.has(String(b.event_name))||!uuid(b.visitor_id)||!uuid(b.session_id))return new Response('{"error":"invalid_event"}',{status:400,headers:cors(origin)});

  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return new Response('{"error":"server_config"}',{status:500,headers:cors(origin)});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  let audience='external_visitor';
  let authUserId:string|null=null;
  const known=await admin.from('analytics_visitor_classes').select('audience_class').eq('visitor_id',b.visitor_id).maybeSingle();
  if(!known.error&&AUDIENCE_CLASSES.has(String(known.data?.audience_class||'')))audience=String(known.data.audience_class);

  const auth=req.headers.get('authorization')||'';
  if(auth.startsWith('Bearer ')){
    const token=auth.slice(7).trim();
    const verified=await admin.auth.getUser(token);
    const user=verified.data?.user;
    if(user){
      authUserId=user.id;
      const classified=await admin.rpc('watchdog_analytics_class_for_identity',{p_identity:user.id});
      const resolved=String(classified.data||'');
      if(!classified.error&&AUDIENCE_CLASSES.has(resolved))audience=resolved;
      else if(classified.error)console.error('analytics audience classification failed',classified.error.message);
      const now=new Date().toISOString();
      await admin.from('analytics_visitor_classes').upsert({visitor_id:b.visitor_id,audience_class:audience,updated_at:now},{onConflict:'visitor_id'});
      await admin.from('watchdog_product_events').update({audience_class:audience}).eq('visitor_id',b.visitor_id).neq('audience_class',audience);
    }
  }

  if(b.event_name==='presence_heartbeat'){
    const now=new Date().toISOString();
    const presence=await admin.from('watchdog_live_presence').upsert({
      session_id:b.session_id,
      visitor_id:b.visitor_id,
      user_id:authUserId,
      audience_class:audience,
      path:pathOnly(b.path,240),
      last_seen:now,
      updated_at:now
    },{onConflict:'session_id'});
    if(presence.error){console.error('presence heartbeat failed',presence.error.message);return new Response('{"error":"presence_failed"}',{status:500,headers:cors(origin)})}
    return new Response('{"ok":true}',{status:202,headers:cors(origin)});
  }

  let props:any={};
  if(b.properties&&typeof b.properties==='object'&&!Array.isArray(b.properties)){
    for(const [k,v] of Object.entries(b.properties))if(PROPERTY_KEYS.has(k))props[k]=s(v,100);
  }
  const clickSource=CLICK_SOURCES.has(String(b.click_source||''))?String(b.click_source):'';
  const row={
    event_name:b.event_name,visitor_id:b.visitor_id,session_id:b.session_id,audience_class:audience,
    path:pathOnly(b.path,240),tool:s(b.tool,80),
    referrer_host:s(b.referrer_host,120),referrer_url:safeReferrer(b.referrer_url),landing_path:pathOnly(b.landing_path,240),
    session_referrer_host:s(b.session_referrer_host,120),session_referrer_url:safeReferrer(b.session_referrer_url),session_landing_path:pathOnly(b.session_landing_path,240),
    utm_source:s(b.utm_source,80),utm_medium:s(b.utm_medium,80),utm_campaign:s(b.utm_campaign,120),utm_content:s(b.utm_content,120),utm_term:s(b.utm_term,120),
    session_utm_source:s(b.session_utm_source,80),session_utm_medium:s(b.session_utm_medium,80),session_utm_campaign:s(b.session_utm_campaign,120),session_utm_content:s(b.session_utm_content,120),session_utm_term:s(b.session_utm_term,120),
    click_source:clickSource,properties:props
  };
  const inserted=await admin.from('watchdog_product_events').insert(row);
  if(inserted.error){console.error('product analytics insert failed',inserted.error.message);return new Response('{"error":"insert_failed"}',{status:500,headers:cors(origin)})}
  return new Response('{"ok":true}',{status:202,headers:cors(origin)});
});

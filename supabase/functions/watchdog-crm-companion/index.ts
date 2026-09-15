import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const WEB_ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const PAID_PLANS=new Set(["agent","pro","pro_plus","teams","developer"]);
const PAID_STATUSES=new Set(["active","trialing","past_due"]);
const EVENT_NAMES=new Set(["session_connected","session_status","session_expired","session_disconnected","extension_opened","boldtrail_contact_detected","boldtrail_contact_missing","lookup_started","lookup_succeeded","lookup_no_match","lookup_ambiguous","field_previewed","crm_write_started","crm_write_succeeded","crm_write_failed"]);
const EXTENSION_ORIGIN=/^chrome-extension:\/\/[a-p]{32}$/i;
const SAFE_META_KEYS=new Set(["adapter","field_mode","candidate_count","source_count","reason","browser"]);
const NJOGIS="https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query";
const NJOGIS_SOURCE="https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0";
const SUFFIXES=new Set(["ST","RD","AVE","BLVD","DR","LN","CT","CIR","PL","PKWY","HWY","TER","WAY","TRL","SQ","RTE"]);
const PROPERTY_SELECT="pams_pin,address,city,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,dwelling_units,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year,lat,lon,last_seen,history";

function namedEnv(jsonName,legacyName){
  const raw=Deno.env.get(jsonName)||"";
  if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default);}catch{}}
  return Deno.env.get(legacyName)||"";
}
function clean(value,max=160){return String(value??"").replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim().slice(0,max);}
function normalizePlan(value){const plan=clean(value,30).toLowerCase().replace("pro+","pro_plus");return PAID_PLANS.has(plan)?plan:"standard";}
function isUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));}
function allowedOrigin(origin){return WEB_ORIGINS.has(origin)||EXTENSION_ORIGIN.test(origin)||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);}
function cors(req){
  const origin=req.headers.get("origin")||"",allow=allowedOrigin(origin)?origin:"https://watchdogindex.com";
  return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-watchdog-extension-token, x-watchdog-extension-version","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"7200","Vary":"Origin"};
}
function reply(req,status,payload){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"}});}
async function sha256(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function safeMetadata(input){
  const out={};
  if(!input||typeof input!=="object"||Array.isArray(input))return out;
  for(const[key,value]of Object.entries(input)){
    if(!SAFE_META_KEYS.has(key))continue;
    if(typeof value==="number"&&Number.isFinite(value))out[key]=Math.max(-100000,Math.min(100000,value));
    else if(typeof value==="boolean")out[key]=value;
    else out[key]=clean(value,80);
  }
  return out;
}
function normalizeAddress(value){
  let text=clean(value,220).toUpperCase();
  text=text.replace(/\b(APT|UNIT|SUITE|STE|#)\s*[A-Z0-9-]+\b/g," ");
  text=text.replace(/\bNEW JERSEY\b|\bNJ\b/g," ").replace(/\b\d{5}(?:-\d{4})?\b/g," ");
  text=text.replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  const replacements={STREET:"ST",ROAD:"RD",AVENUE:"AVE",BOULEVARD:"BLVD",DRIVE:"DR",LANE:"LN",COURT:"CT",CIRCLE:"CIR",PLACE:"PL",PARKWAY:"PKWY",HIGHWAY:"HWY",TERRACE:"TER",TRAIL:"TRL",SQUARE:"SQ",ROUTE:"RTE"};
  return text.split(" ").map(token=>replacements[token]||token).join(" ");
}
function addressParts(value){
  const tokens=normalizeAddress(value).split(" ").filter(Boolean);
  const number=/^\d+[A-Z]?$/.test(tokens[0]||"")?tokens.shift():"";
  let suffix="";
  if(tokens.length&&SUFFIXES.has(tokens[tokens.length-1]))suffix=tokens.pop();
  return{number,street:tokens.join(" "),suffix};
}
function levenshtein(a,b){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
function streetSimilarity(a,b){
  const A=addressParts(a).street,B=addressParts(b).street;
  if(!A||!B)return 0;if(A===B)return 1;
  const at=new Set(A.split(" ").filter(Boolean)),bt=new Set(B.split(" ").filter(Boolean));
  let inter=0;for(const token of at)if(bt.has(token))inter++;
  const union=new Set([...at,...bt]).size||1;
  const tokenScore=inter/union;
  const editScore=1-(levenshtein(A,B)/Math.max(A.length,B.length,1));
  return Math.max(0,Math.min(1,Math.max(tokenScore,editScore)));
}
function addressScore(input,candidate){
  const a=addressParts(input),b=addressParts(candidate);
  if(!a.number||!b.number||a.number!==b.number)return 0;
  const street=streetSimilarity(input,candidate);
  let score=.28+(.56*street);
  if(a.suffix&&b.suffix)score+=a.suffix===b.suffix?.06:-.24;
  else score+=.03;
  return Math.max(0,Math.min(.9,score));
}
function parseZip(value){const match=clean(value,40).match(/\b(\d{5})(?:-\d{4})?\b/);return match?match[1]:"";}
function houseNumber(value){return addressParts(value).number;}
function num(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function saleYear(value){const text=String(value??"").trim();if(/^\d{6}$/.test(text)){const yy=Number(text.slice(0,2)),currentYY=new Date().getFullYear()%100;return yy<=currentYY?2000+yy:1900+yy;}const full=text.match(/(19|20)\d{2}/);return full?Number(full[0]):null;}
function publicCandidate(row,confidence,street){
  return{id:clean(row.pams_pin,100),address:clean(row.address,160),town:clean(row.town||row.city,80),county:clean(row.county,80),zip:clean(row.zip,10),confidence:Math.round(confidence*100)/100,street_similarity:Math.round((street??0)*100)/100};
}
function normalizeNjogis(attributes){
  return{pams_pin:clean(attributes.PAMS_PIN,100),address:clean(attributes.PROP_LOC,220),town:clean(attributes.MUN_NAME,120),county:clean(attributes.COUNTY,80),zip:clean(attributes.ZIP5||attributes.ZIP_CODE,10),block:clean(attributes.PCLBLOCK,40),lot:clean(attributes.PCLLOT,40),qualifier:clean(attributes.PCLQCODE,40),prop_class:clean(attributes.PROP_CLASS,10),year_built:num(attributes.YR_CONSTR),acres:num(attributes.CALC_ACRE),building_desc:clean(attributes.BLDG_DESC,220),land_value:num(attributes.LAND_VAL),improvement_value:num(attributes.IMPRVT_VAL),assessed_value:num(attributes.NET_VALUE),last_year_tax:num(attributes.LAST_YR_TX),effective_rate:null,last_sale_price:num(attributes.SALE_PRICE),last_sale_year:saleYear(attributes.DEED_DATE),last_seen:new Date().toISOString(),history:{source:"NJ Office of GIS statewide Parcels and MOD-IV Composite",purpose:"crm_companion_lookup",cached_at:new Date().toISOString(),deed_date_format:"YYMMDD",deed_parser_version:2}};
}
function rank(rows,address,city,zip){
  return rows.map(row=>{
    let score=addressScore(address,String(row.address||""));
    const street=streetSimilarity(address,String(row.address||""));
    if(city){
      const inputCity=city.toUpperCase(),rowCity=String(row.city||row.town||"").toUpperCase();
      if(rowCity&&inputCity&&rowCity===inputCity)score+=.05;
    }
    if(zip&&String(row.zip||"").slice(0,5)===zip)score+=.05;
    return{row,score:Math.max(0,Math.min(1,score)),street};
  }).sort((a,b)=>b.score-a.score||b.street-a.street);
}
async function njogisRows(address,zip){
  const normalized=normalizeAddress(address),parts=normalized.split(" ").filter(Boolean);
  if(parts.length<2)return[];
  const number=parts[0],street=parts.slice(1);
  if(SUFFIXES.has(street[street.length-1]))street.pop();
  if(!street.length)return[];
  const prefix=`${number} ${street.slice(0,4).join(" ")}`.replaceAll("'","''"),where=[`PROP_LOC LIKE '${prefix}%'`];
  if(zip)where.push(`(ZIP5='${zip}' OR ZIP_CODE LIKE '${zip}%')`);
  const params=new URLSearchParams({f:"json",where:where.join(" AND "),outFields:"PAMS_PIN,PCLBLOCK,PCLLOT,PCLQCODE,COUNTY,MUN_NAME,PROP_CLASS,PROP_LOC,ZIP_CODE,ZIP5,LAND_VAL,IMPRVT_VAL,NET_VALUE,LAST_YR_TX,BLDG_DESC,CALC_ACRE,YR_CONSTR,SALE_PRICE,DEED_DATE",returnGeometry:"false",resultRecordCount:"80",orderByFields:"MUN_NAME ASC, PROP_LOC ASC"});
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
  try{
    const res=await fetch(`${NJOGIS}?${params}`,{signal:ctrl.signal,headers:{Accept:"application/json"}});
    if(!res.ok)return[];
    const json=await res.json().catch(()=>({}));if(json?.error)return[];
    return(json?.features||[]).map(feature=>normalizeNjogis(feature.attributes||{})).filter(row=>row.pams_pin&&row.address);
  }catch{return[];}finally{clearTimeout(timer);}
}
async function currentAccess(admin,userId){
  const[{data:ent},{data:profile}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier,billing_tier,subscription_status").eq("user_id",userId).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",userId).maybeSingle()
  ]);
  const developer=String(profile?.account_role||"")==="developer";
  if(developer)return{allowed:true,plan:"developer",status:"active"};
  const plan=normalizePlan(ent?.billing_tier||ent?.plan_tier),status=clean(ent?.subscription_status,30).toLowerCase();
  return{allowed:PAID_PLANS.has(plan)&&PAID_STATUSES.has(status),plan,status};
}
async function logEvent(admin,session,eventName,extras={}){
  if(!EVENT_NAMES.has(eventName)||!session?.user_id)return;
  const fieldsCount=Number(extras.fields_count);
  await admin.from("watchdog_extension_events").insert({user_id:session.user_id,session_id:session.id||null,event_name:eventName,extension_version:clean(extras.extension_version||session.extension_version,30)||null,plan_tier:clean(session.plan_tier,30)||null,crm_surface:"boldtrail",match_status:clean(extras.match_status,30)||null,fields_count:Number.isFinite(fieldsCount)?Math.max(0,Math.min(50,Math.round(fieldsCount))):null,metadata:safeMetadata(extras.metadata)});
}
async function resolveSession(req,admin){
  const raw=clean(req.headers.get("x-watchdog-extension-token"),200);
  if(raw.length<32)return{error:"not_connected",status:401};
  const hash=await sha256(raw),{data:session,error}=await admin.from("watchdog_extension_sessions").select("*").eq("token_hash",hash).maybeSingle();
  if(error||!session||session.revoked_at)return{error:"not_connected",status:401};
  if(Date.parse(String(session.expires_at||""))<=Date.now()){await logEvent(admin,session,"session_expired");return{error:"session_expired",status:401};}
  const access=await currentAccess(admin,session.user_id);
  if(!access.allowed)return{error:"paid_plan_required",status:403,plan:access.plan};
  await admin.from("watchdog_extension_sessions").update({last_used_at:new Date().toISOString(),plan_tier:access.plan}).eq("id",session.id);
  session.plan_tier=access.plan;
  return{session,access};
}
async function buildMatch(admin,row,confidence,alternatives,directPins){
  const[{data:snapshots},{data:scoreRows}]=await Promise.all([
    admin.from("property_record_snapshots").select("source_kind,source_url,source_recorded_at,captured_at").eq("pams_pin",row.pams_pin).order("captured_at",{ascending:false}).limit(8),
    admin.from("property_watchdog_scores").select("watchdog_score,observed_at").eq("pams_pin",row.pams_pin).order("observed_at",{ascending:false}).limit(1)
  ]);
  const seen=new Set(),sources=(snapshots||[]).filter(source=>{const k=`${source.source_kind||""}|${source.source_url||""}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,5).map(source=>({kind:clean(source.source_kind,80),url:/^https?:\/\//i.test(String(source.source_url||""))?String(source.source_url).slice(0,900):"",recorded_at:source.source_recorded_at||null,captured_at:source.captured_at||null}));
  const njogisEvidence=directPins?.has(row.pams_pin)||String(row?.history?.source||"").includes("NJ Office of GIS");
  if(njogisEvidence&&!sources.some(s=>String(s.kind).includes("NJ Office of GIS")))sources.unshift({kind:"NJ Office of GIS statewide Parcels and MOD-IV Composite",url:NJOGIS_SOURCE,recorded_at:null,captured_at:row.last_seen||new Date().toISOString()});
  const watchdogScore=scoreRows?.[0]?.watchdog_score??null;
  return{
    kind:"match",
    confidence:Math.round(confidence*100)/100,
    alternatives:alternatives||[],
    facts:{
      property_id:clean(row.pams_pin,100),
      address:clean(row.address,160),
      municipality:clean(row.town||row.city,80),
      county:clean(row.county,80),
      zip:clean(row.zip,10),
      block:clean(row.block,40),
      lot:clean(row.lot,40),
      qualifier:clean(row.qualifier,40),
      property_class:clean(row.prop_class,20),
      year_built:row.year_built??null,
      dwelling_units:row.dwelling_units??null,
      acres:row.acres??null,
      building_description:clean(row.building_desc,160),
      land_value:row.land_value??null,
      improvement_value:row.improvement_value??null,
      assessed_value:row.assessed_value??null,
      annual_property_tax:row.last_year_tax??null,
      effective_tax_rate:row.effective_rate??null,
      last_sale_price:row.last_sale_price??null,
      last_sale_year:row.last_sale_year??null,
      watchdog_score:watchdogScore,
      last_verified:row.last_seen??null
    },
    sources:sources.slice(0,5),
    source_summary:"Watchdog normalized New Jersey public-record warehouse",
    limitation:"Research context only. Watchdog does not infer ownership, seller intent, motivation, demographics, title status, or appraisal conclusions."
  };
}
async function findProperty(admin,input){
  const candidateId=clean(input.candidate_id,100);
  if(candidateId){
    const exact=await admin.from("property_lookups").select(PROPERTY_SELECT).eq("pams_pin",candidateId).maybeSingle();
    if(exact.error)throw exact.error;
    if(!exact.data)return{kind:"no_match",candidates:[]};
    return buildMatch(admin,exact.data,1,[],new Set());
  }

  const address=clean(input.address,220),city=clean(input.city,80),zip=parseZip(input.zip||address),number=houseNumber(address);
  if(!address||!number)return{kind:"no_match",candidates:[]};

  let query=admin.from("property_lookups").select(PROPERTY_SELECT);
  if(zip)query=query.eq("zip",zip);
  query=query.ilike("address",`${number}%`).limit(zip?100:180);
  const cached=await query;
  if(cached.error)throw cached.error;

  let rows=cached.data||[],scored=rank(rows,address,city,zip),best=scored[0],runner=scored[1];
  const directPins=new Set();
  const strongStreet=best&&best.street>=.9;
  const confident=best&&strongStreet&&best.score>=.82&&(!runner||runner.score<.68||(best.score-runner.score)>=.1);

  if(!confident){
    const direct=await njogisRows(address,zip);
    if(direct.length){
      for(const row of direct)directPins.add(row.pams_pin);
      const byPin=new Map();
      for(const row of rows)if(row.pams_pin)byPin.set(row.pams_pin,row);
      for(const row of direct)byPin.set(row.pams_pin,{...(byPin.get(row.pams_pin)||{}),...row});
      rows=[...byPin.values()];
      scored=rank(rows,address,city,zip);best=scored[0];runner=scored[1];
      await admin.from("property_lookups").upsert(direct,{onConflict:"pams_pin"});
    }
  }

  const candidates=scored.slice(0,6).map(x=>publicCandidate(x.row,x.score,x.street));
  if(!best||best.score<.58||best.street<.5)return{kind:"no_match",candidates};
  if(runner&&runner.score>=.64&&(best.score-runner.score)<.1)return{kind:"ambiguous",candidates};

  const alternatives=scored.filter(x=>x.row.pams_pin!==best.row.pams_pin&&x.score>=.32).slice(0,5).map(x=>publicCandidate(x.row,x.score,x.street));
  return buildMatch(admin,best.row,best.score,alternatives,directPins);
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return reply(req,405,{error:"method_not_allowed"});
  const origin=req.headers.get("origin")||"";
  if(origin&&!allowedOrigin(origin))return reply(req,403,{error:"origin_not_allowed"});

  const url=Deno.env.get("SUPABASE_URL")||"",publicKey=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secretKey=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publicKey||!secretKey)return reply(req,503,{error:"service_unavailable"});
  const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});

  let body={};
  try{body=await req.json();}catch{return reply(req,400,{error:"invalid_json"});}
  const action=clean(body.action,60),version=clean(body.extension_version||req.headers.get("x-watchdog-extension-version"),30);

  if(action==="pair.approve"){
    if(!WEB_ORIGINS.has(origin)&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))return reply(req,403,{error:"web_origin_required"});
    const auth=req.headers.get("authorization")||"";
    if(!auth.startsWith("Bearer "))return reply(req,401,{error:"sign_in_required"});
    const verified=await admin.auth.getUser(auth.slice(7).trim()),user=verified.data?.user;
    if(!user)return reply(req,401,{error:"session_invalid"});
    const access=await currentAccess(admin,user.id);
    if(!access.allowed)return reply(req,403,{error:"paid_plan_required",plan:access.plan});
    const deviceId=clean(body.device_id,80),challenge=clean(body.challenge,80).toLowerCase();
    if(!isUuid(deviceId)||!/^[0-9a-f]{64}$/.test(challenge))return reply(req,400,{error:"invalid_pairing_request"});
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    const upsert=await admin.from("watchdog_extension_pairings").upsert({device_id:deviceId,user_id:user.id,challenge_sha256:challenge,plan_tier:access.plan,extension_version:version||null,expires_at:expiresAt,approved_at:new Date().toISOString(),claimed_at:null},{onConflict:"device_id"});
    if(upsert.error)return reply(req,503,{error:"pairing_unavailable"});
    return reply(req,200,{ok:true,plan:access.plan,expires_at:expiresAt});
  }

  if(action==="pair.claim"){
    const deviceId=clean(body.device_id,80),deviceSecret=clean(body.device_secret,200);
    if(!isUuid(deviceId)||deviceSecret.length<32)return reply(req,400,{error:"invalid_pairing_request"});
    const{data:pairing}=await admin.from("watchdog_extension_pairings").select("*").eq("device_id",deviceId).maybeSingle();
    if(!pairing||pairing.claimed_at||Date.parse(String(pairing.expires_at||""))<=Date.now())return reply(req,409,{error:"pairing_not_ready"});
    if(await sha256(deviceSecret)!==pairing.challenge_sha256)return reply(req,403,{error:"pairing_secret_invalid"});
    const access=await currentAccess(admin,pairing.user_id);
    if(!access.allowed)return reply(req,403,{error:"paid_plan_required",plan:access.plan});
    const rawToken=randomToken(),tokenHash=await sha256(rawToken),expiresAt=new Date(Date.now()+30*24*60*60*1000).toISOString(),browser=clean(body.browser,30);
    const created=await admin.from("watchdog_extension_sessions").insert({user_id:pairing.user_id,token_hash:tokenHash,plan_tier:access.plan,extension_version:version||pairing.extension_version||null,browser_family:browser||null,expires_at:expiresAt}).select("*").single();
    if(created.error||!created.data)return reply(req,503,{error:"session_unavailable"});
    await admin.from("watchdog_extension_pairings").update({claimed_at:new Date().toISOString()}).eq("device_id",deviceId);
    await logEvent(admin,created.data,"session_connected",{extension_version:version,metadata:{browser}});
    return reply(req,200,{ok:true,token:rawToken,plan:access.plan,expires_at:expiresAt});
  }

  const resolved=await resolveSession(req,admin);
  if(!resolved.session)return reply(req,resolved.status||401,{error:resolved.error||"not_connected",plan:resolved.plan||null});
  const session=resolved.session;

  if(action==="session.status"){
    await logEvent(admin,session,"session_status",{extension_version:version});
    return reply(req,200,{ok:true,connected:true,plan:session.plan_tier,expires_at:session.expires_at});
  }
  if(action==="session.disconnect"){
    await logEvent(admin,session,"session_disconnected",{extension_version:version});
    await admin.from("watchdog_extension_sessions").update({revoked_at:new Date().toISOString()}).eq("id",session.id);
    return reply(req,200,{ok:true});
  }
  if(action==="track"){
    const eventName=clean(body.event_name,60);
    if(!EVENT_NAMES.has(eventName))return reply(req,400,{error:"invalid_event"});
    await logEvent(admin,session,eventName,{extension_version:version,match_status:clean(body.match_status,30),fields_count:body.fields_count,metadata:body.metadata});
    return reply(req,202,{ok:true});
  }
  if(action==="lookup"){
    const since=new Date(Date.now()-60*60*1000).toISOString();
    const usage=await admin.from("watchdog_extension_events").select("id",{count:"exact",head:true}).eq("session_id",session.id).eq("event_name","lookup_started").gte("occurred_at",since);
    if((usage.count||0)>=200)return reply(req,429,{error:"lookup_rate_limited"});
    await logEvent(admin,session,"lookup_started",{extension_version:version});
    try{
      const result=await findProperty(admin,body.contact&&typeof body.contact==="object"?body.contact:{});
      if(result.kind==="match"){
        await logEvent(admin,session,"lookup_succeeded",{extension_version:version,match_status:"match",metadata:{source_count:result.sources?.length||0,candidate_count:result.alternatives?.length||0}});
        return reply(req,200,result);
      }
      if(result.kind==="ambiguous"){
        await logEvent(admin,session,"lookup_ambiguous",{extension_version:version,match_status:"ambiguous",metadata:{candidate_count:result.candidates?.length||0}});
        return reply(req,200,result);
      }
      await logEvent(admin,session,"lookup_no_match",{extension_version:version,match_status:"no_match",metadata:{candidate_count:result.candidates?.length||0}});
      return reply(req,200,result);
    }catch(error){
      console.error("CRM companion lookup failed",error);
      return reply(req,503,{error:"lookup_unavailable"});
    }
  }
  return reply(req,400,{error:"unknown_action"});
});

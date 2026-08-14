import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
function headers(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};}
function json(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...headers(req),'Content-Type':'application/json'}})}
const clean=(v:unknown,max=120)=>String(v??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max);

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:headers(req)});
  if(!['GET','POST'].includes(req.method))return json(req,405,{error:'Method not allowed'});
  const u=new URL(req.url);
  let token=clean(u.searchParams.get('token'),128);
  let eventType='page_view';
  let metadata:Record<string,unknown>={};
  if(req.method==='POST'){
    const o=req.headers.get('origin')||'';
    if(o&&!ORIGINS.has(o))return json(req,403,{error:'Origin not allowed'});
    const body=await req.json().catch(()=>({}));
    token=token||clean(body?.token,128);
    eventType=clean(body?.event_type||'page_view',30).toLowerCase();
    if(!['page_view','qr_scan','form_submit'].includes(eventType))return json(req,400,{error:'Unsupported tracking event'});
    const supplied=body?.metadata&&typeof body.metadata==='object'&&!Array.isArray(body.metadata)?body.metadata:{};
    metadata={page:clean(supplied.page,180),referrer_host:clean(supplied.referrer_host,120),creative:clean(supplied.creative,80)};
  }
  if(!/^[a-f0-9]{64}$/i.test(token))return json(req,404,{error:'Tracking link not found'});
  const{data:link,error}=await service.from('marketing_tracking_links').select('id,user_id,campaign_id,link_type,destination_path,active,expires_at').eq('token',token).maybeSingle();
  if(error||!link||!link.active||(link.expires_at&&new Date(link.expires_at).getTime()<=Date.now()))return json(req,404,{error:'Tracking link not found'});
  if(req.method==='GET'&&eventType==='page_view')eventType=link.link_type==='qr'?'qr_scan':'page_view';
  const conversion=eventType==='form_submit'?'lead':null;
  const{error:writeError}=await service.from('marketing_attribution').insert({user_id:link.user_id,campaign_id:link.campaign_id,touchpoint_type:eventType,touchpoint_ref:String(link.id),conversion_type:conversion,tracking_link_id:link.id,qualified:conversion?false:null,attribution_model:'direct',metadata:{...metadata,link_type:link.link_type},occurred_at:new Date().toISOString()});
  if(writeError){console.error('MARKETING_TRACK_WRITE_ERROR',writeError);return json(req,503,{error:'Tracking is temporarily unavailable'})}
  await service.from('marketing_events').insert({user_id:link.user_id,campaign_id:link.campaign_id,event_type:`tracking.${eventType}`,source:'watchdog',payload:{tracking_link_id:link.id,conversion_type:conversion}});
  if(req.method==='GET'){
    const dest='https://njpropertytaxrelief.com'+String(link.destination_path||'/property/');
    return new Response(null,{status:302,headers:{Location:dest,'Cache-Control':'no-store'}});
  }
  return json(req,200,{ok:true});
});

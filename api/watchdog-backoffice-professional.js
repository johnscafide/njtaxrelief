const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com','watchdogindex.com']);

function requestHost(req){return String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase().replace(/:\d+$/,'')}
function allowedHost(host){return ALLOWED_HOSTS.has(host)||host.endsWith('.vercel.app')||host==='localhost'||host==='127.0.0.1'}
function bearer(req){const m=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);return m?m[1]:''}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))}
function text(v,n=500){return String(v==null?'':v).trim().slice(0,n)}
function serviceHeaders(extra){return Object.assign({apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,Accept:'application/json'},extra||{})}

async function requireDeveloper(token){
  if(!token)return{ok:false,status:401,error:'Developer sign-in is required.'};
  const ur=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+token},cache:'no-store'});
  if(!ur.ok)return{ok:false,status:401,error:'Developer sign-in is required.'};
  const user=await ur.json();
  const dr=await fetch(SUPABASE_URL+'/rest/v1/rpc/is_watchdog_developer',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:'{}',cache:'no-store'});
  if(!dr.ok)return{ok:false,status:403,error:'Developer access is required.'};
  const yes=await dr.json().catch(()=>false);if(yes!==true)return{ok:false,status:403,error:'Developer access is required.'};
  return{ok:true,user};
}
async function rows(table,params){
  const u=new URL(SUPABASE_URL+'/rest/v1/'+table);
  Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const r=await fetch(u,{headers:serviceHeaders(),cache:'no-store'});if(!r.ok)throw new Error('Could not load '+table+'.');
  const data=await r.json();return Array.isArray(data)?data:[];
}
async function rpc(name,body){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:serviceHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body||{}),cache:'no-store'});
  const raw=await r.text(),data=raw?JSON.parse(raw):null;if(!r.ok)throw new Error(data&&data.message||data&&data.error||('RPC '+name+' failed.'));
  return data;
}
async function insert(table,body){
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+table,{method:'POST',headers:serviceHeaders({'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(body),cache:'no-store'});
  if(!r.ok)throw new Error('Could not write audit event.');
}
async function headCount(table,filters){
  const u=new URL(SUPABASE_URL+'/rest/v1/'+table);u.searchParams.set('select','id');
  Object.entries(filters||{}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const r=await fetch(u,{method:'HEAD',headers:serviceHeaders({Prefer:'count=exact',Range:'0-0'}),cache:'no-store'});
  if(!r.ok&&r.status!==206)throw new Error('Could not count '+table+'.');
  const total=Number(String(r.headers.get('content-range')||'').split('/')[1]);return Number.isFinite(total)?total:0;
}
async function counts(){
  const [realtor,connections]=await Promise.all([
    headCount('professional_realtor_verifications',{verification_status:'eq.pending'}),
    headCount('professional_provider_connections',{connection_status:'eq.requested'})
  ]);
  return{pending_realtor_count:realtor,connection_request_count:connections,pending_count:realtor+connections};
}
function profileMap(rows){const m=new Map();rows.forEach(r=>m.set(r.id,r));return m}
function licenseMap(rows){const m=new Map();rows.forEach(r=>m.set(r.user_id,r));return m}
function outboxMap(rows){const m=new Map();rows.forEach(r=>{if(!m.has(r.user_id))m.set(r.user_id,r)});return m}
function safeVerification(r,p,l,o){
  const pro=p&&p.pro_agent&&typeof p.pro_agent==='object'?p.pro_agent:{};
  return{
    user_id:r.user_id,nar_member_id:r.nar_member_id,local_association:r.local_association||'',proof_url:r.proof_url||'',user_note:r.user_note||'',
    verification_status:r.verification_status,verified_realtor:r.verified_realtor===true,member_name:r.member_name||'',verified_at:r.verified_at||null,verification_due_at:r.verification_due_at||null,
    submitted_at:r.submitted_at,reviewed_at:r.reviewed_at||null,review_note:r.review_note||'',
    name:String(p&&p.display_name||p&&p.full_name||'').trim(),email:String(p&&p.email||'').trim(),
    brokerage_name:String(pro.brokerage_name||'').trim(),brokerage_logo_url:String(pro.brokerage_logo_url||'').trim(),
    nj_license_number:String(l&&l.license_number||pro.license_number||'').trim(),nj_license_verified:Boolean(l&&l.verified_professional),nj_license_name:String(l&&l.licensee_name||'').trim(),
    notification:o?{status:o.delivery_status,attempts:Number(o.attempts||0),last_error:o.last_error||'',sent_at:o.sent_at||null}:null
  };
}
function safeConnection(r,p,l){
  const pro=p&&p.pro_agent&&typeof p.pro_agent==='object'?p.pro_agent:{};
  return{
    id:r.id,user_id:r.user_id,provider_key:r.provider_key,provider_label:r.provider_label,connection_status:r.connection_status,
    external_profile_url:r.external_profile_url||'',external_member_id:r.external_member_id||'',auth_method:r.auth_method||'',
    requested_at:r.requested_at,connected_at:r.connected_at||null,last_synced_at:r.last_synced_at||null,last_error:r.last_error||'',
    name:String(p&&p.display_name||p&&p.full_name||'').trim(),email:String(p&&p.email||'').trim(),
    brokerage_name:String(pro.brokerage_name||'').trim(),nj_license_number:String(l&&l.license_number||pro.license_number||'').trim(),nj_license_verified:Boolean(l&&l.verified_professional)
  };
}
async function listAll(){
  const [verifications,connections,outbox]=await Promise.all([
    rows('professional_realtor_verifications',{select:'user_id,nar_member_id,local_association,proof_url,user_note,verification_status,verified_realtor,member_name,verified_at,verification_due_at,submitted_at,reviewed_at,review_note',order:'submitted_at.desc',limit:'200'}),
    rows('professional_provider_connections',{select:'id,user_id,provider_key,provider_label,connection_status,external_profile_url,external_member_id,auth_method,requested_at,connected_at,last_synced_at,last_error',order:'requested_at.desc',limit:'200'}),
    rows('professional_notification_outbox',{select:'user_id,delivery_status,attempts,last_error,sent_at,created_at',event_type:'eq.realtor_verification.submitted',order:'created_at.desc',limit:'300'})
  ]);
  const ids=[...new Set([...verifications.map(x=>x.user_id),...connections.map(x=>x.user_id)].filter(isUuid))];
  let profiles=[],licenses=[];
  if(ids.length){
    [profiles,licenses]=await Promise.all([
      rows('profiles',{select:'id,email,display_name,full_name,pro_agent',id:'in.('+ids.join(',')+')'}),
      rows('professional_license_verifications',{select:'user_id,license_number,verified_professional,licensee_name,verification_status,verified_at',user_id:'in.('+ids.join(',')+')'})
    ]);
  }
  const pm=profileMap(profiles),lm=licenseMap(licenses),om=outboxMap(outbox);
  return{
    verifications:verifications.map(r=>safeVerification(r,pm.get(r.user_id)||{},lm.get(r.user_id)||{},om.get(r.user_id)||null)),
    connections:connections.map(r=>safeConnection(r,pm.get(r.user_id)||{},lm.get(r.user_id)||{}))
  };
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
  if(!allowedHost(requestHost(req)))return res.status(403).json({error:'Backoffice is available only on Watchdog.'});
  if(!SERVICE_KEY)return res.status(503).json({error:'Professional review service is unavailable.'});

  const access=await requireDeveloper(bearer(req)).catch(()=>({ok:false,status:503,error:'Developer verification is unavailable.'}));
  if(!access.ok)return res.status(access.status).json({error:access.error});

  let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}if(!body||typeof body!=='object'||Array.isArray(body))body={};
  const action=String(body.action||'list').trim().toLowerCase();

  try{
    if(action==='count')return res.status(200).json({ok:true,...await counts()});
    if(action==='list'){
      const data=await listAll(),c=await counts(),now=Date.now(),recentVerified=data.verifications.filter(v=>v.verified_realtor&&v.verified_at&&now-new Date(v.verified_at).getTime()<=30*86400000).length;
      return res.status(200).json({ok:true,...c,...data,recent_verified_count:recentVerified});
    }
    if(action==='review'){
      const userId=String(body.user_id||''),status=String(body.status||'').toLowerCase();
      if(!isUuid(userId))return res.status(422).json({error:'A valid user_id is required.'});
      if(!['verified','needs_info','rejected','expired'].includes(status))return res.status(422).json({error:'Invalid review action.'});
      const result=await rpc('review_realtor_verification_v1',{
        p_user_id:userId,p_status:status,p_member_name:text(body.member_name,160)||null,p_local_association:text(body.local_association,160)||null,
        p_review_note:text(body.review_note,1000)||null,p_verification_due_at:body.verification_due_at||null
      });
      await insert('professional_review_events',{user_id:userId,entity_type:'realtor_verification',entity_key:userId,event_type:'realtor_verification.'+status,actor_user_id:access.user.id||null,actor_label:access.user.email||'developer',details:{review_note:text(body.review_note,1000)||null}});
      return res.status(200).json({ok:true,result,pending:await counts()});
    }
    if(action==='connection_review'){
      const userId=String(body.user_id||''),provider=String(body.provider_key||'').toLowerCase(),status=String(body.status||'').toLowerCase();
      if(!isUuid(userId))return res.status(422).json({error:'A valid user_id is required.'});
      if(!['bright_mls','reso_mls','realtor_com'].includes(provider))return res.status(422).json({error:'Invalid provider.'});
      if(!['needs_action','disconnected'].includes(status))return res.status(422).json({error:'Backoffice may only mark a request ready for setup or closed until provider authorization is actually completed.'});
      const result=await rpc('review_professional_connection_v1',{
        p_user_id:userId,p_provider_key:provider,p_status:status,p_external_member_id:null,p_auth_method:null,p_sync_capabilities:null,p_profile_data:null,p_last_error:text(body.note,1000)||null
      });
      await insert('professional_review_events',{user_id:userId,entity_type:'professional_connection',entity_key:provider,event_type:'professional_connection.'+status,actor_user_id:access.user.id||null,actor_label:access.user.email||'developer',details:{note:text(body.note,1000)||null}});
      return res.status(200).json({ok:true,result,pending:await counts()});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(error){
    console.error('watchdog-backoffice-professional',error);
    return res.status(500).json({error:error&&error.message||'Professional review request failed.'});
  }
}

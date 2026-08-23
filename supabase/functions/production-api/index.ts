import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const canonicalSite = 'https://www.watchdogindex.com';
const origins = new Set([
  'https://www.watchdogindex.com',
  'https://watchdogindex.com',
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com'
]);
const sourceUrl = 'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml';
function cors(req: Request) { const o=req.headers.get('origin')||''; return {'Access-Control-Allow-Origin':origins.has(o)?o:canonicalSite,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}; }
function reply(req: Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});}
function clean(v:unknown,max=180){return String(v||'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max);}
async function sha256(value:string){const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST') return reply(req,405,{error:'Method not allowed'});
  const origin=req.headers.get('origin')||''; if(origin&&!origins.has(origin)) return reply(req,403,{error:'Origin not allowed'});
  const authorization=req.headers.get('authorization')||''; if(!authorization.startsWith('Bearer ')) return reply(req,401,{error:'Sign in required'});
  const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser(); if(authError||!authData.user) return reply(req,401,{error:'Session could not be verified'});
  let body:Record<string,unknown>; try{body=await req.json();}catch(_){return reply(req,400,{error:'Invalid JSON'});}
  const action=clean(body.action,48);
  const [{data:profile},{data:entitlement}]=await Promise.all([
    admin.from('profiles').select('account_role,plan_tier').eq('id',authData.user.id).maybeSingle(),
    admin.from('account_entitlements').select('plan_tier,subscription_status').eq('user_id',authData.user.id).maybeSingle()
  ]);
  const developer=profile?.account_role==='developer';
  const paid=['active','trialing','past_due','cancel_scheduled'].includes(String(entitlement?.subscription_status||''));
  const plan=developer?'developer':paid?String(entitlement?.plan_tier||'standard'):'standard';
  const pro=developer||plan==='pro'||plan==='pro_plus',proPlus=developer||plan==='pro_plus';

  async function usage(metric:string){
    const since=new Date();since.setUTCDate(1);since.setUTCHours(0,0,0,0);
    const [{data:limitRow},{data:events}]=await Promise.all([
      admin.from('plan_usage_limits').select('monthly_limit,label').eq('plan_tier',plan).eq('metric_key',metric).maybeSingle(),
      admin.from('usage_events').select('quantity').eq('user_id',authData.user.id).eq('metric_key',metric).gte('occurred_at',since.toISOString())
    ]);
    return {used:(events||[]).reduce((sum,row)=>sum+Number(row.quantity||0),0),limit:Number(limitRow?.monthly_limit??0),label:String(limitRow?.label||metric)};
  }
  async function reserve(metric:string,quantity=1,requestKey=''){
    const state=await usage(metric);
    if(!developer&&state.limit>=0&&state.used+quantity>state.limit)return {ok:false,state};
    const key=requestKey||crypto.randomUUID();
    const saved=await admin.from('usage_events').insert({user_id:authData.user.id,metric_key:metric,quantity,request_key:key,metadata:{plan}});
    return {ok:!saved.error,state:{...state,used:state.used+(saved.error?0:quantity)}};
  }

  if(action==='report.version'){
    if(!pro) return reply(req,403,{error:'A Pro plan is required'});
    const quota=await reserve('report_versions',1,clean(body.request_key,120));if(!quota.ok)return reply(req,429,{error:'Monthly report-version limit reached',usage:quota.state});
    const caseId=clean(body.case_id,40),preset=clean(body.preset,32)||'due_diligence';
    const {data:caseRow,error:caseError}=await admin.from('professional_cases').select('*').eq('id',caseId).eq('user_id',authData.user.id).maybeSingle();
    if(caseError||!caseRow) return reply(req,404,{error:'Case not found'});
    let {data:report}=await admin.from('professional_reports').select('*').eq('case_id',caseId).eq('user_id',authData.user.id).maybeSingle();
    if(!report){const created=await admin.from('professional_reports').insert({user_id:authData.user.id,case_id:caseId,pams_pin:caseRow.pams_pin,title:caseRow.title,profession:caseRow.profession||'general',preset}).select().single();if(created.error)return reply(req,503,{error:'Report could not be created'});report=created.data;}
    const version=Number(report.current_version||0)+1;
    const payload={title:caseRow.title,address:caseRow.property_address,municipality:caseRow.municipality,profession:caseRow.profession,preset,status:caseRow.status,notes:caseRow.notes||'',markers:caseRow.pinned_marker_ids||[],evidence:caseRow.evidence_snapshot||{},generated_at:new Date().toISOString(),limitation:'Research support only; verify authoritative records before professional reliance.'};
    const manifest=[{label:'NJ Division of Taxation · Local Property Tax Statistical Data',url:sourceUrl,accessed_at:new Date().toISOString()},{label:'Watchdog saved property evidence snapshot',url:canonicalSite+'/workbench?case='+encodeURIComponent(caseId),accessed_at:new Date().toISOString()}];
    const inserted=await admin.from('professional_report_versions').insert({report_id:report.id,user_id:authData.user.id,version_number:version,report_payload:payload,source_manifest:manifest}).select('id,version_number,created_at').single();
    if(inserted.error) return reply(req,503,{error:'Report version could not be saved'});
    await admin.from('professional_reports').update({current_version:version,preset,updated_at:new Date().toISOString()}).eq('id',report.id).eq('user_id',authData.user.id);
    return reply(req,200,{report_id:report.id,version:inserted.data,payload,source_manifest:manifest});
  }
  if(action==='report.share'){
    if(!pro) return reply(req,403,{error:'A Pro plan is required'});
    const quota=await reserve('report_shares',1,clean(body.request_key,120));if(!quota.ok)return reply(req,429,{error:'Monthly report-share limit reached',usage:quota.state});
    const reportId=clean(body.report_id,40);
    const {data:report}=await admin.from('professional_reports').select('id,current_version').eq('id',reportId).eq('user_id',authData.user.id).maybeSingle();
    if(!report||!report.current_version) return reply(req,404,{error:'Create a report version first'});
    const {data:version}=await admin.from('professional_report_versions').select('id').eq('report_id',report.id).eq('version_number',report.current_version).maybeSingle();
    if(!version) return reply(req,404,{error:'Report version not found'});
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const expires=new Date(Date.now()+30*86400000).toISOString();
    const saved=await admin.from('professional_report_shares').insert({report_id:report.id,version_id:version.id,user_id:authData.user.id,token_hash:await sha256(token),expires_at:expires}).select('id,expires_at').single();
    if(saved.error) return reply(req,503,{error:'Share link could not be created'});
    return reply(req,200,{url:canonicalSite+'/report?token='+token,expires_at:expires});
  }
  if(action==='data.resolve'){
    if(!proPlus) return reply(req,403,{error:'A Pro+ plan is required'});
    const pin=clean(body.pams_pin,80);const ids=Array.isArray(body.marker_ids)?body.marker_ids.map((x)=>clean(x,100)).filter(Boolean).slice(0,250):[];
    if(!pin||!ids.length) return reply(req,400,{error:'Choose a property and at least one marker'});
    const quota=await reserve('marker_cells',ids.length,clean(body.request_key,120));if(!quota.ok)return reply(req,429,{error:'Monthly data-cell limit reached',usage:quota.state});
    const {data:record,error}=await admin.from('property_lookups').select('*').eq('pams_pin',pin).maybeSingle();
    if(error||!record) return reply(req,404,{error:'Property record not found'});
    const map:Record<string,string>={'property.address':'address','property.municipality':'town','property.county':'county','property.block':'block','property.lot':'lot','property.qualifier':'qualifier','property.pams_pin':'pams_pin','property.property_class':'prop_class','property.land_assessment':'land_value','property.improvement_assessment':'improvement_value','property.assessed_value':'assessed_value','property.annual_tax':'last_year_tax','property.effective_tax_rate':'effective_rate','property.year_built':'year_built','property.acres':'acres','property.dwelling_units':'dwelling_units','property.building_description':'building_desc','sales.last_price':'last_sale_price','sales.last_year':'last_sale_year','property.latitude':'lat','property.longitude':'lon'};
    const rows=ids.map((id)=>{const field=map[id];return {marker_id:id,value:field?record[field]??null:null,status:field?(record[field]==null?'not_on_file':'resolved'):'provider_pending',source:field?sourceUrl:null,as_of:record.last_seen||null};});
    return reply(req,200,{pams_pin:pin,address:record.address,plan,coverage:{selected:ids.length,resolved:rows.filter((x)=>x.status==='resolved').length,pending:rows.filter((x)=>x.status==='provider_pending').length},rows,limitation:'A pending provider is not zero and is never represented as a verified fact.'});
  }
  if(action==='platform.summary'){
    const metrics=['lookups','marker_cells','exports','jobs','report_versions','report_shares','seats'];
    const [usageRows,organizations,jobs,providers,support]=await Promise.all([
      Promise.all(metrics.map(async(metric)=>({metric,...await usage(metric)}))),
      admin.from('organization_members').select('organization_id,role,status,organizations(id,name,slug)').eq('user_id',authData.user.id).eq('status','active'),
      admin.from('platform_jobs').select('id,job_type,scope_type,scope_key,status,attempts,result_payload,last_error,created_at,completed_at').eq('user_id',authData.user.id).order('created_at',{ascending:false}).limit(12),
      admin.from('data_provider_coverage').select('*').order('provider_key'),
      admin.from('support_requests').select('id,category,priority,subject,status,created_at,updated_at').eq('user_id',authData.user.id).order('created_at',{ascending:false}).limit(8)
    ]);
    return reply(req,200,{plan,developer,usage:usageRows,organizations:organizations.data||[],jobs:jobs.data||[],providers:providers.data||[],support:support.data||[]});
  }
  if(action==='job.submit'){
    if(!proPlus)return reply(req,403,{error:'A Pro+ plan is required'});
    const scopeType=clean(body.scope_type,20),scopeKey=clean(body.scope_key,120);
    if(!['town','county'].includes(scopeType)||scopeKey.length<2)return reply(req,400,{error:'Choose a New Jersey town or county'});
    const quota=await reserve('jobs',1,clean(body.request_key,120));if(!quota.ok)return reply(req,429,{error:'Monthly background-job limit reached',usage:quota.state});
    const saved=await admin.from('platform_jobs').insert({user_id:authData.user.id,job_type:'scope_summary',scope_type:scopeType,scope_key:scopeKey,input_payload:{requested_plan:plan}}).select('id,status,created_at').single();
    if(saved.error)return reply(req,503,{error:'Background job could not be queued'});
    return reply(req,202,{job:saved.data});
  }
  if(action==='organization.create'){
    if(!proPlus)return reply(req,403,{error:'A Pro+ plan is required'});
    const name=clean(body.name,120);if(name.length<2)return reply(req,400,{error:'Enter an organization name'});
    const slug=(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'workspace')+'-'+crypto.randomUUID().slice(0,8);
    const created=await admin.from('organizations').insert({owner_user_id:authData.user.id,name,slug}).select('id,name,slug').single();
    if(created.error)return reply(req,503,{error:'Organization could not be created'});
    const member=await admin.from('organization_members').insert({organization_id:created.data.id,user_id:authData.user.id,role:'owner'});
    if(member.error){await admin.from('organizations').delete().eq('id',created.data.id);return reply(req,503,{error:'Organization owner could not be assigned'});}
    return reply(req,201,{organization:created.data});
  }
  if(action==='organization.invite'){
    if(!proPlus)return reply(req,403,{error:'A Pro+ plan is required'});
    const organizationId=clean(body.organization_id,40),email=clean(body.email,254).toLowerCase(),role=clean(body.role,16)||'member';
    if(!organizationId||!email.includes('@')||!['admin','member','viewer'].includes(role))return reply(req,400,{error:'Enter a valid invitation'});
    const {data:membership}=await admin.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',authData.user.id).eq('status','active').maybeSingle();
    if(!membership||!['owner','admin'].includes(membership.role))return reply(req,403,{error:'Organization admin access required'});
    const [{count:active},{count:pending},seatUsage]=await Promise.all([
      admin.from('organization_members').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('status','active'),
      admin.from('organization_invitations').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('status','pending').gt('expires_at',new Date().toISOString()),
      usage('seats')
    ]);
    if(!developer&&seatUsage.limit>=0&&Number(active||0)+Number(pending||0)>=seatUsage.limit)return reply(req,429,{error:'Workspace seat limit reached'});
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const saved=await admin.from('organization_invitations').insert({organization_id:organizationId,invited_by:authData.user.id,email_hash:await sha256(email),role,token_hash:await sha256(token)}).select('id,role,expires_at').single();
    if(saved.error)return reply(req,503,{error:'Invitation could not be created'});
    return reply(req,201,{invitation:saved.data,accept_url:canonicalSite+'/account?invite='+token});
  }
  if(action==='support.create'){
    const category=clean(body.category,20),priority=clean(body.priority,12)||'normal',subject=clean(body.subject,180),message=clean(body.message,5000);
    if(!['account','billing','data','technical','privacy','feature'].includes(category)||!['low','normal','high','urgent'].includes(priority)||subject.length<4||message.length<10)return reply(req,400,{error:'Complete the support request'});
    const saved=await admin.from('support_requests').insert({user_id:authData.user.id,category,priority,subject,message}).select('id,status,created_at').single();
    if(saved.error)return reply(req,503,{error:'Support request could not be created'});
    return reply(req,201,{request:saved.data});
  }
  if(action==='ops.status'){
    if(!developer) return reply(req,403,{error:'Developer access required'});
    const [gates,runs,drills]=await Promise.all([
      admin.from('platform_release_gates').select('*').order('gate_key'),
      admin.from('production_acceptance_runs').select('*').order('run_at',{ascending:false}).limit(8),
      admin.from('continuity_drills').select('*').order('run_at',{ascending:false}).limit(8)
    ]);
    return reply(req,200,{gates:gates.data||[],acceptance_runs:runs.data||[],continuity_drills:drills.data||[]});
  }
  return reply(req,400,{error:'Unknown action'});
});

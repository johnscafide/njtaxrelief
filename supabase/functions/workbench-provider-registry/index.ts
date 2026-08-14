import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REG='https://njpropertytaxrelief.com/property/data/marker-registry.json';
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
const FAMILY:any={
  'nj-parcels-modiv':{key:'nj_parcels_modiv_family',kind:'authoritative_source',status:'live',source:'NJOGIS Parcels / MOD-IV Composite'},
  'nj-sr1a':{key:'nj_sr1a_family',kind:'authoritative_reference',status:'live',source:'NJ Division of Taxation SR-1A verified sales'},
  'nj-cod':{key:'nj_cod_family',kind:'authoritative_reference',status:'live',source:'NJ Division of Taxation assessment uniformity'},
  'nj-tax-court-appeals':{key:'nj_appeals_family',kind:'authoritative_reference',status:'live',source:'NJ Division of Taxation property-tax appeals'},
  'nj-dca-budget':{key:'nj_dca_budget_family',kind:'authoritative_reference',status:'live',source:'NJ DCA municipal budget and tax levy filings'},
  'nj-dca-permits-raw':{key:'dca_permits_v2',kind:'authoritative_source',status:'live',source:'NJ DCA construction permits'},
  'nj-dca-development-trends':{key:'dca_development_trends_v2',kind:'authoritative_reference',status:'live',source:'NJ DCA construction permits municipal rollup'},
  'njdep-geology-live':{key:'njdep_spatial_family',kind:'authoritative_spatial_reference',status:'live',source:'NJDEP public GIS'},
  'njdep-hydro-live':{key:'njdep_spatial_family',kind:'authoritative_spatial_reference',status:'live',source:'NJDEP public GIS'},
  'njdep-land-live':{key:'njdep_spatial_family',kind:'authoritative_spatial_reference',status:'live',source:'NJDEP public GIS'},
  'njdep-csrr-gis':{key:'njdep_csrr_family',kind:'authoritative_spatial_reference',status:'live',source:'NJDEP Environmental NJEMS public GIS'},
  'fema-nfhl':{key:'fema_nfhl_family',kind:'authoritative_spatial_reference',status:'live',source:'FEMA National Flood Hazard Layer'}
};
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'}}
function out(req:Request,s:number,p:any){return new Response(JSON.stringify(p),{status:s,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'private, max-age=300'}})}
function rank(p:string){return({standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5} as Record<string,number>)[p]??0}
function reqRank(t:any){return({standard:0,agent:1,pro:2,pro_plus:3} as Record<string,number>)[String(t||'standard')]??3}
function governedStatus(db:any,fam:any,catalog:any){if(db?.value_status)return String(db.value_status);if(fam?.status)return String(fam.status);return catalog?String(catalog):null}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  const auth=req.headers.get('authorization')||'',url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!auth.startsWith('Bearer '))return out(req,401,{error:'Sign in required'});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u}=await uc.auth.getUser();if(!u.user)return out(req,401,{error:'Session invalid'});
  const {data:pd}=await admin.rpc('watchdog_effective_plan',{p_user_id:u.user.id}),plan=String(pd||'standard');if(rank(plan)<1)return out(req,403,{error:'Paid plan required'});
  const [regRes,covRes,aliasRes,dcaRes]=await Promise.all([
    fetch(REG,{headers:{accept:'application/json'}}),
    admin.from('data_center_provider_coverage').select('*'),
    admin.from('workbench_marker_aliases').select('alias_id,canonical_id,notes'),
    admin.from('dca_source_registry').select('source_id,source_status,source_vintage,last_checked_at,notes')
  ]);
  if(!regRes.ok)return out(req,503,{error:'Marker registry unavailable'});
  const catalog=await regRes.json(),coverage=new Map((covRes.data||[]).map((x:any)=>[x.marker_id,x])),aliases=new Map((aliasRes.data||[]).map((x:any)=>[x.alias_id,x])),dcaSources=new Map((dcaRes.data||[]).map((x:any)=>[x.source_id,x]));
  const markers=(catalog.markers||[]).map((m:any)=>{
    const db:any=coverage.get(m.id)||null,fam=FAMILY[String(m.source_id||'')]||null,dca:any=dcaSources.get(String(m.source_id||''))||null,c=db||fam;
    const effective=governedStatus(db,fam,dca?.source_status||m.provider_status||null);
    return{id:m.id,label:m.label||m.id,description:m.description||'',category:m.category||'uncategorized',scope:m.scope||m.scopes||'property',tier:m.tier||'standard',origin:m.origin||'',professions:m.professions||[],source_id:m.source_id||null,field:m.field||null,catalog_provider_status:m.provider_status||null,provider_status:effective,allowed:rank(plan)>=reqRank(m.tier),provider:{registered:!!c,key:c?.provider_key||c?.key||null,kind:c?.provider_kind||c?.kind||null,value_status:effective||'catalog_only',scopes:c?.scopes||[m.scope||'property'],source_keys:c?.source_keys||[m.source_id].filter(Boolean),source_fields:c?.source_fields||[m.field].filter(Boolean),calculation_key:c?.calculation_key||null,freshness_seconds:c?.freshness_seconds||3600,cache_policy:c?.cache_policy||'on_demand',bulk_capable:c?.bulk_capable===true||!!fam,last_verified_at:c?.last_verified_at||dca?.last_checked_at||null,source_vintage:dca?.source_vintage||null,notes:c?.notes||(fam?'Connected by source-family resolver':dca?.notes||null)}};
  });
  const aliasList=[...aliases.values()].map((a:any)=>({alias_id:a.alias_id,canonical_id:a.canonical_id,notes:a.notes||''}));
  const byStatus=(s:string)=>markers.filter((x:any)=>x.provider_status===s).length;
  const summary={catalog:markers.length,registered:markers.filter((x:any)=>x.provider.registered).length,bulk_capable:markers.filter((x:any)=>x.provider.bulk_capable).length,live:byStatus('live'),partial:byStatus('partial'),planned:byStatus('planned'),unavailable:byStatus('unavailable'),catalog_only:markers.filter((x:any)=>!x.provider.registered&&!x.provider_status).length,aliases:aliasList.length,family_connected:markers.filter((x:any)=>FAMILY[String(x.source_id||'')]).length,governance:'database_first'};
  return out(req,200,{plan,summary,aliases:aliasList,markers,generated_at:new Date().toISOString(),resolver_version:'provider-registry-v5-governed-status'});
});

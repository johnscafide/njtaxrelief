import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,content){fs.mkdirSync(path.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(path,content)}
function replaceOnce(path,before,after,label){
  let s=read(path);const count=s.split(before).length-1;
  if(count===0&&s.includes(after))return;
  if(count!==1)throw new Error(`${label}: expected one target, got ${count}`);
  write(path,s.replace(before,after));
}

replaceOnce(
  'supabase/functions/workbench-hydrate/index.ts',
  "derived=field==='volatility';return{v:uniformityValue(row,field,historical,legacy),kind:derived?'derived_governed':'authoritative_reference',source:derived?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'NJ Division of Taxation assessment uniformity'",
  "derived=field==='volatility'||field==='percentile';const derivedSource=field==='volatility'?'Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series':'Watchdog statewide percentile of governed Assessment Uniformity Score over NJ Division of Taxation COD artifact';return{v:uniformityValue(row,field,historical,legacy),kind:derived?'derived_governed':'authoritative_reference',source:derived?derivedSource:'NJ Division of Taxation assessment uniformity'",
  'uniformity percentile provenance'
);

const derivedPath='supabase/functions/workbench-derived/index.ts';
let d=read(derivedPath);
const substitutions=[
  ["const ENGINE_VERSION = 'watchdog-derived-v16-chapter123-fields';","const ENGINE_VERSION = 'watchdog-derived-v22-njw291';",'engine version'],
  ["const needsChapter123 = operations.some((op) => ['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field'].includes(op));","const needsChapter123 = operations.some((op) => ['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field','chapter123_position'].includes(op));",'chapter dependency trigger'],
  ["const needsEvidenceReferences = operations.some((op) => ['sr1a_subject_square_feet','comparable_evidence_reliability','assessment_defensibility','appeal_evidence_strength','appeal_opportunity'].includes(op));","const needsEvidenceReferences = operations.some((op) => ['sr1a_subject_square_feet','comparable_evidence_reliability','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_position'].includes(op));",'subject evidence trigger'],
  ["['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field'].includes(operation)","['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field','chapter123_position'].includes(operation)",'chapter metadata trigger'],
];
for(const [before,after,label] of substitutions){const count=d.split(before).length-1;if(count===0&&d.includes(after))continue;if(count!==1)throw new Error(`${label}: expected one target, got ${count}`);d=d.replace(before,after)}

const ordered="else if (def.operation === 'ordered_history') { const landDep = String(cfg.land_dep || ''), improvementDep = String(cfg.improvement_dep || ''), totalDep = String(cfg.total_dep || ''); const trace = orderedAssessmentHistory(landDep ? value(landDep) : null, improvementDep ? value(improvementDep) : null, totalDep ? value(totalDep) : null); if (trace) { v = trace; auxMeta.set(id, { history_years: trace.map((row: any) => row.year), missing_years_synthesized: false, trace_contract: 'actual_source_years_only' }); } }";
const shift="else if (def.operation === 'assessment_component_shift') { const trace = orderedAssessmentHistory(value(cfg.land_dep), value(cfg.improvement_dep), null); if (trace) { let pair:any=null; for (let i=trace.length-1;i>0;i--) { const prev=trace[i-1],cur=trace[i],pl=num(prev.land),pi=num(prev.improvement),cl=num(cur.land),ci=num(cur.improvement); if (cur.year===prev.year+1&&pl!=null&&pi!=null&&cl!=null&&ci!=null&&pl>=0&&pi>=0&&cl>=0&&ci>=0&&(pl+pi)>0&&(cl+ci)>0) { pair={prev,cur,pl,pi,cl,ci}; break; } } if (pair) { const prevLand=pair.pl/(pair.pl+pair.pi)*100,prevImprovement=pair.pi/(pair.pl+pair.pi)*100,curLand=pair.cl/(pair.cl+pair.ci)*100,curImprovement=pair.ci/(pair.cl+pair.ci)*100,landDelta=curLand-prevLand,improvementDelta=curImprovement-prevImprovement,differential=landDelta-improvementDelta; v=round(clamp(50+differential/4),1); auxMeta.set(id,{from_year:pair.prev.year,to_year:pair.cur.year,previous_land_share_pct:round(prevLand,3),current_land_share_pct:round(curLand,3),previous_improvement_share_pct:round(prevImprovement,3),current_improvement_share_pct:round(curImprovement,3),land_share_delta_pp:round(landDelta,3),improvement_share_delta_pp:round(improvementDelta,3),component_share_differential_pp:round(differential,3),neutral_score:50,shift_direction:v>50?'toward_land':v<50?'toward_improvements':'unchanged',missing_years_synthesized:false,transition_contract:'latest consecutive published MOD-IV years with both components present'}); } } }";
if(!d.includes("def.operation === 'assessment_component_shift'")){const count=d.split(ordered).length-1;if(count!==1)throw new Error(`assessment shift insertion target: ${count}`);d=d.replace(ordered,ordered+'\n      '+shift)}

const chapterField="else if (def.operation === 'chapter123_field') { const official = chapterDistricts[districtCode(pin)] || null, field = String(cfg.field || ''); if (official && ['ratio','lower','upper'].includes(field)) { const x = num(official[field]); if (x != null) { v = x; auxMeta.set(id, { chapter123_field: field, reference_source: 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER }); } } }";
const chapterPosition="else if (def.operation === 'chapter123_position') { const assessed=num(value(cfg.assessed_dep)),ppsf=num(value(cfg.ppsf_dep)),sqft=num(subjectSale?.sf),official=chapterDistricts[districtCode(pin)]||null,lower=num(official?.lower),common=num(official?.ratio),upper=num(official?.upper); if(assessed!=null&&assessed>0&&ppsf!=null&&ppsf>0&&sqft!=null&&sqft>0&&lower!=null&&common!=null&&upper!=null&&lower>0&&upper>0){ const anchor=ppsf*sqft,subjectRatio=assessed/anchor*100; v=subjectRatio<lower?'below_lower_bound':subjectRatio>upper?'above_upper_bound':'within_common_level_range'; auxMeta.set(id,{independent_value_anchor:Math.round(anchor),subject_ratio_pct:round(subjectRatio,2),chapter123_lower_pct:lower,chapter123_common_ratio_pct:common,chapter123_upper_pct:upper,position_contract:'screening position only; not appeal eligibility, legal advice, an appraisal, or a value conclusion',subject_provider:SR1A_SUBJECT_PROVIDER,reference_source:'NJ Division of Taxation 2026 Chapter 123 · '+CHAPTER123_PROVIDER}); } }";
if(!d.includes("def.operation === 'chapter123_position'")){const count=d.split(chapterField).length-1;if(count!==1)throw new Error(`chapter position insertion target: ${count}`);d=d.replace(chapterField,chapterField+'\n      '+chapterPosition)}
write(derivedPath,d);

replaceOnce(
  'property/scripts/build_nj_proplus_source_pack_v031.py',
  "('assessment_component_shift','Assessment Component Shift','normalized(change(land_assessment) - change(improvement_assessment))','Flags changes in published assessment composition for review.'),",
  "('assessment_component_shift','Assessment Component Shift','Latest consecutive published MOD-IV transition: normalize the land-share change minus improvement-share change across the full possible -200 to +200 percentage-point differential into 0-100; 50 is unchanged composition; no synthetic years.','Flags changes in published assessment composition for review.'),",
  'assessment component shift source contract'
);

write('supabase/functions/workbench-hydrate/uniformity-percentile-provider.ts',`export const UNIFORMITY_PERCENTILE_PROVIDER_VERSION='watchdog-uniformity-percentile-v1';
const ID='uniformity.percentile';
const SOURCE='Watchdog statewide percentile of governed Assessment Uniformity Score over NJ Division of Taxation COD artifact';
export async function runWithUniformityPercentile(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
 let body:any=null;try{body=await request.clone().json()}catch{return handler(request,info)}
 const ids=(Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||''));if(!ids.includes(ID))return handler(request,info);
 const response=await handler(request,info);if(!response.ok)return response;let payload:any;try{payload=await response.clone().json()}catch{return response}
 for(const [pin,values] of Object.entries(payload?.markers||{})){const v=(values as any)?.[ID],m=payload?.meta?.[pin]?.[ID];if(v!==null&&v!==undefined&&m?.status==='available'){payload.meta[pin][ID]={...m,provider_kind:'derived_governed',source:SOURCE,provider_version:UNIFORMITY_PERCENTILE_PROVIDER_VERSION,formula:'Statewide percentile rank of the governed Assessment Uniformity Score as published in the canonical Watchdog uniformity artifact',percentile_scope:'New Jersey districts with a governed uniformity score'};}}
 payload.provider_versions||={};payload.provider_versions.uniformity_percentile=UNIFORMITY_PERCENTILE_PROVIDER_VERSION;const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
`);

write('supabase/functions/workbench-hydrate/production-njw291-uniformity-bootstrap.ts',`import { runWithUniformityPercentile } from './uniformity-percentile-provider.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{if(typeof first==='function'){const handler=first as Deno.ServeHandler;return nativeServe((request,info)=>runWithUniformityPercentile(handler,request,info));}if(typeof second==='function'){const handler=second as Deno.ServeHandler;return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithUniformityPercentile(handler,request,info));}return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/30c8cb8d1d029c4534adbc734ec787eb39e447a0/supabase/functions/workbench-hydrate/production-ufb-v040-longitudinal-bootstrap.ts');
`);

write('supabase/functions/provider-release-canary/planned-marker-batch-canary.ts',`import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const SCENARIO='planned_marker_batch_v1',UNI='uniformity.percentile',CHAPTER='watchdog.chapter123_position',SHIFT='watchdog.njplus.assessment_component_shift',LAND='njplus.nj-dca-modiv-longitudinal.assessment_land_history',IMPROVEMENT='njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',PPSF='sales.ppsf';
const UNI_PIN='0101_25.01_10',CHAPTER_PIN='0818_242_22',SHIFT_PINS=['0101_25.01_10','0818_242_22','0802_525_1','0802_528_27','0802_528_5'];
function json(status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function hash(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(id:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',id);await admin.from('account_entitlements').delete().eq('user_id',id);await admin.from('profiles').delete().eq('id',id);await admin.auth.admin.deleteUser(id)}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
function expectedShift(land:any,improvement:any){if(!land||!improvement||typeof land!=='object'||typeof improvement!=='object')return null;const years=[...new Set([...Object.keys(land),...Object.keys(improvement)].filter(y=>/^(19|20)\\d{2}$/.test(y)).map(Number))].sort((a,b)=>a-b);for(let i=years.length-1;i>0;i--){const py=years[i-1],cy=years[i];if(cy!==py+1)continue;const pl=n(land[String(py)]),pi=n(improvement[String(py)]),cl=n(land[String(cy)]),ci=n(improvement[String(cy)]);if(pl==null||pi==null||cl==null||ci==null||pl<0||pi<0||cl<0||ci<0||pl+pi<=0||cl+ci<=0)continue;const prevLand=pl/(pl+pi)*100,prevImp=pi/(pl+pi)*100,curLand=cl/(cl+ci)*100,curImp=ci/(cl+ci)*100,diff=(curLand-prevLand)-(curImp-prevImp);return{value:Math.round(Math.max(0,Math.min(100,50+diff/4))*10)/10,from_year:py,to_year:cy};}return null}
async function post(path:string,body:any,access?:string){const headers:any={'Content-Type':'application/json'};if(access){headers.Authorization='Bearer '+access;headers.apikey=ANON;}const r=await fetch(URL+'/functions/v1/'+path,{method:'POST',headers,body:JSON.stringify(body)});let p:any={};try{p=await r.json()}catch{}return{ok:r.ok,status:r.status,p}}
export async function handlePlannedMarkerBatchCanary(req:Request){
 let body:any={};try{body=await req.json()}catch{return json(400,{error:'Invalid JSON'})}
 const token=String(body?.token||'').trim();if(String(body?.scenario||'')!==SCENARIO||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(401,{error:'Invalid release canary request'});
 const now=new Date().toISOString();const {data:gate}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',await hash(token)).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'provider_release_canary',scenario:SCENARIO}).select('id,desired_email').maybeSingle();if(!gate)return json(401,{error:'Invalid or expired release canary token'});
 let userId='';
 try{
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:String(gate.desired_email||'')});userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
  const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data:v,error:ve}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const access=v?.session?.access_token||'';if(ve||!access)throw new Error('sandbox_session_verification_failed');
  const pr=await admin.from('profiles').upsert({id:userId,email:String(gate.desired_email||''),full_name:'Watchdog NJW-291 Canary',display_name:'Watchdog NJW-291 Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true,scenario:SCENARIO}},{onConflict:'id'});if(pr.error)throw new Error('sandbox_profile_failed');
  const ta=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'NJW-291 Planned Marker Canary',last_bootstrap_at:now,metadata:{no_real_spend:true,scenario:SCENARIO}},{onConflict:'user_id'});if(ta.error)throw new Error('sandbox_account_failed');
  const started=Date.now(),allPins=[...new Set([UNI_PIN,CHAPTER_PIN,...SHIFT_PINS])];
  const hydrate=await post('workbench-hydrate',{pams_pins:allPins,marker_ids:[UNI,LAND,IMPROVEMENT,PPSF]},access);
  const derived=await post('workbench-derived',{pams_pins:allPins,marker_ids:[CHAPTER,SHIFT]},access);
  const chapter=await post('chapter123-provider',{districts:[CHAPTER_PIN.slice(0,4)]});
  const subject=await post('sr1a-subject-provider',{subjects:[{key:CHAPTER_PIN,pams_pin:CHAPTER_PIN,district:CHAPTER_PIN.slice(0,4),block:'242',lot:'22',qualifier:''}]});
  const uniformity=await fetch('https://raw.githubusercontent.com/johnscafide/njtaxrelief/30c8cb8d1d029c4534adbc734ec787eb39e447a0/property/uniformity.json').then(r=>r.json());
  const mismatches:string[]=[];
  const expectedUni=uniformity?.districts?.[UNI_PIN.slice(0,4)]?.percentile,actualUni=hydrate.p?.markers?.[UNI_PIN]?.[UNI],uniMeta=hydrate.p?.meta?.[UNI_PIN]?.[UNI]||{};
  if(!hydrate.ok||Number(actualUni)!==Number(expectedUni)||uniMeta.provider_kind!=='derived_governed')mismatches.push('uniformity_percentile');
  let shiftControl:any=null;for(const pin of SHIFT_PINS){const exp=expectedShift(hydrate.p?.markers?.[pin]?.[LAND],hydrate.p?.markers?.[pin]?.[IMPROVEMENT]),actual=derived.p?.markers?.[pin]?.[SHIFT],meta=derived.p?.meta?.[pin]?.[SHIFT]||{};if(exp&&actual!==undefined&&meta.status==='available'){const row={pin,expected:exp.value,actual,kind:meta.provider_kind,from_year:exp.from_year,to_year:exp.to_year};if(!shiftControl||Math.abs(exp.value-50)>Math.abs(shiftControl.expected-50))shiftControl=row;}}
  if(!shiftControl||Number(shiftControl.actual)!==Number(shiftControl.expected)||shiftControl.kind!=='derived_governed')mismatches.push('assessment_component_shift');
  const cOfficial=chapter.p?.districts?.[CHAPTER_PIN.slice(0,4)],cSubject=subject.p?.records?.[CHAPTER_PIN],ppsf=n(hydrate.p?.markers?.[CHAPTER_PIN]?.[PPSF]),record=(hydrate.p?.records||[]).find((x:any)=>String(x.pams_pin)===CHAPTER_PIN),assessed=n(record?.assessed_value),sf=n(cSubject?.sf),lower=n(cOfficial?.lower),upper=n(cOfficial?.upper);let expectedChapter:any=null,subjectRatio:any=null;
  if(ppsf&&sf&&assessed&&lower!=null&&upper!=null){subjectRatio=assessed/(ppsf*sf)*100;expectedChapter=subjectRatio<lower?'below_lower_bound':subjectRatio>upper?'above_upper_bound':'within_common_level_range';}
  const actualChapter=derived.p?.markers?.[CHAPTER_PIN]?.[CHAPTER],chapterMeta=derived.p?.meta?.[CHAPTER_PIN]?.[CHAPTER]||{};
  if(!derived.ok||!chapter.ok||!subject.ok||!expectedChapter||actualChapter!==expectedChapter||chapterMeta.provider_kind!=='derived_governed')mismatches.push('chapter123_position');
  const ok=mismatches.length===0;const observations={uniformity:{pin:UNI_PIN,expected:expectedUni,actual:actualUni,kind:uniMeta.provider_kind||null},assessment_component_shift:shiftControl,chapter123:{pin:CHAPTER_PIN,expected:expectedChapter,actual:actualChapter,subject_ratio_pct:subjectRatio==null?null:Math.round(subjectRatio*100)/100,lower,upper,kind:chapterMeta.provider_kind||null,subject_status:subject.p?.meta?.[CHAPTER_PIN]?.status||null}};
  await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:SCENARIO,status_code:ok?200:502,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,observations}});
  return json(ok?200:502,{ok,scenario:SCENARIO,assertion_ok:ok,mismatches,observations,duration_ms:Date.now()-started});
 }catch(e){return json(500,{ok:false,scenario:SCENARIO,error:String((e as Error)?.message||e)})}finally{if(userId)await cleanup(userId)}
}
`);

write('supabase/functions/provider-release-canary/production-v042-bootstrap.ts',`import { handlePlannedMarkerBatchCanary } from './planned-marker-batch-canary.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}if(scenario==='planned_marker_batch_v1')return handlePlannedMarkerBatchCanary(req);return handler(req,info);};if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/30c8cb8d1d029c4534adbc734ec787eb39e447a0/supabase/functions/provider-release-canary/production-v041-bootstrap.ts');
`);

write('supabase/migrations/20260828203000_prepare_njw291_planned_marker_batch.sql',`-- NJW-291 candidate formulas. Provider coverage is promoted only after production canary evidence.
insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.chapter123_position','watchdog-derived-v22-njw291','assessment / (municipal verified-sales PPSF * matched subject living space) * 100, positioned against the official 2026 Chapter 123 lower and upper bounds',array['property.assessed_value','sales.ppsf']::text[],'high','live','Public-record screening position within the official Chapter 123 corridor. Returns below_lower_bound, within_common_level_range, or above_upper_bound. It is not appeal eligibility, legal advice, an appraisal, or a value conclusion.','chapter123_position',jsonb_build_object('assessed_dep','property.assessed_value','ppsf_dep','sales.ppsf'),now()),
('watchdog.njplus.assessment_component_shift','watchdog-derived-v22-njw291','latest consecutive MOD-IV transition: 50 + ((change in land share pp - change in improvement share pp) / 4), clamped 0-100',array['njplus.nj-dca-modiv-longitudinal.assessment_land_history','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history']::text[],'high','live','Directional assessment-composition index from actual consecutive published MOD-IV observations only. 50 means no composition shift; above 50 shifts toward land; below 50 shifts toward improvements. Missing years are never synthesized.','assessment_component_shift',jsonb_build_object('land_dep','njplus.nj-dca-modiv-longitudinal.assessment_land_history','improvement_dep','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history','neutral_score',50,'normalization_min_differential_pp',-200,'normalization_max_differential_pp',200,'require_consecutive_years',true),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();
`);

write('docs/property/njw-291-planned-marker-batch-certification-2026-08-28.md',`# NJW-291 planned marker batch certification

## Uniformity Percentile

**Marker:** \`uniformity.percentile\`

The canonical \`property/uniformity.json\` artifact already publishes a statewide percentile alongside the governed Assessment Uniformity Score. Runtime exposes that existing percentile as \`derived_governed\`; it is not a raw NJ Division of Taxation field. Absecon district 0101 is the control.

## Chapter 123 Position

**Marker:** \`watchdog.chapter123_position\`

This is a screening position only. It uses current assessed value divided by an independent public-sales anchor: municipal verified-sales median PPSF multiplied by the matched subject's SR-1A living-space record. The result is compared with the official 2026 Chapter 123 lower and upper bounds. Output is \`below_lower_bound\`, \`within_common_level_range\`, or \`above_upper_bound\`. No result is returned when independent subject evidence or the official corridor is unavailable. It is not appeal eligibility, legal advice, an appraisal, or a value conclusion.

## Assessment Component Shift

**Marker:** \`watchdog.njplus.assessment_component_shift\`

Use only the latest pair of consecutive published MOD-IV years with both land and improvement assessments present, nonnegative, and a positive combined assessment. Compute component shares within land + improvement, then \`differential_pp = change(land_share_pp) - change(improvement_share_pp)\`. The mathematically possible differential is -200 to +200 percentage points, so \`score = clamp(50 + differential_pp / 4, 0, 100)\`, rounded to one decimal. 50 means unchanged composition; above 50 shifts toward land; below 50 shifts toward improvements. Missing years are never synthesized.

## Release gate

Formula governance may be staged before release, but provider coverage remains unpromoted until the production canary independently reproduces the values from governed source inputs and verifies \`derived_governed\` provenance.
`);

console.log('NJW-291 patch artifacts prepared');

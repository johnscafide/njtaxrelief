// Phase 5 governed derived-marker engine.
// Declarative definitions + reusable operators. No marker becomes live without an explicit
// formula, declared dependencies and a canonical provider registration.
export const DERIVED_ENGINE_VERSION='watchdog-derived-v3';
export type Confidence='high'|'medium';
export type Result={v:any;formula:string;dependencies:string[];confidence:Confidence;explanation:string}|null;
type Requirement=string|{all:string[]}|{ratio:[string,string]};
type Signal={dep:string;weight:number;transform?:'bool'|'count3'|'count6'|'count10'|'flood100'|'identity'};
type Def={formula:string;dependencies:string[];confidence:Confidence;explanation:string;op:string;[k:string]:any};

const D=(formula:string,dependencies:string[],confidence:Confidence,explanation:string,op:string,extra:any={}):Def=>({formula,dependencies,confidence,explanation,op,...extra});

export const DERIVED_DEFINITIONS:Record<string,Def>={
 'watchdog.building_age_years':D('current_year - YR_CONSTR',['property.year_built'],'high','Elapsed years since recorded construction year.','year_delta',{dep:'property.year_built'}),
 'watchdog.years_since_last_sale':D('current_year - DEED_DATE.year',['property.deed_date'],'high','Elapsed years since the recorded deed/sale year.','year_delta',{dep:'property.deed_date',dateYear:true}),
 'watchdog.tax_to_assessment_rate':D('LAST_YR_TX / NET_VALUE * 100',['property.annual_tax','property.assessed_value'],'high','Annual property tax as a percent of recorded total assessment.','ratio',{num:'property.annual_tax',den:'property.assessed_value',scale:100,precision:3}),
 'watchdog.effective_tax_rate':D('LAST_YR_TX / NET_VALUE * 100',['property.annual_tax','property.assessed_value'],'high','Annual property tax as a percent of recorded total assessment.','ratio',{num:'property.annual_tax',den:'property.assessed_value',scale:100,precision:3}),
 'watchdog.land_share_pct':D('LAND_VAL / NET_VALUE * 100',['property.land_assessment','property.assessed_value'],'high','Land share of the total assessment.','ratio',{num:'property.land_assessment',den:'property.assessed_value',scale:100,precision:1}),
 'watchdog.improvement_share_pct':D('IMPRVT_VAL / NET_VALUE * 100',['property.improvement_assessment','property.assessed_value'],'high','Improvement share of the total assessment.','ratio',{num:'property.improvement_assessment',den:'property.assessed_value',scale:100,precision:1}),
 'watchdog.assessment_per_acre':D('NET_VALUE / CALC_ACRE',['property.assessed_value','property.lot_area'],'high','Assessed value normalized by parcel acreage.','ratio',{num:'property.assessed_value',den:'property.lot_area',scale:1,precision:0}),
 'watchdog.sale_to_assessment_ratio':D('SALE_PRICE / NET_VALUE',['property.sale_price','property.assessed_value'],'high','Recorded sale price divided by total assessment.','ratio',{num:'property.sale_price',den:'property.assessed_value',scale:1,precision:3}),
 'watchdog.assessment_to_sale_ratio':D('NET_VALUE / SALE_PRICE',['property.assessed_value','property.sale_price'],'high','Total assessment divided by recorded sale price.','ratio',{num:'property.assessed_value',den:'property.sale_price',scale:1,precision:3}),
 'watchdog.land_to_improvement_ratio':D('LAND_VAL / IMPRVT_VAL',['property.land_assessment','property.improvement_assessment'],'high','Land assessment divided by improvement assessment.','ratio',{num:'property.land_assessment',den:'property.improvement_assessment',scale:1,precision:3}),
 'watchdog.consumer.home_cost_clarity':D('present(annual_tax, tax_rate, assessment, sale_context) / 4 * 100',['property.annual_tax','property.assessed_value','property.sale_price','property.sale_date'],'high','Completeness of core public cost facts used for homeowner planning; it is not a cost or value opinion.','completeness',{requirements:['property.annual_tax',{ratio:['property.annual_tax','property.assessed_value']},'property.assessed_value',{all:['property.sale_price','property.sale_date']}] as Requirement[]}),
 'watchdog.consumer.public_record_completeness':D('present(address, municipality, block, lot, property_class, assessment, annual_tax, year_built, lot_area, sale_date) / 10 * 100',['property.address','property.municipality','property.block','property.lot','property.property_class','property.assessed_value','property.annual_tax','property.year_built','property.lot_area','property.sale_date'],'high','Completeness of a defined homeowner-facing public parcel record set; missing facts remain missing.','completeness'),
 'watchdog.title.recording_reference_completeness':D('present(deed_book, deed_page, sale_date, parcel_id) / 4 * 100',['property.deed_book','property.deed_page','property.sale_date','property.pams_pin'],'high','Completeness of key public recording references; not a title opinion.','completeness'),
 'watchdog.agent.client_brief_completeness':D('present(address, municipality, property_class, assessment, annual_tax, sale_price, sale_date, year_built, lot_area) / 9 * 100',['property.address','property.municipality','property.property_class','property.assessed_value','property.annual_tax','property.sale_price','property.sale_date','property.year_built','property.lot_area'],'high','Completeness of the defined public-record essentials used in a client brief; not a CMA or valuation.','completeness'),
 'watchdog.lender.lending_diligence_coverage':D('present(parcel_id, property_class, assessment, annual_tax, sale_price, sale_date, year_built, lot_area) / 8 * 100',['property.pams_pin','property.property_class','property.assessed_value','property.annual_tax','property.sale_price','property.sale_date','property.year_built','property.lot_area'],'high','Coverage of defined public collateral facts for diligence discussion; not an underwriting conclusion.','completeness'),
 'watchdog.appraisal_record_completeness':D('present(land_assessment, improvement_assessment, assessment, sale_price, sale_date, year_built, lot_area, property_class) / 8 * 100',['property.land_assessment','property.improvement_assessment','property.assessed_value','property.sale_price','property.sale_date','property.year_built','property.lot_area','property.property_class'],'high','Completeness of defined public appraisal inputs; not an appraisal or value conclusion.','completeness'),
 'watchdog.appraiser.public_input_gap':D('100 - watchdog.appraisal_record_completeness',['watchdog.appraisal_record_completeness'],'high','Share of the defined public appraisal-input set that is missing.','inverse',{dep:'watchdog.appraisal_record_completeness'}),
 'watchdog.lender.collateral_record_gap':D('100 - watchdog.appraisal_record_completeness',['watchdog.appraisal_record_completeness'],'high','Share of the defined public appraisal-input set missing before collateral workflow handoff.','inverse',{dep:'watchdog.appraisal_record_completeness'}),
 'watchdog.permit_closure_confidence':D('100 * (1 - min(open_permit_count / permit_count, 1))',['preflight.permit_count','preflight.open_permit_count'],'medium','Permit-record closure screening confidence from published permit counts; not a certificate or code-clearance determination.','permit_closure'),
 'watchdog.contractor.construction_record_gap':D('100 - watchdog.permit_closure_confidence',['watchdog.permit_closure_confidence'],'medium','Permit/certificate record gap signal derived from published permit counts; not a code-compliance determination.','inverse',{dep:'watchdog.permit_closure_confidence'}),
 'watchdog.permit_activity_score':D('min(100, min(permit_count,20)*3 + min(open_permit_count,10)*8)',['preflight.permit_count','preflight.open_permit_count'],'medium','Permit activity screening score; not a compliance finding.','permit_activity'),
 'watchdog.environmental_encumbrance_severity':D('deed_notice*35 + CEA*30 + min(contaminated_sites,3)*12 + min(UST,3)*8',['preflight.deed_notice_hit','preflight.cea_hit','preflight.contaminated_site_500m','preflight.ust_250m'],'medium','Environmental due-diligence screening severity; not a contamination determination.','weighted_signals',{signals:[{dep:'preflight.deed_notice_hit',weight:35,transform:'bool'},{dep:'preflight.cea_hit',weight:30,transform:'bool'},{dep:'preflight.contaminated_site_500m',weight:36,transform:'count3'},{dep:'preflight.ust_250m',weight:24,transform:'count3'}] as Signal[]}),
 'watchdog.title_constraint_stack':D('count(tidelands, deed_notice, wetlands, priority_wetlands, highlands, pinelands)',['preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.highlands_hit','preflight.pinelands_hit'],'medium','Mapped constraint signal count; not a title opinion.','signal_count'),
 'watchdog.flood_environment_risk_score':D('FEMA_zone_weight + tidal_CAFE*18 + wetlands*10 + priority_wetlands*6',['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit'],'medium','Combined flood/environment screening score.','weighted_signals',{signals:[{dep:'preflight.fema_flood_zone',weight:66,transform:'flood100'},{dep:'preflight.tidal_cafe_hit',weight:18,transform:'bool'},{dep:'preflight.wetlands_2012_hit',weight:10,transform:'bool'},{dep:'preflight.epa_priority_wetland_hit',weight:6,transform:'bool'}] as Signal[]}),
 'watchdog.due_diligence_signal_count':D('count(active governed preflight signals)',['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.cea_hit','preflight.highlands_hit','preflight.pinelands_hit'],'medium','Count of active mapped due-diligence signals.','signal_count',{floodDep:'preflight.fema_flood_zone'}),

 // Newly unblocked by Phases 3-4. These use only currently governed DCA/NJDEP/FEMA dependencies.
 'watchdog.certificate_closure_rate':D('certificate_count / permit_issued_count * 100',['njplus.nj-dca-permits-raw.certificate_count','njplus.nj-dca-permits-raw.permit_issued_count'],'medium','Published certificate-record count as a share of published permit records; not a municipal code-clearance determination.','ratio',{num:'njplus.nj-dca-permits-raw.certificate_count',den:'njplus.nj-dca-permits-raw.permit_issued_count',scale:100,precision:1,zeroAs100:true}),
 'watchdog.regulatory_constraint_density':D('active(highlands,pinelands,wetlands,priority_wetlands,tidal) / 5 * 100',['preflight.highlands_hit','preflight.pinelands_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.tidal_cafe_hit'],'medium','Share of the currently governed statewide regulatory-screen layers that intersect the parcel.','signal_density'),
 'watchdog.development_constraint_density':D('active(flood,tidal,wetlands,priority_wetlands,highlands,pinelands) / 6 * 100',['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.highlands_hit','preflight.pinelands_hit'],'medium','Density of currently governed mapped development-screen constraints; not a development feasibility conclusion.','signal_density',{floodDep:'preflight.fema_flood_zone'}),
 'watchdog.closing_exception_priority':D('30% open-permit screen + 25% title constraints + 25% environmental screen + 20% flood/environment screen',['preflight.open_permit_count','watchdog.title_constraint_stack','watchdog.environmental_encumbrance_severity','watchdog.flood_environment_risk_score'],'medium','Ranks governed public-record exceptions for a closing checklist without making a legal or title determination.','weighted_scores',{items:[{dep:'preflight.open_permit_count',weight:30,transform:'count10'},{dep:'watchdog.title_constraint_stack',weight:25,transform:'count6'},{dep:'watchdog.environmental_encumbrance_severity',weight:25,transform:'identity'},{dep:'watchdog.flood_environment_risk_score',weight:20,transform:'identity'}] as Signal[]}),
 'watchdog.preoffer_public_record_risk':D('30% construction record gap + 25% flood/environment + 25% environmental encumbrance + 20% title constraints',['watchdog.contractor.construction_record_gap','watchdog.flood_environment_risk_score','watchdog.environmental_encumbrance_severity','watchdog.title_constraint_stack'],'medium','Pre-offer public-record screening priority using governed permit, flood, environmental and title-reference signals; not legal advice.','weighted_scores',{items:[{dep:'watchdog.contractor.construction_record_gap',weight:30,transform:'identity'},{dep:'watchdog.flood_environment_risk_score',weight:25,transform:'identity'},{dep:'watchdog.environmental_encumbrance_severity',weight:25,transform:'identity'},{dep:'watchdog.title_constraint_stack',weight:20,transform:'count6'}] as Signal[]}),
 'watchdog.transaction_diligence_completion':D('checked governed preflight sources / required governed preflight sources * 100',['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.tidelands_reference_hit','preflight.deed_notice_hit','preflight.cea_hit','preflight.highlands_hit','preflight.pinelands_hit','preflight.permit_count','preflight.open_permit_count'],'medium','Completion meter for the defined governed public-record transaction checks; it measures source coverage, not transaction readiness.','completeness'),
 'watchdog.source_authority_coverage':D('present(authoritative parcel, assessment, tax, sale and deed reference fields) / 12 * 100',['property.pams_pin','property.address','property.municipality','property.block','property.lot','property.property_class','property.assessed_value','property.annual_tax','property.sale_price','property.sale_date','property.deed_book','property.deed_page'],'high','Coverage of a defined authoritative public-record core used by Watchdog professional briefs.','completeness'),
 'watchdog.property_story_confidence':D('40% source authority coverage + 35% public record completeness + 25% recording-reference completeness',['watchdog.source_authority_coverage','watchdog.consumer.public_record_completeness','watchdog.title.recording_reference_completeness'],'medium','Confidence that the public facts supporting a property brief are complete; not a valuation or transaction conclusion.','weighted_scores',{items:[{dep:'watchdog.source_authority_coverage',weight:40,transform:'identity'},{dep:'watchdog.consumer.public_record_completeness',weight:35,transform:'identity'},{dep:'watchdog.title.recording_reference_completeness',weight:25,transform:'identity'}] as Signal[]})
};

const ROW:Record<string,(r:any)=>any>={
 'property.address':r=>r?.address,'property.municipality':r=>r?.town,'property.county':r=>r?.county,'property.zip':r=>r?.zip,'property.block':r=>r?.block,'property.lot':r=>r?.lot,'property.qualifier':r=>r?.qualifier,'property.pams_pin':r=>r?.pams_pin,
 'property.property_class':r=>r?.prop_class,'property.class':r=>r?.prop_class,'property.year_built':r=>r?.year_built,'property.lot_area':r=>r?.acres,'property.acres':r=>r?.acres,'property.units':r=>r?.dwelling_units,
 'property.assessed_value':r=>r?.assessed_value,'property.annual_tax':r=>r?.last_year_tax,'property.land_assessment':r=>r?.land_value,'property.land_value':r=>r?.land_value,'property.improvement_assessment':r=>r?.improvement_value,'property.improvement_value':r=>r?.improvement_value,
 'property.sale_price':r=>r?.last_sale_price,'property.last_sale_price':r=>r?.last_sale_price,'property.sale_date':r=>r?.deed_date??r?.last_sale_year,'property.deed_date':r=>r?.deed_date??r?.last_sale_year,'property.deed_book':r=>r?.deed_book,'property.deed_page':r=>r?.deed_page
};
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
function present(v:any){return v!==null&&v!==undefined&&v!==''}
function truth(v:any){return v===true||v===1||v==='1'||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes'}
function clamp(v:number,min=0,max=100){return Math.max(min,Math.min(max,v))}
function round(v:number,p=0){const f=10**p;return Math.round(v*f)/f}
function floodBand(v:any){const z=String(v||'').toUpperCase();if(!z)return 0;if(/^(A|AE|AH|AO|AR|A99|V|VE)/.test(z))return 100;if(/^(X.*0\.2|B)/.test(z))return 66;if(/^(X|C)/.test(z))return 0;return 33}
function signalValue(v:any,t:string='bool'){if(t==='identity')return clamp(n(v)??0);if(t==='bool')return truth(v)||(n(v)!=null&&Number(v)>0)?100:0;if(t==='flood100')return floodBand(v);const cap=Number(t.replace('count',''))||1;return clamp(((n(v)||0)/cap)*100)}
function requirementPresent(req:Requirement,value:(d:string)=>any){if(typeof req==='string')return present(value(req));if('all'in req)return req.all.every(d=>present(value(d)));if('ratio'in req){const a=n(value(req.ratio[0])),b=n(value(req.ratio[1]));return a!=null&&b!=null&&b!==0}return false}

export function isGovernedDerived(id:string){return Object.prototype.hasOwnProperty.call(DERIVED_DEFINITIONS,id)}
export function derivedDependencies(id:string){return DERIVED_DEFINITIONS[id]?.dependencies||[]}
export function governedDerivedIds(){return Object.keys(DERIVED_DEFINITIONS)}

export function derive(id:string,get:(id:string)=>any,row:any):Result{
 const memo=new Map<string,Result>();
 const stack=new Set<string>();
 const evalOne=(mid:string):Result=>{
   if(memo.has(mid))return memo.get(mid)!;
   const def=DERIVED_DEFINITIONS[mid];if(!def)return null;if(stack.has(mid))return null;stack.add(mid);
   const value=(dep:string):any=>{const rv=ROW[dep]?.(row);if(rv!==undefined&&rv!==null&&rv!=='')return rv;const gv=get(dep);if(gv!==undefined&&gv!==null&&gv!=='')return gv;if(DERIVED_DEFINITIONS[dep])return evalOne(dep)?.v??null;return rv??gv??null};
   let v:any=null;
   if(def.op==='year_delta'){
     const raw=value(def.dep);let y=n(raw);if(def.dateYear&&!y){const m=String(raw||'').match(/(19|20)\d{2}/);if(m)y=Number(m[0])}if(y&&y>1600)v=new Date().getUTCFullYear()-y;
   }else if(def.op==='ratio'){
     const a=n(value(def.num)),b=n(value(def.den));if(a!=null&&b!=null){if(b===0)v=def.zeroAs100&&a===0?100:null;else v=round(a/b*Number(def.scale??1),Number(def.precision??3))}
   }else if(def.op==='completeness'){
     const reqs:(Requirement[])=(def.requirements||def.dependencies);if(reqs.length)v=Math.round(reqs.filter(x=>requirementPresent(x,value)).length/reqs.length*100);
   }else if(def.op==='inverse'){
     const x=n(value(def.dep));if(x!=null)v=clamp(100-x);
   }else if(def.op==='permit_closure'){
     const pc=n(value('preflight.permit_count')),oc=n(value('preflight.open_permit_count'));if(pc!=null||oc!=null){if((pc||0)<=0)v=(oc||0)>0?0:100;else v=Math.round((1-Math.min((oc||0)/pc!,1))*100)}
   }else if(def.op==='permit_activity'){
     const pc=n(value('preflight.permit_count')),oc=n(value('preflight.open_permit_count'));if(pc!=null||oc!=null)v=clamp(Math.round(Math.min(pc||0,20)*3+Math.min(oc||0,10)*8));
   }else if(def.op==='weighted_signals'){
     const vals=(def.signals as Signal[]).map(s=>({s,v:value(s.dep)}));if(vals.some(x=>present(x.v))){let total=0;for(const x of vals)total+=signalValue(x.v,x.s.transform)*x.s.weight/100;v=clamp(Math.round(total))}
   }else if(def.op==='signal_count'){
     const vals=def.dependencies.map((d:string)=>d===def.floodDep?floodBand(value(d))>0:(truth(value(d))||(n(value(d))||0)>0));if(def.dependencies.some((d:string)=>present(value(d))))v=vals.filter(Boolean).length;
   }else if(def.op==='signal_density'){
     if(def.dependencies.some((d:string)=>present(value(d)))){const active=def.dependencies.filter((d:string)=>d===def.floodDep?floodBand(value(d))>0:(truth(value(d))||(n(value(d))||0)>0)).length;v=Math.round(active/def.dependencies.length*100)}
   }else if(def.op==='weighted_scores'){
     const items=(def.items as Signal[]).map(s=>({s,v:value(s.dep)})).filter(x=>present(x.v));if(items.length){const w=items.reduce((a,x)=>a+x.s.weight,0);v=Math.round(items.reduce((a,x)=>a+signalValue(x.v,x.s.transform)*x.s.weight,0)/w)}
   }
   stack.delete(mid);const out=v===null||v===undefined||Number.isNaN(v)?null:{v,formula:def.formula,dependencies:def.dependencies,confidence:def.confidence,explanation:def.explanation};memo.set(mid,out);return out;
 };
 return evalOne(id);
}

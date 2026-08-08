(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);},q=new URLSearchParams(location.search);
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function label(v){return String(v||'').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
  function uniq(list){var seen={};return list.filter(function(x){var k=(x.url||'')+'|'+(x.label||'');if(!k||seen[k])return false;seen[k]=1;return true;});}

  var MODIV_PLAIN={
    median_assessed_value:'The middle property assessment in this town. Half of assessed parcels are above it and half are below it.',
    assessment_dispersion_iqr_pct:'How spread out the middle half of property assessments are in this town. A larger number means property assessments vary more widely.',
    median_annual_tax:'The middle reported annual property-tax bill in this town for parcels with a positive reported tax.',
    tax_dispersion_iqr_pct:'How much the middle range of reported tax bills varies across the town. A larger number means tax bills are more spread out.',
    median_assessment_change_pct:'The typical assessment change compared with the prior assessment on the state file.',
    assessment_growth_positive_share_pct:'The share of comparable parcels whose assessment went up. It tells you how widespread assessment increases are, not why they happened.',
    assessment_change_dispersion_pct:'How differently assessments are changing from parcel to parcel. A wider spread can signal that changes are concentrated rather than uniform.',
    assessment_jump_share_pct:'The share of comparable parcels with an assessment move greater than 10% in either direction. Think of it as a town-wide large-change detector.',
    median_land_share_pct:'How much of a typical assessment is assigned to the land rather than the building or other improvements.',
    improvement_value_share_pct:'How much of the town’s total assessed value is tied to buildings and improvements instead of land.',
    residential_parcel_share_pct:'The percentage of parcels the state classifies as residential. It is a quick picture of how residential the tax base is.',
    commercial_parcel_share_pct:'The percentage of parcels in commercial, industrial or apartment-related class 4 categories.',
    exempt_parcel_share_pct:'The percentage of parcels classified as tax exempt. These properties can shape how much of the local tax base is carried by taxable property.',
    vacant_parcel_share_pct:'The percentage of parcels classified as vacant land. It is a simple indicator of undeveloped parcel presence, not buildability.',
    farm_parcel_share_pct:'The percentage of parcels in farm-related property classes on the MOD-IV roll.',
    recent_sale_turnover_pct:'How many parcel records show a recent deed and positive sale amount relative to the town’s parcel count. It is a turnover signal, not a verified-sales rate.',
    median_building_age:'The age of the middle reported building by construction year. It gives a quick sense of how old the town’s building stock is.',
    pre_1978_building_share_pct:'The share of parcels with a reported building year before 1978. It is an age-screening signal, not a statement that a property contains lead or another hazard.',
    recent_build_share_pct:'The share of parcels with reported construction from 2020 through 2026. It is a simple measure of newer building stock.',
    median_effective_tax_rate_pct:'The middle latest-reported tax bill divided by current assessment. It describes the relationship between those two reported numbers, not a market-value effective tax rate.',
    median_sale_assessment_ratio_pct:'The middle relationship between reported sale assessment and recorded sale price. It is broad context and is not the state’s verified SR-1A equalization ratio.',
    sale_assessment_ratio_dispersion_pct:'How widely recorded sale-to-assessment relationships vary around the town. More spread means the recorded ratios are less tightly clustered.',
    median_parcel_acres:'The middle positive parcel acreage reported in MOD-IV. Half of parcels with usable acreage are larger and half are smaller.',
    assessed_value_per_acre:'Total net assessment divided by total positive reported parcel acreage. It is an assessment-density measure, not land market value per acre.'
  };

  var SOURCE_ALIASES={
    'nj-tax-court-appeals':'appeals','nj-cod':'cod-history','nj-dca-budget':'budget-pressure','nj-abstract-pilot':'exempt-pilot',
    'nj-sr1a':'sr1a-ratios','nj-dca-permits-raw':'construction-permits-live','njdep-csrr-gis':'known-contaminated-sites-live'
  };
  var DIRECT={
    'nj-parcels-modiv':{label:'NJGIN Parcels and MOD-IV',agency:'NJ Office of GIS',url:'https://www.nj.gov/njgin/',note:'Statewide parcel and MOD-IV access published by New Jersey.'},
    'nj-division-taxation':{label:'Local Property Tax Statistical Information',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml',note:'Official New Jersey property-tax statistical publications.'},
    'nj-tax-abstract':{label:'Local Property Tax Statistical Information',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml'},
    'nj-tax-court-appeals':{label:'Assessment and Appeals',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/lpt-appeal.shtml'},
    'njdep-dca-live':{label:'DCA Data Hub',agency:'NJ Department of Community Affairs',url:'https://datahub.dca.nj.gov/'},
    'watchdog-models':{label:'NJ Local Property Tax Statistical Information',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml',note:'Common authoritative input family used by Watchdog property-tax calculations.'},
    'watchdog-professional':{label:'NJ Local Property Tax Statistical Information',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml',note:'Common authoritative input family; exact inputs depend on the formula shown above.'},
    'watchdog-professional-v030':{label:'NJ Local Property Tax Statistical Information',agency:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml',note:'Common authoritative input family; exact inputs depend on the formula shown above.'},
    'watchdog-institutional':{label:'NJ Open Data / NJDEP public records',agency:'State of New Jersey',url:'https://data.nj.gov/',note:'Common public-data family used by institutional screening markers.'}
  };
  var SUPPLEMENTAL={
    assessment:{label:'IAAO Technical Standards',url:'https://www.iaao.org/industry-data/iaao-technical-standards/',note:'Professional assessment reference. IAAO guidance is contextual and does not supply the Watchdog value.'},
    flood:{label:'FEMA Flood Maps: Products and Tools',url:'https://www.fema.gov/flood-maps/products-tools',note:'Federal flood-mapping reference. Use official FEMA products for regulatory flood-map confirmation.'}
  };

  function plainEnglish(m,rich){
    if(rich.layman)return rich.layman;
    if(m.id.indexOf('modiv_intel.')===0){var key=m.id.split('.').pop();if(MODIV_PLAIN[key])return MODIV_PLAIN[key];}
    if(m.origin==='watchdog-derived')return 'This is a Watchdog screening signal. It combines or transforms public-record facts so you can spot what deserves attention without comparing every raw field yourself. It is a starting point for a decision, not the final decision.';
    return (rich.plain||m.description||('This is the reported '+m.label.toLowerCase()+' used by Watchdog.'))+' Watchdog keeps the source and scope attached so you can see where the number came from.';
  }
  function howToRead(m){
    var text=(m.id+' '+m.label+' '+(m.unit||'')).toLowerCase();
    if(/percentile/.test(text))return 'A higher percentile means the value is higher than more New Jersey comparison areas. Percentile is position, not a grade: higher is not automatically better.';
    if(/dispersion|spread|variab/.test(text))return 'Larger values mean the underlying observations are more spread out. Smaller values mean they are clustered more tightly. That difference can be useful for screening, but it does not explain the cause.';
    if(/share|prevalence|turnover|pct|percent/.test(text))return 'Read this as a percentage of the relevant records. A larger percentage means the condition is more common in the measured group; it does not automatically mean good or bad.';
    if(/score|index|strength|risk|confidence/.test(text))return 'Treat this as a prioritization signal. Compare it with its components and source records before acting; a score compresses evidence but cannot replace the evidence.';
    return 'Read the current value together with its scope, date and source. Town and county markers describe the surrounding area and should not be mistaken for a fact about the individual parcel.';
  }
  function cautionFor(m,rich){
    if(rich.caution)return rich.caution;
    if(m.id.indexOf('modiv_intel.')===0)return 'This is municipality-level context compiled from the 2026 MOD-IV release. It does not prove a condition at an individual property. MOD-IV recorded-sale fields are not represented as verified arm’s-length SR-1A sales.';
    if(m.origin==='watchdog-derived')return 'This is a screening/decision-support calculation, not an appraisal, legal opinion, title report, credit decision, engineering finding or guarantee. Confirm the underlying public records for a transaction or filing.';
    return 'Public records can be delayed, corrected, incomplete or differently defined across agencies. Confirm the governing agency record when the result will be used for a legal, financial or transaction decision.';
  }
  function professionalUse(m,reg){
    return m.professions.map(function(id){var p=reg.professions.find(function(x){return x.id===id;});return '<span><i class="fas fa-briefcase"></i><b>'+esc(p?p.label:label(id))+'</b><small>'+esc(m.professional_reason||('Uses '+m.label.toLowerCase()+' as supporting context in property review and client decision-making.'))+'</small></span>';}).join('');
  }
  function normalizedSource(source,type){
    if(!source)return null;return {label:source.label||source.agency||source.id,agency:source.agency||'',url:source.source_url||source.url||'',note:source.warning||source.coverage||source.note||source.cadence||'',type:type||'Primary / input data'};
  }
  function inferReference(m){
    var t=(m.id+' '+m.label+' '+m.category+' '+(m.formula||'')).toLowerCase(),out=[];
    if(/assessment|uniformity|ratio|apprais|comparable|valuation/.test(t))out.push(Object.assign({type:'Related professional reference'},SUPPLEMENTAL.assessment));
    if(/flood/.test(t))out.push(Object.assign({type:'Related professional reference'},SUPPLEMENTAL.flood));
    return out;
  }
  function sourceList(m,rich,registries,reg){
    var all=registries.all,byId=registries.byId,out=[];
    (rich.sources||[]).forEach(function(s){out.push({label:s.label,url:s.url,note:s.note||'',type:'Primary / input data'});});
    var key=SOURCE_ALIASES[m.source_id]||m.source_id,source=byId[key];
    if(!source||!(source.source_url||source.url))source=DIRECT[m.source_id]||source;
    if(source)out.push(normalizedSource(source,'Primary / input data'));
    if(source&&source.layout_url)out.push({label:(source.label||'Source')+' · record layout',agency:source.agency||'',url:source.layout_url,note:'Official field layout used to parse the statewide source release.',type:'Technical source specification'});
    var markerDeps=(m.dependencies||[]);
    markerDeps.forEach(function(dep){
      var depSource=byId[SOURCE_ALIASES[dep]||dep]||DIRECT[dep];
      if(!depSource){var dm=reg.markers.find(function(x){return x.id===dep;});if(dm)depSource=byId[SOURCE_ALIASES[dm.source_id]||dm.source_id]||DIRECT[dm.source_id];}
      if(depSource)out.push(normalizedSource(depSource,'Input data'));
    });
    if(m.origin==='watchdog-derived'&&!out.length&&DIRECT[m.source_id])out.push(normalizedSource(DIRECT[m.source_id],'Common input source'));
    inferReference(m).forEach(function(s){out.push(s);});
    return uniq(out).filter(function(s){return s&&s.url;});
  }
  function sourceHTML(list){
    if(!list.length)return '<li class="mk-empty">A direct external URL has not yet been assigned to this marker’s source family. The source identifier remains recorded in the marker registry.</li>';
    return list.map(function(s){return '<li><div class="mk-source-type">'+esc(s.type||'Reference')+'</div><div class="mk-source-body"><b>'+esc(s.label)+'</b>'+(s.agency?'<span>'+esc(s.agency)+'</span>':'')+'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.url)+' <i class="fas fa-arrow-up-right-from-square"></i></a>'+(s.note?'<p>'+esc(s.note)+'</p>':'')+'</div></li>';}).join('');
  }

  Promise.all([
    window.njptrAccessReady||Promise.resolve({developer:false}),
    fetch('/property/data/marker-registry.json?v=20260807h').then(function(r){return r.json();}),
    fetch('/property/data/marker-content.json?v=20260805a').then(function(r){return r.json();}).catch(function(){return{markers:{}};}),
    fetch('/property/data/source-registry.json?v=20260807c').then(function(r){return r.json();}).catch(function(){return{datasets:[]};}),
    fetch('/property/data/data-factory-sources.json?v=20260807h').then(function(r){return r.json();}).catch(function(){return{sources:[]};}),
    fetch('/property/data/nj-proplus-source-catalog-v031.json?v=20260807a').then(function(r){return r.json();}).catch(function(){return{sources:[]};}),
    fetch('/property/data/derived-marker-formulas.json?v=20260807h').then(function(r){return r.json();}).catch(function(){return{markers:{}};}),
    fetch('/property/data/marker-refresh-policy.json?v=20260807h').then(function(r){return r.json();}).catch(function(){return{markers:[]};})
  ]).then(function(x){
    var access=x[0]||{},reg=x[1],id=q.get('id'),rich=(x[2].markers||{})[id]||{},formula=(x[6].markers||{})[id],refresh=(x[7].markers||[]).find(function(v){return v.marker_id===id;}),m=reg.markers.find(function(v){return v.id===id;});
    if(!m)throw Error('Unknown marker');
    if(!formula&&m.formula)formula={formula:m.formula,range:m.unit||''};
    if(m.tier!=='standard'&&!access.developer){location.replace('/property/dashboard.html?access=restricted');return;}
    var sources=[].concat(x[3].datasets||[],x[4].sources||[],x[5].sources||[]),byId={};sources.forEach(function(s){byId[s.id]=s;});
    document.title=m.label+' | Watchdog Data';$('mk-title').textContent=m.label;$('mk-crumb').textContent=label(m.category)+' · '+label(m.scope);
    $('mk-intro').textContent=rich.plain||m.description||'A Watchdog data marker with plan, profession and provenance metadata.';
    $('mk-plain').textContent=plainEnglish(m,rich);
    $('mk-why').textContent=rich.why||m.professional_reason||('This '+label(m.scope).toLowerCase()+' marker helps add context to '+label(m.category).toLowerCase()+' analysis.');
    $('mk-read').textContent=howToRead(m);
    $('mk-method').textContent=rich.method||(formula?formula.formula:(m.origin==='watchdog-derived'?'Watchdog transforms one or more governed source fields into this screening signal.':'Reported or calculated from the public source identified below.'));
    if(formula&&formula.formula){$('mk-formula').hidden=false;$('mk-formula').innerHTML='<span>FORMULA / RULE</span><code>'+esc(formula.formula)+'</code>'+(formula.range?'<small>Output / range: '+esc(formula.range)+'</small>':'');}
    $('mk-professions').innerHTML=professionalUse(m,reg)||'<span><b>General property research</b><small>Useful as supporting context when reviewing this property or municipality.</small></span>';
    $('mk-caution').textContent=cautionFor(m,rich);
    $('mk-badges').innerHTML='<span class="tier">'+esc(m.tier==='pro_plus'?'Pro+':label(m.tier))+'</span><span>'+esc(m.origin==='public'?'Public source':'Watchdog proprietary')+'</span><span>'+esc(label(m.scope))+'</span>'+(m.unit?'<span>'+esc(label(m.unit))+'</span>':'');
    var value=q.get('value'),note=q.get('note');if(value){$('mk-reading').hidden=false;$('mk-reading').innerHTML='<div><span>Current reading</span><b>'+esc(value)+'</b></div>'+(note?'<div><span>Context</span><small>'+esc(note)+'</small></div>':'');}
    $('mk-sources').innerHTML=sourceHTML(sourceList(m,rich,{all:sources,byId:byId},reg));
    $('mk-refresh').innerHTML=refresh?'<i class="fas fa-clock-rotate-left"></i><div><b>'+esc(label(refresh.cadence))+' refresh contract</b><span>'+esc(refresh.rule)+' Trigger: '+esc(String(refresh.trigger||'').replace(/_/g,' '))+'.</span></div>':'';
    $('mk-related').innerHTML=(rich.related||[]).map(function(rid){var z=reg.markers.find(function(v){return v.id===rid;});return'<a href="/property/marker.html?id='+encodeURIComponent(rid)+'">'+esc(z?z.label:rid)+'</a>';}).join('')||'<span class="mk-empty">Related markers are curated as their source relationships are validated.</span>';
    var pin=q.get('pin');if(pin)$('mk-back').href='/property/home.html?pin='+encodeURIComponent(pin);
  }).catch(function(e){$('mk-title').textContent='Data marker not found';$('mk-intro').textContent='The marker identifier is missing or no longer available.';console.error(e);});
})();

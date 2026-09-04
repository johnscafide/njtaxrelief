/* Professional due-diligence signals from live NJ DCA + NJDEP public endpoints. */
(function () {
  'use strict';
  var DCA = 'https://data.nj.gov/resource/w9se-dmra.json';
  var DEP_NJEMS = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer';
  var DEP_ENV = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental/MapServer';
  var DEP_RSP = 'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer';
  var DEP_HYDRO = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer';
  var DEP_LAND = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer';
  var DEP_LAND_LU = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land_lu/MapServer';
  var DEP_GEO = 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer';
  var cache = Object.create(null);
  var records = Object.create(null);
  var evidenceRecords = Object.create(null);

  function key(r) { return String((r && (r.pams_pin || r.id)) || 'property').replace(/[^a-z0-9]/gi, ''); }
  function clean(v) { return String(v == null ? '' : v).trim(); }
  function safe(v) { return clean(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function date(v) { if(!v)return 'date not reported';var d=new Date(v);return isNaN(d)?clean(v):d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function propertyIdentity(r) {
    var pin = clean(r.pams_pin), parts = pin.split('_');
    return { code: clean(r.treasurycode || r.treasury_code || r.mun_code || parts[0] || '').padStart(4,'0'), block: clean(r.block || parts[1] || ''), lot: clean(r.lot || parts[2] || '').split(' ')[0] };
  }
  function json(url) { return fetch(url,{credentials:'omit'}).then(function(res){if(!res.ok)throw Error('HTTP '+res.status);return res.json();}); }
  function permits(r) {
    var id=propertyIdentity(r); if(!id.code||!id.block||!id.lot)return Promise.resolve({rows:[],unavailable:'Block/lot identity is incomplete.'});
    var q=new URLSearchParams({treasurycode:id.code,block:id.block,lot:id.lot,'$limit':'200','$order':'permitdate DESC','$select':'treasurycode,muniname,county,recordid,block,lot,permitno,status,permitstatusdesc,permitdate,certdate,permittype,permittypedesc'});
    return json(DCA+'?'+q.toString()).then(function(rows){return{rows:rows||[],id:id};});
  }
  function geoQuery(base,layer,r,distance,fields) {
    var lat=+r.lat,lon=+r.lon;if(!isFinite(lat)||!isFinite(lon))return Promise.resolve({features:[],unavailable:'Location is not available for this saved property.'});
    var p=new URLSearchParams({f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:fields||'*',returnGeometry:'false'});
    if(distance){p.set('distance',String(distance));p.set('units','esriSRUnit_Meter');}
    return json(base+'/'+layer+'/query?'+p.toString());
  }
  function inspect(r) {
    var k=key(r);if(cache[k])return cache[k];
    var q={
      permits:permits(r),
      contaminated:geoQuery(DEP_NJEMS,0,r,500,'PI_NAME,ADDRESS,PI_NUMBER,STATUS,REMEDIAL_L,DN_STATUS,CEA_STATUS'),
      deed:geoQuery(DEP_ENV,40,r,0,'PREF_ID_NUM,PI_NAME,DN_NAME,ADDRESS,BLOCK_LOT,FILED_DATE,DESCRIPTION,CAP_TYPE,ACRES'),
      cea:geoQuery(DEP_RSP,5,r,0,'*'),ust:geoQuery(DEP_NJEMS,9,r,250,'*'),tidelands:geoQuery(DEP_HYDRO,30,r,0,'*'),
      highlands:geoQuery(DEP_RSP,6,r,0,'*'),pinelands:geoQuery(DEP_RSP,7,r,0,'*'),flood:geoQuery(DEP_HYDRO,43,r,0,'*'),cafe:geoQuery(DEP_HYDRO,48,r,0,'*'),
      wetlands:geoQuery(DEP_LAND_LU,2,r,0,'ACRES,LABEL12,TYPE12'),priorityWetlands:geoQuery(DEP_LAND,79,r,0,'*'),
      mines:geoQuery(DEP_GEO,0,r,1000,'*'),landslides:geoQuery(DEP_GEO,1,r,1000,'*'),quarries:geoQuery(DEP_GEO,3,r,1500,'*'),faults:geoQuery(DEP_GEO,6,r,500,'*'),
      soilMapping:geoQuery(DEP_GEO,11,r,0,'*'),bedrockAquifer:geoQuery(DEP_GEO,13,r,0,'*'),bedrockGeology:geoQuery(DEP_GEO,14,r,0,'*'),bedrockOutcrop:geoQuery(DEP_GEO,16,r,0,'*'),
      recharge:geoQuery(DEP_GEO,18,r,0,'*'),soleSourceAquifer:geoQuery(DEP_GEO,19,r,0,'*'),physiographicProvince:geoQuery(DEP_GEO,20,r,0,'*'),historicFill:geoQuery(DEP_GEO,22,r,0,'*'),
      surficialAquifer:geoQuery(DEP_GEO,23,r,0,'*'),surficialGeology:geoQuery(DEP_GEO,25,r,0,'*'),acidSoil:geoQuery(DEP_GEO,27,r,0,'*'),
      wellheadCommunity:geoQuery(DEP_HYDRO,25,r,0,'*'),wellheadNonCommunity:geoQuery(DEP_HYDRO,26,r,0,'*'),groundwaterTreatment:geoQuery(DEP_HYDRO,27,r,0,'*'),
      category1Water:geoQuery(DEP_HYDRO,6,r,500,'*'),floodPlan:geoQuery(DEP_HYDRO,28,r,0,'*'),floodProfile:geoQuery(DEP_HYDRO,29,r,500,'*'),surfaceSpring:geoQuery(DEP_HYDRO,34,r,1000,'*'),
      waterSourceArea:geoQuery(DEP_HYDRO,16,r,0,'*'),watershedHuc11:geoQuery(DEP_HYDRO,17,r,0,'*'),subwatershedHuc14:geoQuery(DEP_HYDRO,22,r,0,'*'),
      openSpace:geoQuery(DEP_LAND,65,r,0,'*'),openSpaceNearby:geoQuery(DEP_LAND,65,r,500,'*'),historicProperty:geoQuery(DEP_LAND,55,r,0,'*'),historicDistrict:geoQuery(DEP_LAND,57,r,0,'*'),
      archaeologicalGrid:geoQuery(DEP_LAND,56,r,0,'*'),wetlandMitigationBank:geoQuery(DEP_LAND,72,r,0,'*'),wetlandMitigationServiceArea:geoQuery(DEP_LAND,70,r,0,'*'),
      naturalAreaPreserve:geoQuery(DEP_LAND,80,r,0,'*'),wetlandsLoi:geoQuery(DEP_LAND,21,r,0,'*')
    };
    var names=Object.keys(q);
    cache[k]=Promise.all(names.map(function(name){return q[name].catch(function(error){return{features:[],unavailable:error.message};});})).then(function(values){
      var out={};names.forEach(function(name,i){out[name]=values[i];});return out;
    });
    return cache[k];
  }
  function featureRows(payload){return(payload&&payload.features||[]).map(function(f){return f.attributes||{};});}
  function normalizePermitNumber(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function permitLifecycleSummary(rawRows){
    var groups=Object.create(null),order=[],unmatchableIssued=[];
    (rawRows||[]).forEach(function(row){
      var pn=normalizePermitNumber(row&&row.permitno),st=clean(row&&row.status).toUpperCase();
      if(!pn){if(st==='P')unmatchableIssued.push(row);return;}
      if(!groups[pn]){groups[pn]=[];order.push(pn);}groups[pn].push(row);
    });
    var lifecycles=[];
    order.forEach(function(pn){
      var group=groups[pn],issued=group.filter(function(row){return clean(row&&row.status).toUpperCase()==='P';}),certified=group.filter(function(row){return clean(row&&row.status).toUpperCase()==='C'&&clean(row&&row.certdate);});
      if(!issued.length&&!certified.length)return;
      var permitDates=group.map(function(row){return clean(row&&row.permitdate);}).filter(Boolean).sort();
      var certDates=certified.map(function(row){return clean(row&&row.certdate);}).filter(Boolean).sort();
      var representative=certified[certified.length-1]||issued[issued.length-1]||group[0]||{};
      lifecycles.push({permitNumber:clean(representative.permitno)||pn,type:clean(representative.permittypedesc||representative.permittype)||'Permit activity',permitDate:permitDates[0]||'',certificateDate:certDates.length?certDates[certDates.length-1]:'',certified:certified.length>0,verification:certified.length===0&&issued.length>0});
    });
    lifecycles.sort(function(a,b){return clean(b.permitDate).localeCompare(clean(a.permitDate));});
    return{lifecycles:lifecycles,verification:lifecycles.filter(function(x){return x.verification;}).length+unmatchableIssued.length,unmatchableIssued:unmatchableIssued};
  }
  function permitHTML(p) {
    var list=p.rows||[],summary=permitLifecycleSummary(list),verify=summary.verification;
    var tone=verify?'review':list.length?'clear':'quiet';
    var detail=summary.lifecycles.slice(0,6).map(function(x){var state=x.verification?'Verify municipality':'Certificate shown';var when=x.certificateDate||x.permitDate;return'<li><span><b>'+safe(x.permitNumber||'Permit')+'</b><small>'+safe(x.type||'Permit activity')+'</small></span><span>'+safe(state)+'<small>'+date(when)+'</small></span></li>';}).join('');
    // content-architecture: dynamic — this summary is generated from live parcel-specific DCA permit lifecycle state and dates.
    return '<article class="dd-signal '+tone+'"><div class="dd-signal-head"><i class="fas fa-helmet-safety"></i><span><b>Permit &amp; certificate review</b><small>NJ DCA · block + lot match</small></span><strong>'+(verify?verify+' verify':list.length?'state history':'no records')+'</strong></div>'+
      '<p>'+(p.unavailable?safe(p.unavailable):verify?verify+' permit lifecycle'+(verify===1?' needs':'s need')+' municipal verification because the matching state rows do not currently show a certificate date, or cannot be safely joined by permit number. This is not a legal open-permit finding.':list.length?'No permit-number lifecycle currently lacks a certificate date in the matching state feed. Municipal records still control clearance.':'No matching record appears in DCA’s rolling permit feed; that does not prove no permit activity exists.')+'</p>'+
      (detail?'<ul class="dd-records">'+detail+'</ul>':'')+'</article>';
  }
  function envHTML(d) {
    var near=featureRows(d.contaminated), deeds=featureRows(d.deed), cea=featureRows(d.cea), tanks=featureRows(d.ust), tidelands=featureRows(d.tidelands), highlands=featureRows(d.highlands), pinelands=featureRows(d.pinelands);
    var hits=(deeds.length?1:0)+(cea.length?1:0)+(near.length?1:0)+(tanks.length?1:0)+(tidelands.length?1:0)+(highlands.length?1:0)+(pinelands.length?1:0),tone=(deeds.length||cea.length||tidelands.length)?'review':near.length?'watch':'clear';
    var nearList=near.slice(0,4).map(function(x){return'<li><span><b>'+safe(x.PI_NAME||'NJDEP site')+'</b><small>'+safe(x.ADDRESS||'Address not reported')+'</small></span><span>'+safe(x.STATUS||x.REMEDIAL_L||'listed')+'<small>PI '+safe(x.PI_NUMBER||'not reported')+'</small></span></li>';}).join('');
    return '<article class="dd-signal '+tone+'"><div class="dd-signal-head"><i class="fas fa-flask-vial"></i><span><b>Environmental controls &amp; proximity</b><small>NJDEP · live spatial check</small></span><strong>'+hits+' signal'+(hits===1?'':'s')+'</strong></div>'+
      '<div class="dd-pills"><span class="'+(deeds.length?'hit':'')+'">Deed notice '+(deeds.length?'found':'not found')+'</span><span class="'+(cea.length?'hit':'')+'">Groundwater CEA '+(cea.length?'found':'not found')+'</span><span class="'+(tidelands.length?'hit':'')+'">Tidelands reference '+(tidelands.length?'hit':'clear')+'</span><span class="'+(near.length?'hit':'')+'">Contaminated ≤500m: '+near.length+'</span><span class="'+(tanks.length?'hit':'')+'">UST ≤250m: '+tanks.length+'</span><span class="'+(highlands.length?'hit':'')+'">Highlands '+(highlands.length?'area':'no hit')+'</span><span class="'+(pinelands.length?'hit':'')+'">Pinelands '+(pinelands.length?'area':'no hit')+'</span></div>'+
      (deeds.length?'<p><b>Recorded environmental control:</b> NJDEP’s deed-notice polygon intersects the saved property point. Review the notice and restrictions; do not treat proximity alone as a boundary survey.</p>':'')+
      (tidelands.length?'<p><b>NJ-specific title review:</b> the saved property point intersects NJDEP’s statewide Tidelands reference layer. NJDEP cautions that only the actual promulgated 1:2400 Tidelands maps locate the legally valid riparian claim line, so this is a prompt for source-map/title review, not a claim determination.</p>':'')+
      (nearList?'<ul class="dd-records">'+nearList+'</ul>':'')+'</article>';
  }
  function constraintsHTML(d) {
    var flood=featureRows(d.flood),cafe=featureRows(d.cafe),wet=featureRows(d.wetlands),priority=featureRows(d.priorityWetlands);
    var count=(flood.length?1:0)+(cafe.length?1:0)+(wet.length?1:0)+(priority.length?1:0);
    var zones=flood.slice(0,3).map(function(x){return safe(x.FLD_ZONE||x.ZONE_SUBTY||'mapped area');}).filter(Boolean).join(', ');
    return '<article class="dd-signal '+(count?'review':'clear')+'"><div class="dd-signal-head"><i class="fas fa-water"></i><span><b>Flood, wetlands &amp; development preflight</b><small>NJDEP / FEMA · point intersection</small></span><strong>'+count+' layer'+(count===1?'':'s')+'</strong></div><div class="dd-pills">'+
      '<span class="'+(flood.length?'hit':'')+'">NFHL '+(flood.length?(zones||'hit'):'no hit')+'</span><span class="'+(cafe.length?'hit':'')+'">Tidal CAFE '+(cafe.length?'hit':'no hit')+'</span><span class="'+(wet.length?'hit':'')+'">2012 wetlands '+(wet.length?'hit':'no hit')+'</span><span class="'+(priority.length?'hit':'')+'">Priority wetlands '+(priority.length?'hit':'no hit')+'</span></div>'+
      (count?'<p><b>Development-constraint stack:</b> '+count+' screening layer'+(count===1?' intersects':'s intersect')+' the saved map point. Obtain the controlling determination before a lending, title, development or construction decision.</p>':'<p>No intersection was returned at the saved point from these four screening layers. That does not establish absence of flood or wetlands constraints.</p>')+
      '<p class="dd-micro">NJDEP’s 2012 wetlands layer and Flood Indicator layers are screening references. Regulatory mapping, field delineations and written rules control.</p></article>';
  }
  function institutionalHTML(d) {
    function n(name){return featureRows(d[name]).length;}
    var geo=['mines','landslides','quarries','faults','historicFill','acidSoil','bedrockOutcrop'].reduce(function(a,k){return a+(n(k)?1:0);},0);
    var water=['wellheadCommunity','wellheadNonCommunity','groundwaterTreatment','category1Water','floodPlan','floodProfile','surfaceSpring'].reduce(function(a,k){return a+(n(k)?1:0);},0);
    var land=['openSpace','historicProperty','historicDistrict','archaeologicalGrid','wetlandMitigationBank','wetlandMitigationServiceArea','naturalAreaPreserve','wetlandsLoi'].reduce(function(a,k){return a+(n(k)?1:0);},0);
    var aq=featureRows(d.bedrockAquifer)[0]||{},recharge=featureRows(d.recharge)[0]||{},province=featureRows(d.physiographicProvince)[0]||{};
    return '<article class="dd-signal '+(geo+water+land?'watch':'clear')+'"><div class="dd-signal-head"><i class="fas fa-layer-group"></i><span><b>Institutional site context</b><small>NJDEP geology + hydrography + land</small></span><strong>'+(geo+water+land)+' review flags</strong></div>'+
      '<div class="dd-pills"><span class="'+(geo?'hit':'')+'">Geology '+geo+'</span><span class="'+(water?'hit':'')+'">Water '+water+'</span><span class="'+(land?'hit':'')+'">Land / historic '+land+'</span></div>'+
      '<p><b>Mapped context:</b> '+safe(aq.GEONAME||aq.AQUIFER||'aquifer not labeled')+' · recharge '+safe(recharge.RANK||'not mapped')+' · '+safe(province.PROVINCE||province.NAME||'physiographic province not labeled')+'.</p>'+
      '<p class="dd-micro">These are screening flags from live statewide feature services. Open individual Data Center markers for source, tier, professional purpose and refresh rules.</p></article>';
  }
  function evidence(r,data) {
    var payload={generated_at:new Date().toISOString(),property:{address:r.address||'',municipality:r.municipality||r.town||'',county:r.county||'',pams_pin:r.pams_pin||'',block:r.block||'',lot:r.lot||''},findings:{permits:(data.permits&&data.permits.rows)||[],contaminated:featureRows(data.contaminated),deed_notices:featureRows(data.deed),groundwater_cea:featureRows(data.cea),ust:featureRows(data.ust),tidelands:featureRows(data.tidelands),highlands:featureRows(data.highlands),pinelands:featureRows(data.pinelands),nfhl:featureRows(data.flood),tidal_cafe:featureRows(data.cafe),wetlands_2012:featureRows(data.wetlands),priority_wetlands:featureRows(data.priorityWetlands)},disclaimer:'Screening evidence only; not a title, legal, environmental, survey, wetlands, flood or credit-eligibility opinion. Verify controlling source records.'};
    payload.findings.institutional_context={geology:{mines:featureRows(data.mines),landslides:featureRows(data.landslides),quarries:featureRows(data.quarries),faults:featureRows(data.faults),bedrock_aquifer:featureRows(data.bedrockAquifer),bedrock_geology:featureRows(data.bedrockGeology),recharge:featureRows(data.recharge),historic_fill:featureRows(data.historicFill),acid_soil:featureRows(data.acidSoil)},water:{wellhead_community:featureRows(data.wellheadCommunity),wellhead_noncommunity:featureRows(data.wellheadNonCommunity),source_area:featureRows(data.waterSourceArea),category1:featureRows(data.category1Water),flood_plan:featureRows(data.floodPlan),flood_profile:featureRows(data.floodProfile)},land:{open_space:featureRows(data.openSpace),historic_property:featureRows(data.historicProperty),historic_district:featureRows(data.historicDistrict),archaeological_grid:featureRows(data.archaeologicalGrid),wetland_mitigation_bank:featureRows(data.wetlandMitigationBank),natural_area_preserve:featureRows(data.naturalAreaPreserve),wetlands_loi:featureRows(data.wetlandsLoi)}};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='watchdog-closing-evidence-'+key(r)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function render(r,data) {
    var host=document.getElementById('dd-'+key(r));if(!host)return;
    records[key(r)]=r;evidenceRecords[key(r)]=data;
    host.innerHTML='<div class="dd-grid">'+permitHTML(data.permits)+envHTML(data)+constraintsHTML(data)+institutionalHTML(data)+'</div><div class="dd-caveat"><i class="fas fa-circle-info"></i><p><b>Due-diligence signal, not a title, environmental, legal, appraisal, insurance or credit-eligibility opinion.</b> DCA says its raw permit feed may be incomplete or contain errors. NJDEP layers are screening references and may be approximate. A “not found” result does not prove absence. Confirm flagged items with controlling municipal, NJDEP, FEMA, recorded or professional source records.</p></div><div class="dd-actions"><button class="dd-refresh" type="button" onclick="ddEvidence(\''+key(r)+'\')"><i class="fas fa-file-arrow-down"></i> Download Closing Evidence File</button></div><div class="dd-sources"><a href="https://data.nj.gov/Reference-Data/NJ-Construction-Permit-Data/w9se-dmra" target="_blank" rel="noopener">DCA permit source</a><a href="https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer" target="_blank" rel="noopener">NJDEP geology</a><a href="https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer" target="_blank" rel="noopener">NJDEP hydrography</a><a href="https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer" target="_blank" rel="noopener">NJDEP land</a></div>';
  }
  function load(r,force) {
    var k=key(r),host=document.getElementById('dd-'+k);if(!host)return;if(force)delete cache[k];
    host.innerHTML='<div class="dd-loading"><span class="pl-spin"></span><div><b>Checking current state sources</b><small>DCA permit records + NJDEP environmental layers</small></div></div>';
    inspect(r).then(function(data){render(r,data);}).catch(function(err){console.warn('Professional due diligence failed',err);host.innerHTML='<div class="dd-error"><i class="fas fa-triangle-exclamation"></i><div><b>Live state check unavailable</b><span>The saved property is unchanged. Try the source check again later.</span></div></div>';});
  }
  function tool(r) { var k=key(r);records[k]=r;setTimeout(function(){load(r,false);},0);return'<div class="dd-tool"><div class="dd-intro"><span class="dd-pro-badge">PRO DUE DILIGENCE</span><h3>Closing &amp; collateral preflight</h3><p>One property-level pass across state permit/certificate status and NJDEP environmental controls. Built for the questions attorneys, lenders, brokers and appraisers need to chase during property and collateral review.</p></div><div id="dd-'+k+'"></div><button class="dd-refresh" type="button" onclick="ddRefresh(\''+k+'\')"><i class="fas fa-rotate"></i> Recheck live sources</button></div>'; }
  function refresh(k){var r=records[k];if(r)load(r,true);}
  function inspectFresh(r){delete cache[key(r)];return inspect(r);}
  function downloadEvidence(k){var r=records[k],d=evidenceRecords[k];if(r&&d)evidence(r,d);}
  function portfolio(list){list=list||[];return'<section class="sec dd-portfolio"><h4><i class="fas fa-shield-halved"></i> Professional due diligence</h4><p class="dd-portfolio-lede">Open a property report for a live permit/certificate and NJDEP environmental preflight. The check runs against the parcel’s block/lot and saved map point.</p><div class="dd-portfolio-links">'+list.map(function(r){return'<a href="/property/home?pin='+encodeURIComponent(r.pams_pin||'')+'#sec-diligence"><span>'+safe(r.address||'Saved property')+'</span><i class="fas fa-arrow-right"></i></a>';}).join('')+'</div></section>';}
  Object.assign(window,{toolProfessionalDueDiligence:tool,toolDueDiligencePortfolio:portfolio,ddPermitRecords:permits,ddInspect:inspect,ddInspectFresh:inspectFresh,ddRefresh:refresh,ddEvidence:downloadEvidence});
})();
export {};

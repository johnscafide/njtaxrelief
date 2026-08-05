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
    cache[k]=Promise.all([
      permits(r),
      geoQuery(DEP_NJEMS,0,r,500,'PI_NAME,ADDRESS,PI_NUMBER,STATUS,REMEDIAL_L,DN_STATUS,CEA_STATUS'),
      geoQuery(DEP_ENV,40,r,0,'PREF_ID_NUM,PI_NAME,DN_NAME,ADDRESS,BLOCK_LOT,FILED_DATE,DESCRIPTION,CAP_TYPE,ACRES'),
      geoQuery(DEP_RSP,5,r,0,'*'),
      geoQuery(DEP_NJEMS,9,r,250,'*'),
      geoQuery(DEP_HYDRO,30,r,0,'*'),
      geoQuery(DEP_RSP,6,r,0,'*'),
      geoQuery(DEP_RSP,7,r,0,'*'),
      geoQuery(DEP_HYDRO,43,r,0,'*'), geoQuery(DEP_HYDRO,48,r,0,'*'),
      geoQuery(DEP_LAND_LU,2,r,0,'ACRES,LABEL12,TYPE12'), geoQuery(DEP_LAND,79,r,0,'*')
    ]).then(function(x){return{permits:x[0],contaminated:x[1],deed:x[2],cea:x[3],ust:x[4],tidelands:x[5],highlands:x[6],pinelands:x[7],flood:x[8],cafe:x[9],wetlands:x[10],priorityWetlands:x[11]};});
    return cache[k];
  }
  function featureRows(payload){return(payload&&payload.features||[]).map(function(f){return f.attributes||{};});}
  function permitHTML(p) {
    var list=p.rows||[], open=list.filter(function(x){return clean(x.status).toUpperCase()==='P';}), certified=list.filter(function(x){return clean(x.status).toUpperCase()==='C';});
    var tone=open.length?'review':list.length?'clear':'quiet';
    var detail=list.slice(0,6).map(function(x){return'<li><span><b>'+safe(x.permitno||'Permit')+'</b><small>'+safe(x.permittypedesc||'Permit activity')+'</small></span><span>'+safe(x.permitstatusdesc||x.status||'')+'<small>'+date(x.certdate||x.permitdate)+'</small></span></li>';}).join('');
    return '<article class="dd-signal '+tone+'"><div class="dd-signal-head"><i class="fas fa-helmet-safety"></i><span><b>Permit / certificate gap</b><small>NJ DCA · block + lot match</small></span><strong>'+(open.length?open.length+' review':list.length?'clear':'no records')+'</strong></div>'+
      '<p>'+(p.unavailable?safe(p.unavailable):open.length?open.length+' state record'+(open.length===1?' is':'s are')+' still reported as Permit Issued rather than Certificate Issued. Verify locally before closing or underwriting.':list.length?'No permit-issued-only record appears in the current state feed for this block and lot.':'No matching record appears in DCA’s rolling permit feed.')+'</p>'+
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
  function evidence(r,data) {
    var payload={generated_at:new Date().toISOString(),property:{address:r.address||'',municipality:r.municipality||r.town||'',county:r.county||'',pams_pin:r.pams_pin||'',block:r.block||'',lot:r.lot||''},findings:{permits:(data.permits&&data.permits.rows)||[],contaminated:featureRows(data.contaminated),deed_notices:featureRows(data.deed),groundwater_cea:featureRows(data.cea),ust:featureRows(data.ust),tidelands:featureRows(data.tidelands),highlands:featureRows(data.highlands),pinelands:featureRows(data.pinelands),nfhl:featureRows(data.flood),tidal_cafe:featureRows(data.cafe),wetlands_2012:featureRows(data.wetlands),priority_wetlands:featureRows(data.priorityWetlands)},disclaimer:'Screening evidence only; not a title, legal, environmental, survey, wetlands, flood or credit-eligibility opinion. Verify controlling source records.'};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='watchdog-closing-evidence-'+key(r)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function render(r,data) {
    var host=document.getElementById('dd-'+key(r));if(!host)return;
    records[key(r)]=r;evidenceRecords[key(r)]=data;
    host.innerHTML='<div class="dd-grid">'+permitHTML(data.permits)+envHTML(data)+constraintsHTML(data)+'</div><div class="dd-caveat"><i class="fas fa-circle-info"></i><p><b>Due-diligence signal, not a title, environmental, legal or credit-eligibility opinion.</b> DCA says its raw permit feed may be incomplete or contain errors. NJDEP layers are screening references and may be approximate. A “not found” result does not prove absence. Confirm flagged items with controlling municipal, NJDEP, FEMA, recorded or professional source records.</p></div><div class="dd-actions"><button class="dd-refresh" type="button" onclick="ddEvidence(\''+key(r)+'\')"><i class="fas fa-file-arrow-down"></i> Download Closing Evidence File</button></div><div class="dd-sources"><a href="https://data.nj.gov/Reference-Data/NJ-Construction-Permit-Data/w9se-dmra" target="_blank" rel="noopener">DCA permit source</a><a href="https://dep.nj.gov/climatechange/flood-tool/" target="_blank" rel="noopener">NJ Flood Indicator Tool</a><a href="https://dep.nj.gov/gis/nj-geoweb-profiles/" target="_blank" rel="noopener">NJDEP GeoWeb profiles</a></div>';
  }
  function load(r,force) {
    var k=key(r),host=document.getElementById('dd-'+k);if(!host)return;if(force)delete cache[k];
    host.innerHTML='<div class="dd-loading"><span class="pl-spin"></span><div><b>Checking current state sources</b><small>DCA permit records + NJDEP environmental layers</small></div></div>';
    inspect(r).then(function(data){render(r,data);}).catch(function(err){console.warn('Professional due diligence failed',err);host.innerHTML='<div class="dd-error"><i class="fas fa-triangle-exclamation"></i><div><b>Live state check unavailable</b><span>The saved property is unchanged. Try the source check again later.</span></div></div>';});
  }
  function tool(r) { var k=key(r);records[k]=r;setTimeout(function(){load(r,false);},0);return'<div class="dd-tool"><div class="dd-intro"><span class="dd-pro-badge">PRO DUE DILIGENCE</span><h3>Closing &amp; collateral preflight</h3><p>One property-level pass across state permit/certificate status and NJDEP environmental controls. Built for the questions attorneys, lenders, brokers and appraisers need to chase during property and collateral review.</p></div><div id="dd-'+k+'"></div><button class="dd-refresh" type="button" onclick="ddRefresh(\''+k+'\')"><i class="fas fa-rotate"></i> Recheck live sources</button></div>'; }
  function refresh(k){var r=records[k];if(r)load(r,true);}
  function downloadEvidence(k){var r=records[k],d=evidenceRecords[k];if(r&&d)evidence(r,d);}
  function portfolio(list){list=list||[];return'<section class="sec dd-portfolio"><h4><i class="fas fa-shield-halved"></i> Professional due diligence</h4><p class="dd-portfolio-lede">Open a property report for a live permit/certificate and NJDEP environmental preflight. The check runs against the parcel’s block/lot and saved map point.</p><div class="dd-portfolio-links">'+list.map(function(r){return'<a href="/property/home.html?pin='+encodeURIComponent(r.pams_pin||'')+'#sec-diligence"><span>'+safe(r.address||'Saved property')+'</span><i class="fas fa-arrow-right"></i></a>';}).join('')+'</div></section>';}
  Object.assign(window,{toolProfessionalDueDiligence:tool,toolDueDiligencePortfolio:portfolio,ddPermitRecords:permits,ddInspect:inspect,ddRefresh:refresh,ddEvidence:downloadEvidence});
})();
export {};

/* Watchdog Evidence Graph v2 · sourced property research, never a title opinion. */
(function(){
  'use strict';
  var records=Object.create(null), payloads=Object.create(null);
  function key(r){return String((r&&(r.pams_pin||r.id))||'property').replace(/[^a-z0-9]/gi,'');}
  function s(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function rows(x){return(x&&x.features||[]).map(function(f){return f.attributes||{};});}
  function num(v){v=+v;return isFinite(v)?v:0;}
  function statusNode(icon,title,state,tone,detail,source){
    return '<article class="teg-node '+tone+'"><div class="teg-node-top"><span class="teg-node-icon"><i class="fas '+icon+'"></i></span><div><b>'+s(title)+'</b><small>'+s(state)+'</small></div></div><p>'+s(detail)+'</p>'+(source?'<a href="'+s(source.url)+'" target="_blank" rel="noopener">'+s(source.label)+' <i class="fas fa-arrow-up-right-from-square"></i></a>':'')+'</article>';
  }
  function build(r,d){
    var permits=(d.permits&&d.permits.rows)||[], openPermits=permits.filter(function(x){return String(x.status||'').toUpperCase()==='P';});
    var deed=rows(d.deed), cea=rows(d.cea), tidelands=rows(d.tidelands), contaminated=rows(d.contaminated), ust=rows(d.ust);
    var flood=rows(d.flood), wetlands=rows(d.wetlands), priority=rows(d.priorityWetlands), highlands=rows(d.highlands), pinelands=rows(d.pinelands);
    var parcelComplete=!!(r.pams_pin&&(r.block||String(r.pams_pin).split('_')[1])&&(r.lot||String(r.pams_pin).split('_')[2]));
    var assessed=num(r.assessed||r.net_value), tax=num(r.last_year_tax||r.tax), sale=num(r.sale_price||r.sale);
    var envFlags=deed.length+cea.length+tidelands.length+(contaminated.length?1:0)+(ust.length?1:0);
    var landFlags=(flood.length?1:0)+(wetlands.length?1:0)+(priority.length?1:0)+(highlands.length?1:0)+(pinelands.length?1:0);
    var sourceGroups=[parcelComplete,!!(assessed||tax),true,!d.permits.unavailable,!d.deed.unavailable,!d.flood.unavailable];
    var coverage=Math.round(sourceGroups.filter(Boolean).length/sourceGroups.length*100);
    var review=(openPermits.length?1:0)+(deed.length?1:0)+(cea.length?1:0)+(tidelands.length?1:0)+(flood.length?1:0)+(wetlands.length?1:0);
    var nodes=[
      statusNode('fa-location-dot','Parcel identity',parcelComplete?'Parcel key matched':'Identity needs review',parcelComplete?'ok':'review',parcelComplete?'PAMS PIN and block/lot are present for cross-source matching.':'Block/lot or PAMS identity is incomplete; downstream matches require extra care.',{label:'NJGIN parcel service',url:'https://njogis-newjersey.opendata.arcgis.com/'}),
      statusNode('fa-building-columns','Assessment & tax',assessed||tax?'State record present':'Value unavailable',assessed||tax?'ok':'quiet',(assessed?'Assessment $'+Math.round(assessed).toLocaleString()+'. ':'')+(tax?'Last published tax $'+Math.round(tax).toLocaleString()+'.':'No current tax value in this record.'),{label:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/localtax.shtml'}),
      statusNode('fa-stamp','Sale / deed evidence',sale?'Sale reference present':'No sale value in current row',sale?'ok':'quiet',sale?'A recorded sale value is attached to the current property record; recorded instrument research still controls chain of title.':'Watchdog has no sale value in this row. That is not a finding about ownership or recorded instruments.',{label:'NJ County recording offices',url:'https://www.nj.gov/state/archives/catcounty.html'}),
      statusNode('fa-helmet-safety','Permits & certificates',openPermits.length?openPermits.length+' issued-only record'+(openPermits.length===1?'':'s'):(permits.length?'State feed checked':'No state permit match'),openPermits.length?'review':permits.length?'ok':'quiet',openPermits.length?'At least one DCA record is still reported as permit-issued rather than certificate-issued. Verify status with the municipality.':permits.length?'No permit-issued-only row appears in the current DCA match.':'No matching DCA record was returned; absence in the feed is not proof no work occurred.',{label:'NJ DCA permit data',url:'https://data.nj.gov/Reference-Data/NJ-Construction-Permit-Data/w9se-dmra'}),
      statusNode('fa-file-shield','Environmental controls',envFlags?envFlags+' mapped signal'+(envFlags===1?'':'s'):'No mapped signal returned',envFlags?'review':'ok',envFlags?'A deed notice, groundwater control, tidelands reference or nearby remediation/tank signal deserves source-document review.':'Current live screening layers returned no mapped control signal at/near the saved point. This is not an environmental clearance.',{label:'NJDEP DataMiner / GIS',url:'https://dep.nj.gov/gis/'}),
      statusNode('fa-water','Land, flood & jurisdiction',landFlags?landFlags+' screening layer'+(landFlags===1?'':'s'):'No screening intersection',landFlags?'watch':'ok',landFlags?'Flood, wetlands, Highlands or Pinelands context intersects the saved point in at least one screening layer.':'No intersection returned from the current screening pass. Boundary determinations and controlling maps still govern.',{label:'NJDEP GIS',url:'https://dep.nj.gov/gis/'})
    ];
    var summary='<div class="teg-summary"><div><span>Research completeness</span><b>'+coverage+'%</b><small>sources checked, not title quality</small></div><div><span>Review prompts</span><b>'+review+'</b><small>items worth source-document review</small></div><div><span>Parcel match</span><b>'+(parcelComplete?'Matched':'Review')+'</b><small>'+s(r.pams_pin||'PAMS key unavailable')+'</small></div></div>';
    var center='<div class="teg-center"><span>Watchdog Evidence Graph</span><b>'+s(r.address||'Saved property')+'</b><small>'+s(r.town||r.municipality||'New Jersey')+'</small></div>';
    var generatedAt=new Date().toISOString();
    payloads[key(r)]={coverage:coverage,review:review,nodes:nodes.length,generated_at:generatedAt,pams_pin:r.pams_pin||null,version:2};
    return summary+'<div class="teg-map">'+center+'<div class="teg-nodes">'+nodes.join('')+'</div></div>'+
      '<div class="teg-fresh"><i class="fas fa-clock-rotate-left"></i><div><b>Evidence checked '+s(new Date(generatedAt).toLocaleString())+'</b><span>Save the property to a Workbench case to preserve a dated working snapshot, then use Change Intelligence to see later source and score movement.</span></div></div>'+
      '<div class="teg-next"><i class="fas fa-scale-balanced"></i><div><b>What this graph does — and does not do</b><p>It connects the public evidence Watchdog can source to one parcel so a professional can see what to verify next. It does <strong>not</strong> establish ownership, lien priority, marketable title, insurability, survey boundaries, environmental compliance or legal clearance. Recorded instruments, municipal searches and qualified professionals control those conclusions.</p></div></div>'+
      '<div class="teg-actions"><button type="button" onclick="tegRefresh(\''+key(r)+'\')"><i class="fas fa-rotate"></i> Refresh evidence graph</button><button type="button" onclick="ddEvidence(\''+key(r)+'\')"><i class="fas fa-file-arrow-down"></i> Download source evidence</button><a href="/property/workbench"><i class="fas fa-folder-tree"></i> Open Case Workbench</a></div>';
  }
  function render(r,force){
    var k=key(r),host=document.getElementById('teg-'+k);if(!host)return;
    if(typeof window.ddInspect!=='function'){host.innerHTML='<div class="teg-error">Evidence source engine is not available. Close and reopen this section.</div>';return;}
    host.innerHTML='<div class="teg-loading"><span class="pl-spin"></span><div><b>Connecting the evidence graph</b><small>Parcel identity · DCA permits · NJDEP constraints · source provenance</small></div></div>';
    var inspect=force&&typeof window.ddInspectFresh==='function'?window.ddInspectFresh:window.ddInspect;
    inspect(r).then(function(d){host.innerHTML=build(r,d);}).catch(function(e){console.warn('Title Evidence Graph',e);host.innerHTML='<div class="teg-error">Live evidence sources did not answer. The saved property has not been changed.</div>';});
  }
  function tool(r){var k=key(r);records[k]=r;setTimeout(function(){render(r,false);},0);return '<section class="teg-tool"><div class="teg-intro"><span class="teg-badge">PRO+ · EVIDENCE GRAPH 2.0</span><h3>Title &amp; closing evidence graph</h3><p>One property-centered view of the public records that can change a closing conversation, now connected to dated case snapshots and Change Intelligence history.</p></div><div id="teg-'+k+'"></div></section>';}
  function refresh(k){var r=records[k];if(r)render(r,true);}
  Object.assign(window,{toolTitleEvidenceGraph:tool,tegRefresh:refresh});
})();
export {};

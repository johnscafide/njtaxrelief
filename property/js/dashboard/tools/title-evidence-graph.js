/* Watchdog Evidence Graph v3 · sourced property research, never a title opinion. */
(function(){
  'use strict';
  var DCA='https://data.nj.gov/resource/w9se-dmra.json';
  var DCA_SOURCE='https://data.nj.gov/Reference-Data/NJ-Construction-Permit-Data/w9se-dmra';
  var records=Object.create(null),payloads=Object.create(null),permitCache=Object.create(null);
  function key(r){return String((r&&(r.pams_pin||r.id))||'property').replace(/[^a-z0-9]/gi,'');}
  function clean(v){return String(v==null?'':v).trim();}
  function s(v){return clean(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function rows(x){return(x&&x.features||[]).map(function(f){return f.attributes||{};});}
  function num(v){v=+v;return isFinite(v)?v:0;}
  function fmtDate(v){if(!v)return'Not shown';var d=new Date(v);return isNaN(d)?clean(v):d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
  function normalizePermitNumber(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function sourceLink(source){
    if(!source)return'';
    if(String(source.url||'').charAt(0)==='#')return'<a href="'+s(source.url)+'">'+s(source.label)+' <i class="fas fa-arrow-down"></i></a>';
    return'<a href="'+s(source.url)+'" target="_blank" rel="noopener">'+s(source.label)+' <i class="fas fa-arrow-up-right-from-square"></i></a>';
  }
  function statusNode(icon,title,state,tone,detail,source){
    return '<article class="teg-node '+tone+'"><div class="teg-node-top"><span class="teg-node-icon"><i class="fas '+icon+'"></i></span><div><b>'+s(title)+'</b><small>'+s(state)+'</small></div></div><p>'+s(detail)+'</p>'+sourceLink(source)+'</article>';
  }
  function propertyIdentity(r,d){
    var fromInspect=d&&d.permits&&d.permits.id||{},pin=clean(r&&r.pams_pin),parts=pin.split('_');
    return{
      code:clean(fromInspect.code||r.treasurycode||r.treasury_code||r.mun_code||parts[0]||'').padStart(4,'0'),
      block:clean(fromInspect.block||r.block||parts[1]||''),
      lot:clean(fromInspect.lot||r.lot||parts[2]||'').split(' ')[0]
    };
  }
  function fullPermitRows(r,d,force){
    var id=propertyIdentity(r,d),fallback=(d&&d.permits&&d.permits.rows)||[];
    if(!id.code||!id.block||!id.lot)return Promise.resolve({rows:fallback,id:id,checked_at:new Date().toISOString(),full:false,unavailable:'Block/lot identity is incomplete.'});
    var ck=[id.code,id.block,id.lot].join('|');
    if(!force&&permitCache[ck])return permitCache[ck];
    var q=new URLSearchParams({treasurycode:id.code,block:id.block,lot:id.lot,'$limit':'500','$order':'permitdate DESC'});
    var p=fetch(DCA+'?'+q.toString(),{credentials:'omit'}).then(function(res){if(!res.ok)throw Error('HTTP '+res.status);return res.json();}).then(function(data){
      return{rows:Array.isArray(data)?data:[],id:id,checked_at:new Date().toISOString(),full:true};
    }).catch(function(error){
      return{rows:fallback,id:id,checked_at:new Date().toISOString(),full:false,unavailable:'Complete state-row details could not be loaded. Showing the fields already returned by the live evidence check.',error:clean(error&&error.message)};
    });
    permitCache[ck]=p;return p;
  }
  function lifecycleSummary(rawRows){
    var groups=Object.create(null),order=[],unmatchableIssued=[];
    (rawRows||[]).forEach(function(row){
      var pn=normalizePermitNumber(row&&row.permitno),st=clean(row&&row.status).toUpperCase();
      if(!pn){if(st==='P')unmatchableIssued.push(row);return;}
      if(!groups[pn]){groups[pn]=[];order.push(pn);}groups[pn].push(row);
    });
    var lifecycles=[];
    order.forEach(function(pn){
      var group=groups[pn],stateRows=group.filter(function(row){var st=clean(row&&row.status).toUpperCase();return st==='P'||st==='C';});
      if(!stateRows.length)return;
      var certified=group.filter(function(row){return clean(row&&row.status).toUpperCase()==='C'&&clean(row&&row.certdate);});
      var issued=group.filter(function(row){return clean(row&&row.status).toUpperCase()==='P';});
      var permitDates=group.map(function(row){return clean(row&&row.permitdate);}).filter(Boolean).sort();
      var certDates=certified.map(function(row){return clean(row&&row.certdate);}).filter(Boolean).sort();
      var representative=certified[certified.length-1]||issued[issued.length-1]||group[0]||{};
      lifecycles.push({
        permitNumber:clean(representative.permitno)||pn,
        rows:group,
        certified:certified.length>0,
        verificationCandidate:certified.length===0&&issued.length>0,
        permitDate:permitDates.length?permitDates[0]:'',
        certificateDate:certDates.length?certDates[certDates.length-1]:'',
        type:clean(representative.permittypedesc||representative.permittype)||'Permit activity',
        stateDescription:clean(representative.permitstatusdesc)||clean(representative.status)||'State record',
        municipality:clean(representative.muniname),
        recordId:clean(representative.recordid)
      });
    });
    lifecycles.sort(function(a,b){return clean(b.permitDate).localeCompare(clean(a.permitDate));});
    return{
      lifecycles:lifecycles,
      certified:lifecycles.filter(function(x){return x.certified;}).length,
      verificationCandidates:lifecycles.filter(function(x){return x.verificationCandidate;}).length,
      unmatchableIssued:unmatchableIssued
    };
  }
  function fieldLabel(k){
    var labels={treasurycode:'Treasury code',muniname:'Municipality',recordid:'Record ID',permitno:'Permit number',permitdate:'Permit date',certdate:'Certificate date',permittype:'Permit type code',permittypedesc:'Permit type',permitstatusdesc:'Permit status',status:'Status',block:'Block',lot:'Lot',county:'County'};
    if(labels[k])return labels[k];
    return clean(k).replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
  }
  function fieldValue(k,v){if(/date$/i.test(k)||/date/i.test(k))return fmtDate(v);return clean(v);}
  function rowDetails(row,index){
    var preferred=['permitno','permittypedesc','permitstatusdesc','status','permitdate','certdate','recordid','treasurycode','muniname','county','block','lot','permittype'];
    var keys=Object.keys(row||{}).filter(function(k){return row[k]!==null&&row[k]!==undefined&&clean(row[k])!=='';});
    keys.sort(function(a,b){var ai=preferred.indexOf(a),bi=preferred.indexOf(b);if(ai<0)ai=999;if(bi<0)bi=999;return ai===bi?a.localeCompare(b):ai-bi;});
    return'<div class="teg-source-row"><div class="teg-source-row-title">State row '+(index+1)+'</div><dl class="teg-source-grid">'+keys.map(function(k){return'<div><dt>'+s(fieldLabel(k))+'</dt><dd>'+s(fieldValue(k,row[k]))+'</dd></div>';}).join('')+'</dl></div>';
  }
  function permitCard(item){
    var tone=item.verificationCandidate?'review':item.certified?'ok':'quiet';
    var state=item.verificationCandidate?'Verify with municipality':item.certified?'Certificate shown in state feed':'Review state record';
    var explanation=item.verificationCandidate?'NJ DCA currently reports a permit-issued lifecycle for this permit number without a certificate date in the matching state rows. This is a preliminary verification prompt, not a legal determination that the permit is open.':item.certified?'A certificate date is present in the matching NJ DCA lifecycle. Confirm locally when the transaction requires municipal clearance.':'Watchdog found a state permit lifecycle that does not fit the standard permit/certificate states. Review the source row and confirm locally if material.';
    return'<article class="teg-permit-card '+tone+'"><div class="teg-permit-card-head"><div><span class="teg-permit-number">Permit '+s(item.permitNumber)+'</span><b>'+s(item.type)+'</b></div><strong class="teg-permit-status">'+s(state)+'</strong></div><div class="teg-permit-meta"><div><span>Permit issued</span><b>'+s(fmtDate(item.permitDate))+'</b></div><div><span>Certificate</span><b>'+s(item.certificateDate?fmtDate(item.certificateDate):'Not shown')+'</b></div><div><span>State status</span><b>'+s(item.stateDescription)+'</b></div><div><span>Municipality</span><b>'+s(item.municipality||'Matched parcel municipality')+'</b></div></div><p>'+s(explanation)+'</p><details><summary>View complete state record'+(item.rows.length>1?'s':'')+' <span>'+item.rows.length+' row'+(item.rows.length===1?'':'s')+'</span></summary><div class="teg-source-rows">'+item.rows.map(rowDetails).join('')+'</div></details></article>';
  }
  function permitPanel(r,permitData,summary){
    var id=permitData.id||{},items=summary.lifecycles,verify=summary.verificationCandidates+summary.unmatchableIssued.length;
    var lede=verify?verify+' permit lifecycle'+(verify===1?' needs':'s need')+' municipal verification based on the matching state feed. Review the records below before calling the municipality.':items.length?'Watchdog matched '+items.length+' permit lifecycle'+(items.length===1?'':'s')+'. No permit-number lifecycle currently lacks a certificate date in the state feed.':'No matching permit row was returned by the NJ DCA feed for this parcel. That does not prove no permit activity exists.';
    var first=items.slice(0,8),older=items.slice(8),unmatchable=summary.unmatchableIssued;
    var extra=unmatchable.length?'<div class="teg-unmatched"><b>'+unmatchable.length+' issued state row'+(unmatchable.length===1?'':'s')+' without a usable permit number</b><p>These rows cannot be safely joined into a permit-number lifecycle, so Watchdog flags them for municipal verification rather than treating them as open permits.</p><details><summary>View unmatched state row'+(unmatchable.length===1?'':'s')+'</summary><div class="teg-source-rows">'+unmatchable.map(rowDetails).join('')+'</div></details></div>':'';
    return'<section class="teg-permits" id="teg-permits-'+key(r)+'"><div class="teg-permit-head"><div><span>STATE PERMIT HISTORY · PRELIMINARY MUNICIPAL REVIEW</span><h4>Permit &amp; certificate history</h4></div><strong>'+s(verify?verify+' to verify':items.length?'State history checked':'No state match')+'</strong></div><p class="teg-permit-lede">'+s(lede)+'</p><div class="teg-permit-stats"><div><span>Matched lifecycles</span><b>'+items.length+'</b></div><div><span>Certificate shown</span><b>'+summary.certified+'</b></div><div><span>Verify municipality</span><b>'+verify+'</b></div><div><span>DCA rows</span><b>'+permitData.rows.length+'</b></div></div><div class="teg-permit-list">'+first.map(permitCard).join('')+(older.length?'<details class="teg-permit-more"><summary>Show '+older.length+' older permit lifecycle'+(older.length===1?'':'s')+'</summary><div class="teg-permit-list teg-permit-list-nested">'+older.map(permitCard).join('')+'</div></details>':'')+extra+'</div><div class="teg-permit-source"><div><b>NJ DCA checked</b><span>'+s(new Date(permitData.checked_at).toLocaleString())+'</span></div><div><b>Parcel match</b><span>Treasury '+s(id.code||'—')+' · Block '+s(id.block||'—')+' · Lot '+s(id.lot||'—')+'</span></div><a href="'+DCA_SOURCE+'" target="_blank" rel="noopener">Open official NJ DCA source <i class="fas fa-arrow-up-right-from-square"></i></a></div>'+(permitData.full?'':'<div class="teg-permit-data-note"><i class="fas fa-circle-info"></i><span>'+s(permitData.unavailable||'Complete row details were not available during this check.')+'</span></div>')+'<div class="teg-permit-caveat"><i class="fas fa-building-shield"></i><p><b>Preliminary state screening, not municipal clearance.</b> Watchdog shows matching records currently reported to NJ DCA. Municipal construction records remain authoritative and may contain newer, older, corrected or additional information. The state feed is rolling, generally monthly, does not include every municipality, recent records may still be under review, and older records are eventually purged.</p></div></section>';
  }
  function build(r,d,permitData){
    var permitSummary=lifecycleSummary(permitData.rows),permitReview=permitSummary.verificationCandidates+permitSummary.unmatchableIssued.length;
    var deed=rows(d.deed),cea=rows(d.cea),tidelands=rows(d.tidelands),contaminated=rows(d.contaminated),ust=rows(d.ust);
    var flood=rows(d.flood),wetlands=rows(d.wetlands),priority=rows(d.priorityWetlands),highlands=rows(d.highlands),pinelands=rows(d.pinelands);
    var parcelComplete=!!(r.pams_pin&&(r.block||String(r.pams_pin).split('_')[1])&&(r.lot||String(r.pams_pin).split('_')[2]));
    var assessed=num(r.assessed||r.net_value),tax=num(r.last_year_tax||r.tax),sale=num(r.sale_price||r.sale);
    var envFlags=deed.length+cea.length+tidelands.length+(contaminated.length?1:0)+(ust.length?1:0);
    var landFlags=(flood.length?1:0)+(wetlands.length?1:0)+(priority.length?1:0)+(highlands.length?1:0)+(pinelands.length?1:0);
    var sourceGroups=[parcelComplete,!!(assessed||tax),true,!d.permits.unavailable,!d.deed.unavailable,!d.flood.unavailable];
    var coverage=Math.round(sourceGroups.filter(Boolean).length/sourceGroups.length*100);
    var review=(permitReview?1:0)+(deed.length?1:0)+(cea.length?1:0)+(tidelands.length?1:0)+(flood.length?1:0)+(wetlands.length?1:0);
    var permitState=permitReview?permitReview+' need'+(permitReview===1?'s':'')+' municipal verification':permitSummary.lifecycles.length?'State history ready':'No state permit match';
    var permitDetail=permitReview?'Watchdog found permit lifecycle evidence that deserves municipal confirmation. Review the matching state records below; this is not a legal open-permit determination.':permitSummary.lifecycles.length?'Matching NJ DCA permit/certificate history is available below, including permit dates, certificate dates and source-row details.':'No matching DCA row was returned; absence in the state feed is not proof that no work occurred.';
    var nodes=[
      statusNode('fa-location-dot','Parcel identity',parcelComplete?'Parcel key matched':'Identity needs review',parcelComplete?'ok':'review',parcelComplete?'PAMS PIN and block/lot are present for cross-source matching.':'Block/lot or PAMS identity is incomplete; downstream matches require extra care.',{label:'NJGIN parcel service',url:'https://njogis-newjersey.opendata.arcgis.com/'}),
      statusNode('fa-building-columns','Assessment & tax',assessed||tax?'State record present':'Value unavailable',assessed||tax?'ok':'quiet',(assessed?'Assessment $'+Math.round(assessed).toLocaleString()+'. ':'')+(tax?'Last published tax $'+Math.round(tax).toLocaleString()+'.':'No current tax value in this record.'),{label:'NJ Division of Taxation',url:'https://www.nj.gov/treasury/taxation/lpt/localtax.shtml'}),
      statusNode('fa-stamp','Sale / deed evidence',sale?'Sale reference present':'No sale value in current row',sale?'ok':'quiet',sale?'A recorded sale value is attached to the current property record; recorded instrument research still controls chain of title.':'Watchdog has no sale value in this row. That is not a finding about ownership or recorded instruments.',{label:'NJ County recording offices',url:'https://www.nj.gov/state/archives/catcounty.html'}),
      statusNode('fa-helmet-safety','Permits & certificates',permitState,permitReview?'review':permitSummary.lifecycles.length?'ok':'quiet',permitDetail,{label:'Review permit history',url:'#teg-permits-'+key(r)}),
      statusNode('fa-file-shield','Environmental controls',envFlags?envFlags+' mapped signal'+(envFlags===1?'':'s'):'No mapped signal returned',envFlags?'review':'ok',envFlags?'A deed notice, groundwater control, tidelands reference or nearby remediation/tank signal deserves source-document review.':'Current live screening layers returned no mapped control signal at/near the saved point. This is not an environmental clearance.',{label:'NJDEP DataMiner / GIS',url:'https://dep.nj.gov/gis/'}),
      statusNode('fa-water','Land, flood & jurisdiction',landFlags?landFlags+' screening layer'+(landFlags===1?'':'s'):'No screening intersection',landFlags?'watch':'ok',landFlags?'Flood, wetlands, Highlands or Pinelands context intersects the saved point in at least one screening layer.':'No intersection returned from the current screening pass. Boundary determinations and controlling maps still govern.',{label:'NJDEP GIS',url:'https://dep.nj.gov/gis/'})
    ];
    var summary='<div class="teg-summary"><div><span>Research completeness</span><b>'+coverage+'%</b><small>sources checked, not title quality</small></div><div><span>Review prompts</span><b>'+review+'</b><small>items worth source-document review</small></div><div><span>Parcel match</span><b>'+(parcelComplete?'Matched':'Review')+'</b><small>'+s(r.pams_pin||'PAMS key unavailable')+'</small></div></div>';
    var center='<div class="teg-center"><span>Watchdog Evidence Graph</span><b>'+s(r.address||'Saved property')+'</b><small>'+s(r.town||r.municipality||'New Jersey')+'</small></div>';
    var generatedAt=new Date().toISOString();
    payloads[key(r)]={coverage:coverage,review:review,nodes:nodes.length,generated_at:generatedAt,pams_pin:r.pams_pin||null,version:3,permit_lifecycles:permitSummary.lifecycles.length,permit_verification_candidates:permitReview};
    return summary+'<div class="teg-map">'+center+'<div class="teg-nodes">'+nodes.join('')+'</div></div>'+permitPanel(r,permitData,permitSummary)+
      '<div class="teg-fresh"><i class="fas fa-clock-rotate-left"></i><div><b>Evidence checked '+s(new Date(generatedAt).toLocaleString())+'</b><span>Save the property to a Workbench case to preserve a dated working snapshot, then use Change Intelligence to see later source and score movement.</span></div></div>'+ 
      '<div class="teg-next"><i class="fas fa-scale-balanced"></i><div><b>What this graph does — and does not do</b><p>It connects the public evidence Watchdog can source to one parcel so a professional can see what to verify next. It does <strong>not</strong> establish ownership, lien priority, marketable title, insurability, survey boundaries, environmental compliance, municipal permit clearance or legal clearance. Recorded instruments, municipal searches and qualified professionals control those conclusions.</p></div></div>'+ 
      '<div class="teg-actions"><button type="button" onclick="tegRefresh(\''+key(r)+'\')"><i class="fas fa-rotate"></i> Refresh evidence graph</button><button type="button" onclick="ddEvidence(\''+key(r)+'\')"><i class="fas fa-file-arrow-down"></i> Download source evidence</button><a href="/property/workbench"><i class="fas fa-folder-tree"></i> Open Case Workbench</a></div>';
  }
  function render(r,force){
    var k=key(r),host=document.getElementById('teg-'+k);if(!host)return;
    if(typeof window.ddInspect!=='function'){host.innerHTML='<div class="teg-error">Evidence source engine is not available. Close and reopen this section.</div>';return;}
    host.innerHTML='<div class="teg-loading"><span class="pl-spin"></span><div><b>Connecting the evidence graph</b><small>Parcel identity · DCA permits · NJDEP constraints · source provenance</small></div></div>';
    var inspect=force&&typeof window.ddInspectFresh==='function'?window.ddInspectFresh:window.ddInspect;
    inspect(r).then(function(d){return fullPermitRows(r,d,force).then(function(permitData){host.innerHTML=build(r,d,permitData);});}).catch(function(e){console.warn('Title Evidence Graph',e);host.innerHTML='<div class="teg-error">Live evidence sources did not answer. The saved property has not been changed.</div>';});
  }
  function tool(r){var k=key(r);records[k]=r;setTimeout(function(){render(r,false);},0);return '<section class="teg-tool"><div class="teg-intro"><span class="teg-badge">PRO+ · EVIDENCE GRAPH 3.0</span><h3>Title &amp; closing evidence graph</h3><p>One property-centered view of the public records that can change a closing conversation, including plain-language permit and certificate history before municipal follow-up.</p></div><div id="teg-'+k+'"></div></section>';}
  function refresh(k){var r=records[k];if(r)render(r,true);}
  Object.assign(window,{toolTitleEvidenceGraph:tool,tegRefresh:refresh});
})();
export {};

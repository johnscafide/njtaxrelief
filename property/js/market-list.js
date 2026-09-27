/* Watchdog agent farm list (/market-list?id=...).
   Board design. Loads the farm from the saved list criteria, then layers on:
   - farm-workspace: last deed year, "tax bill goes elsewhere" flag, postal city
     and the agent's own CRM matches (verified links only, no email or phone).
   - A CSV from any other database, matched in the browser and kept on this device.
   - A Watchdog Intelligence brief built from the loaded rows, plus Ask.
   - Mailing labels (Avery 5160 / 5163), mail-merge and CRM downloads.
   New Jersey withholds owner names from its public parcel data, so owner names
   only appear when they come from the agent's own CRM or file. */
(()=>{'use strict';
const qs=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(v===null||v===undefined||v==='')?'—':'$'+Math.round(Number(v)||0).toLocaleString();
const safe=(e,c)=>window.WatchdogAgentSafety?window.WatchdogAgentSafety.friendlyError(e,c):'Watchdog could not complete that request. Please try again.';
const W=window.WatchdogAgentWorkspace,route=W&&W.route?W.route:(p=>'/property'+p);
const id=new URLSearchParams(location.search).get('id');
const NOW_YEAR=new Date().getFullYear();
const IMPORT_KEY='wd_farm_import_v1:';

let client,user,list,rows=[],totalCount=0,sortKey='assessment',sortDir=-1,deskPins=new Set(),assessmentPins=new Set(),lastMeta={};
let enrich={},enrichedPins=new Set(),enrichNote='',crm={loaded:false,connections:[],byPin:{},pending:0,error:''};
let imported={name:'',count:0,byKey:{}},crmFilter='all',selected=new Set();

function toast(m){const n=qs('#pl-toast');if(!n)return;n.textContent=m;n.style.display='block';clearTimeout(window.__ml);window.__ml=setTimeout(()=>n.style.display='none',3200)}
function criteria(){return list&&list.criteria?list.criteria:{}}
function classes(){const c=criteria().property_classes;return Array.isArray(c)?c:[]}
function intelFilters(){const f=criteria().intelligence_filters;return f&&typeof f==='object'?f:{}}
function hasIntel(){return Object.keys(intelFilters()).length>0}
function assessmentMode(){const f=intelFilters();return f.overassessment_only===true||f.overassessment_annual_min!=null||f.overassessment_pct_min!=null||f.assessment_reduction_min!=null}
function body(offset=0){const c=criteria();return{scope_type:list.scope_type,scope_value:list.scope_value,radius_miles:Number(c.radius_miles||2),property_classes:classes(),filters:c.filters||{},limit:250,offset}}
function label(){const c=classes().join(',');return c==='2'?'Residential':c==='4A,4B,4C'?'Commercial':c==='1'?'Vacant land':'All property classes'}
function propertyHref(r){const parts=[r.address,r.town,r.county?`${r.county} County`:'','NJ',r.zip].filter(Boolean).join(', ');return route('/')+'?address='+encodeURIComponent(parts)}
function intelReq(offset=0){const c=criteria();return{scope_type:list.scope_type,scope_value:list.scope_value,radius_miles:Number(c.radius_miles||2),polygon:c.polygon,property_classes:classes(),filters:c.filters||{},intelligence_filters:intelFilters(),limit:250,result_offset:offset,scan_limit:2000}}
function metric(r,k){return r.__metrics&&r.__metrics[k]!==undefined?r.__metrics[k]:null}
function pinOf(r){return String(r&&r.pams_pin||'')}
function titleCase(v){return String(v||'').toLowerCase().replace(/\b([a-z])/g,m=>m.toUpperCase())}
function ago(v){const t=new Date(v).getTime();if(!Number.isFinite(t))return'';const m=Math.round((Date.now()-t)/60000);if(m<1)return'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<48)return h+' hr ago';return Math.round(h/24)+' days ago'}

/* Address key shared by the CRM file matcher: house number + street, with the
   common suffixes folded (AVENUE→AVE and so on) so "14 Mill Court" matches "14 MILL CT". */
const SUFFIX={STREET:'ST',AVENUE:'AVE',ROAD:'RD',DRIVE:'DR',COURT:'CT',LANE:'LN',PLACE:'PL',BOULEVARD:'BLVD',TERRACE:'TER',CIRCLE:'CIR',PARKWAY:'PKWY',HIGHWAY:'HWY',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W'};
function addrKey(v){const t=String(v||'').toUpperCase().replace(/[.#,]/g,' ').replace(/\b(APT|UNIT|STE|SUITE)\b.*$/,'').replace(/[^A-Z0-9 ]+/g,' ').split(/\s+/).filter(Boolean).map(w=>SUFFIX[w]||w);return t.join(' ')}

/* ---------------------------------------------------------------- data -- */
async function fetchPage(offset=0,append=false){
  let r;
  if(hasIntel())r=await client.functions.invoke('farm-intelligence-scan',{body:intelReq(offset)});
  else{const c=criteria(),fn=list.scope_type==='polygon'?'farm-map-query':'municipal-data',req=list.scope_type==='polygon'?{polygon:c.polygon,property_classes:classes(),filters:c.filters||{},limit:250,offset}:body(offset);r=await client.functions.invoke(fn,{body:req})}
  if(r.error)throw r.error;
  const rec=Array.isArray(r.data?.records)?r.data.records:[];
  rows=append?rows.concat(rec):rec;
  totalCount=Number(hasIntel()?r.data?.match_count:r.data?.count??rows.length);
  lastMeta=r.data||{};
  await client.from('agent_dynamic_lists').update({last_checked_at:new Date().toISOString(),last_count:totalCount,updated_at:new Date().toISOString()}).eq('id',list.id);
  return lastMeta;
}
async function loadWorkspace(){
  const pins=rows.map(pinOf).filter(p=>p&&!enrichedPins.has(p));
  const chunks=[];for(let i=0;i<pins.length;i+=250)chunks.push(pins.slice(i,i+250));
  if(!chunks.length&&!crm.loaded)chunks.push([]);
  for(const chunk of chunks){
    try{
      const r=await client.functions.invoke('farm-workspace',{body:{pams_pins:chunk,owners:true,crm:true}});
      if(r.error)throw r.error;
      const d=r.data||{};
      Object.assign(enrich,d.properties||{});chunk.forEach(p=>enrichedPins.add(p));
      if(d.owner_error)enrichNote=d.owner_error;
      const c=d.crm||{};
      crm.loaded=true;crm.connections=Array.isArray(c.connections)?c.connections:[];crm.pending+=Number(c.pending_review||0);
      Object.assign(crm.byPin,c.by_pin||{});crm.error='';
    }catch(err){
      if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('market-list-workspace',err);
      crm.loaded=true;crm.error='Your CRM matches could not load right now.';
    }
  }
  paintSide();drawTable();
}

/* -------------------------------------------------- CSV from any database -- */
function parseCsv(text){
  const out=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
    if(ch==='"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))out.push(row);row=[]}else cell+=ch}
  row.push(cell);if(row.some(x=>x.trim()))out.push(row);return out;
}
function pickCol(heads,tests){for(const t of tests){const i=heads.findIndex(h=>t.test(h));if(i>=0)return i}return -1}
function importCsv(text,fileName){
  const data=parseCsv(text);if(data.length<2)throw new Error('That file has no rows.');
  const heads=data[0].map(h=>h.trim().toLowerCase());
  const a=pickCol(heads,[/^(property|street|site)[ _]?address$/,/^address( ?1| line 1)?$/,/address/]);
  if(a<0)throw new Error('Watchdog needs an address column in the file.');
  const full=pickCol(heads,[/^(full[ _]?name|name|contact[ _]?name|contact)$/]),first=pickCol(heads,[/^first[ _]?name$/,/^first$/]),last=pickCol(heads,[/^last[ _]?name$/,/^last$/]);
  const stage=pickCol(heads,[/^(lead[ _]?stage|stage|status|lead[ _]?status|type|contact[ _]?type|tags?)$/]),zip=pickCol(heads,[/^(zip|zip[ _]?code|postal[ _]?code)$/]);
  const byKey={};let count=0;
  for(const r of data.slice(1)){
    const key=addrKey(r[a]);if(!key||!/^\d/.test(key))continue;
    const name=(full>=0?r[full]:[first>=0?r[first]:'',last>=0?r[last]:''].join(' ')).trim().slice(0,120);
    // Only the name, stage and ZIP are kept. Emails and phone numbers in the file are ignored.
    byKey[key]={name:name||null,stage:stage>=0?String(r[stage]||'').trim().slice(0,60)||null:null,zip:zip>=0?String(r[zip]||'').trim().slice(0,5):''};count++;
  }
  if(!count)throw new Error('No rows in that file had a street address Watchdog could read.');
  imported={name:String(fileName||'your file').slice(0,80),count,byKey};
  try{localStorage.setItem(IMPORT_KEY+id,JSON.stringify(imported))}catch(_){}
}
function loadImported(){try{const x=JSON.parse(localStorage.getItem(IMPORT_KEY+id)||'null');if(x&&x.byKey)imported=x}catch(_){}}
function clearImported(){imported={name:'',count:0,byKey:{}};try{localStorage.removeItem(IMPORT_KEY+id)}catch(_){}}

/* Everything the agent already knows about a row, from their CRM or their file. */
function relFor(r){
  const out=[],pin=pinOf(r);
  (crm.byPin[pin]||[]).forEach(c=>out.push({name:c.contact_name,stage:c.lead_stage,when:c.crm_updated_at||c.last_activity_at,source:c.provider==='boldtrail'?'BoldTrail':titleCase(c.provider||'CRM')}));
  const hit=imported.byKey[addrKey(r.address)];
  if(hit&&(!hit.zip||!r.zip||String(r.zip).slice(0,5)===hit.zip))out.push({name:hit.name,stage:hit.stage,when:null,source:imported.name||'Your file'});
  return out;
}
function knownName(r){const x=relFor(r).find(v=>v.name);if(x)return x.name;const e=enrich[pinOf(r)];return e&&e.owner_name?e.owner_name:null}

/* ------------------------------------------------------------- table -- */
function header(key,text){const on=sortKey===key;return `<button class="ml-sort-head${on?' active':''}" data-sort-key="${key}" type="button">${text}<i class="fas fa-sort${on?(sortDir>0?'-up':'-down'):''}" aria-hidden="true"></i></button>`}
function filteredRows(){
  const q=(qs('#ml-search')?.value||'').toLowerCase();let a=rows.slice();
  if(q)a=a.filter(r=>[r.address,r.town,r.county,r.zip,r.block,r.lot,r.pams_pin,r.building_desc,r.prop_use,r.prop_class,knownName(r)].join(' ').toLowerCase().includes(q));
  if(crmFilter==='in')a=a.filter(r=>relFor(r).length);else if(crmFilter==='out')a=a.filter(r=>!relFor(r).length);
  const n=(r,k)=>Number(r[k])||0,txt=(r,k)=>String(r[k]||'');
  const getters={property:r=>txt(r,'address'),use:r=>txt(r,'prop_use')||txt(r,'prop_class'),year:r=>Number(r.year_built)||0,assessment:r=>n(r,'assessed_value'),tax:r=>n(r,'last_year_tax'),land:r=>n(r,'land_value'),improvements:r=>n(r,'improvement_value'),sale:r=>n(r,'last_sale_price'),distance:r=>Number(r.distance_miles)||999999,held:r=>{const y=enrich[pinOf(r)]?.last_deed_year;return y?NOW_YEAR-y:-1},crm:r=>relFor(r).length?1:0,wdscore:r=>Number(metric(r,'watchdog.score'))||0,taxpressure:r=>Number(metric(r,'watchdog.tax_pressure'))||0,uniformity:r=>Number(metric(r,'uniformity.score'))||0,reval:r=>Number(metric(r,'watchdog.revaluation_risk'))||0,supported:r=>Number(metric(r,'watchdog.chapter123_target_assessment'))||0,reduction:r=>Number(metric(r,'watchdog.chapter123_assessment_reduction'))||0,annual:r=>Number(metric(r,'watchdog.chapter123_annual_overpayment'))||0,overpct:r=>Number(metric(r,'watchdog.chapter123_over_upper_pct'))||0};
  const g=getters[sortKey]||getters.assessment;
  a.sort((x,y)=>{const av=g(x),bv=g(y);if(typeof av==='string')return sortDir*av.localeCompare(bv,undefined,{numeric:true});return sortDir*(av-bv)});
  return a;
}
function ratio(v){if(v===null||v===undefined||v==='')return'—';const n=Number(v);if(!Number.isFinite(n))return'—';return(n<=2?n*100:n).toFixed(1)+'%'}
function crmCell(r){
  const rel=relFor(r);
  if(!rel.length)return crm.loaded||imported.count?'<span class="ml-crm none">Not in your CRM</span>':'<span class="ml-crm none">—</span>';
  const x=rel[0];
  return `<span class="ml-crm in"><b><i class="fas fa-address-card" aria-hidden="true"></i> ${esc(x.name||'In your CRM')}</b><small>${esc([x.stage,x.source,x.when?'updated '+ago(x.when):''].filter(Boolean).join(' · '))}</small></span>`;
}
function heldCell(r){const e=enrich[pinOf(r)];if(!e)return enrichedPins.has(pinOf(r))?'—':'<span class="ml-dim">…</span>';const y=e.last_deed_year;if(!y)return'—';const n=NOW_YEAR-y;return `${y}<small class="ml-sub">${n<1?'this year':n+' yr'+(n===1?'':'s')}</small>`}
function drawTable(){
  const host=qs('#ml-content');if(!host)return;
  const a=filteredRows(),radius=list.scope_type==='radius',intel=hasIntel(),over=assessmentMode();
  const allOn=a.length&&a.every(r=>selected.has(pinOf(r)));
  // content-architecture: dynamic — the table is built from the filtered, sorted farm rows and the agent's CRM matches.
  host.innerHTML=a.length?`<div class="ml-table-wrap"><table class="ml-table${over?' ml-over-table':''}"><thead><tr><th class="ml-check"><input type="checkbox" id="ml-all" aria-label="Select every property shown" ${allOn?'checked':''}></th><th>${header('property','Property')}</th><th>${header('crm','Your CRM')}</th><th>${header('assessment','Assessment')}</th>${over?`<th>${header('sale','Recorded sale')}</th><th class="ml-th-plain">Ratio / upper limit</th><th>${header('supported','Supported assessment')}</th><th>${header('reduction','Est. reduction')}</th><th>${header('annual','Annual tax impact')}</th><th>${header('overpct','% above upper')}</th>`:`<th>${header('tax','Tax')}</th><th>${header('held','Last deed')}</th>${intel?`<th>${header('wdscore','WD Score')}</th><th>${header('taxpressure','Tax Pressure')}</th><th>${header('uniformity','Uniformity')}</th><th>${header('reval','Reval Risk')}</th>`:`<th>${header('year','Built')}</th><th>${header('use','Use')}</th>`}<th>${header('sale','Last sale')}</th>${radius?`<th>${header('distance','Distance')}</th>`:''}`}<th class="ml-th-plain">Actions</th></tr></thead><tbody>${a.map(r=>{
    const href=propertyHref(r),pin=pinOf(r),done=deskPins.has(pin)&&(!over||assessmentPins.has(pin)),e=enrich[pin]||{},mv=k=>{const v=metric(r,k);return v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2})};
    return `<tr data-pin="${esc(pin)}" data-address="${esc(r.address)}" data-town="${esc(r.town)}" data-county="${esc(r.county)}" data-zip="${esc(r.zip)}"${selected.has(pin)?' class="is-picked"':''}><td class="ml-check"><input type="checkbox" data-pick="${esc(pin)}" aria-label="Select ${esc(r.address||'property')}" ${selected.has(pin)?'checked':''}></td><td><a class="ml-address" href="${href}">${esc(r.address||'Property record')}</a><span class="ml-sub">${esc(e.postal_city?titleCase(e.postal_city)+' · ':'')}${esc(r.town||'')}${r.block?' · Block '+esc(r.block):''}${r.lot?' / Lot '+esc(r.lot):''}</span>${e.owner_mails_elsewhere?'<span class="ml-flag" title="The tax bill for this property is mailed to a different address">Tax bill mailed elsewhere</span>':''}</td><td>${crmCell(r)}</td><td>${money(r.assessed_value)}</td>${over?`<td>${money(r.last_sale_price)}</td><td>${ratio(metric(r,'watchdog.chapter123_assessment_ratio'))} / ${ratio(metric(r,'watchdog.chapter123_upper_limit'))}</td><td>${money(metric(r,'watchdog.chapter123_target_assessment'))}</td><td>${money(metric(r,'watchdog.chapter123_assessment_reduction'))}</td><td><b class="ml-impact">${money(metric(r,'watchdog.chapter123_annual_overpayment'))}</b></td><td>${mv('watchdog.chapter123_over_upper_pct')}%</td>`:`<td>${money(r.last_year_tax)}</td><td>${heldCell(r)}</td>${intel?`<td>${mv('watchdog.score')}</td><td>${mv('watchdog.tax_pressure')}</td><td>${mv('uniformity.score')}</td><td>${mv('watchdog.revaluation_risk')}</td>`:`<td>${esc(r.year_built||'—')}</td><td>${esc(r.prop_use||r.prop_class||'—')}</td>`}<td>${r.last_sale_price?money(r.last_sale_price):'—'}</td>${radius?`<td>${r.distance_miles!=null?Number(r.distance_miles).toFixed(2)+' mi':'—'}</td>`:''}`}<td><div class="ml-actions"><a class="ml-btn sm" href="${href}"><i class="fas fa-magnifying-glass" aria-hidden="true"></i> Open</a><button class="ml-btn sm ml-desk${done?' added':''}" type="button" ${done?'disabled':''}><i class="fas ${done?'fa-circle-check':'fa-bullseye'}" aria-hidden="true"></i> ${done?'Added':'Add to Desk'}</button></div></td></tr>`}).join('')}</tbody></table></div>`:`<div class="ml-empty"><i class="fas fa-filter-circle-xmark" aria-hidden="true"></i><h2>No properties match this view.</h2><p>${crmFilter!=='all'?'Try the "All" filter.':intel?'The selected Watchdog intelligence rules may be too narrow, or the required metric is not yet available for candidate parcels.':'Try changing the search term or farm criteria.'}</p></div>`;
  // Column names ride along on each cell so the phone layout can label them.
  const names=[...host.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  host.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{if(names[i])td.dataset.l=names[i]}));
  host.querySelectorAll('[data-sort-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.sortKey;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=/property|use/.test(k)?1:-1}drawTable()});
  const more=qs('#ml-more');if(more)more.hidden=rows.length>=Number(lastMeta.accessible_count??totalCount);
  paintSelection();
}
function paintSelection(){
  const n=selected.size,el=qs('#ml-selcount');
  if(el)el.textContent=n?`${n.toLocaleString()} selected`:`${filteredRows().length.toLocaleString()} shown`;
  const clear=qs('#ml-selclear');if(clear)clear.hidden=!n;
  document.querySelectorAll('[data-scope-label]').forEach(x=>x.textContent=n?'selected':'shown');
}
function targetRows(){const a=filteredRows();return selected.size?a.filter(r=>selected.has(pinOf(r))):a}

/* ------------------------------------------------------------ exports -- */
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function csvOf(heads,data){const cell=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return'"'+s.replace(/"/g,'""')+'"'};return '﻿'+[heads.map(cell).join(','),...data.map(r=>r.map(cell).join(','))].join('\r\n')}
function fileBase(){return(list.name||'watchdog-farm').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'watchdog-farm'}
/* Postal city: the home's own, else the most common one among farm homes with the
   same ZIP, else the municipality name. The ZIP is what routes the mail. */
// content-architecture: dynamic — postal city is looked up from this farm's own rows.
function zipCity(zip){const z=String(zip||'').slice(0,5),n={};rows.forEach(r=>{const c=enrich[pinOf(r)]?.postal_city;if(c&&String(r.zip||'').slice(0,5)===z)n[c]=(n[c]||0)+1});let best='',m=0;for(const k in n)if(n[k]>m){m=n[k];best=k}return best}
function cityOf(r){const e=enrich[pinOf(r)],c=(e&&e.postal_city)||zipCity(r.zip);if(c)return titleCase(c);return titleCase(String(r.town||'').replace(/\s+(TWP|TOWNSHIP|BORO|BOROUGH|CITY|TOWN|VILLAGE)$/i,''))}
function addressee(r,mode){if(mode==='resident')return'Current Resident';if(mode==='homeowner')return'Homeowner';const n=knownName(r);return n?titleCase(n)+' or Current Resident':'Current Resident'}
function exportCrm(){
  const intel=hasIntel(),base=['Property Address','City','State','Zip','Municipality','County','Block','Lot','PAMS PIN','Class','Use','Year Built','Assessed Value','Annual Tax','Last Sale Price','Last Deed Year','Tax Bill Mailed Elsewhere','In Your CRM','CRM Contact','CRM Stage','Watchdog Link'],extra=intel?['Watchdog Score','Tax Pressure','Uniformity','Reval Risk']:[];
  const data=targetRows().map(r=>{const e=enrich[pinOf(r)]||{},rel=relFor(r)[0]||{};return[r.address,cityOf(r),'NJ',r.zip,r.town,r.county,r.block,r.lot,r.pams_pin,r.prop_class,r.prop_use,r.year_built,r.assessed_value,r.last_year_tax,r.last_sale_price,e.last_deed_year||'',e.owner_mails_elsewhere==null?'':e.owner_mails_elsewhere?'Yes':'No',relFor(r).length?'Yes':'No',rel.name||'',rel.stage||'',location.origin+propertyHref(r)].concat(intel?[metric(r,'watchdog.score'),metric(r,'watchdog.tax_pressure'),metric(r,'uniformity.score'),metric(r,'watchdog.revaluation_risk')].map(v=>v??''):[])});
  download(fileBase()+'-crm.csv',csvOf(base.concat(extra),data),'text/csv;charset=utf-8');toast('CRM file downloaded');
}
function exportMerge(mode){
  const data=targetRows().map(r=>[addressee(r,mode),r.address,cityOf(r),'NJ',String(r.zip||'').slice(0,5)]);
  download(fileBase()+'-mail-merge.csv',csvOf(['Addressee','Address','City','State','ZIP'],data),'text/csv;charset=utf-8');toast('Mail-merge file downloaded');
}
function printLabels(format,mode){
  const a=targetRows();if(!a.length){toast('No properties to print');return}
  const per=format==='5163'?10:30,root=qs('#ml-print-root');
  const lab=r=>{const n=mode==='smart'?knownName(r):null;return `<div class="ml-label"><b>${esc(n?titleCase(n):addressee(r,mode))}</b>${n?'<span>or Current Resident</span>':''}<span>${esc(r.address)}</span><span>${esc(cityOf(r))}, NJ ${esc(String(r.zip||'').slice(0,5))}</span></div>`};
  let html='';for(let i=0;i<a.length;i+=per)html+=`<div class="ml-sheet f${format}">${a.slice(i,i+per).map(lab).join('')}</div>`;
  root.innerHTML=html;document.body.classList.add('ml-printing');
  const done=()=>{document.body.classList.remove('ml-printing');root.innerHTML='';window.removeEventListener('afterprint',done)};
  window.addEventListener('afterprint',done);setTimeout(()=>window.print(),60);
}

/* ------------------------------------------------ Intelligence + CRM side -- */
function brief(){
  const a=rows,n=a.length,held=a.map(r=>enrich[pinOf(r)]?.last_deed_year).filter(Boolean);
  const long=held.filter(y=>NOW_YEAR-y>=15).length,recent=held.filter(y=>NOW_YEAR-y<=2).length,away=a.filter(r=>enrich[pinOf(r)]?.owner_mails_elsewhere).length,known=a.filter(r=>relFor(r).length).length;
  const taxes=a.map(r=>Number(r.last_year_tax)).filter(x=>x>0).sort((x,y)=>x-y),p90=taxes.length?taxes[Math.floor(taxes.length*.9)]:0,topTax=p90?a.filter(r=>Number(r.last_year_tax)>=p90).length:0;
  const items=[];
  if(known)items.push({icon:'fa-address-card',text:`<b>${known}</b> of ${n} homes are already in your CRM. Start there: a neighborhood tax update is an easy reason to reach out.`,filter:'in'});
  else items.push({icon:'fa-address-card',text:crm.connections.length||imported.count?'None of the loaded homes match your CRM yet. Every mailer here is a new introduction.':'Connect your CRM or upload a contact file to see which homes you already know.'});
  if(held.length)items.push({icon:'fa-clock-rotate-left',text:`<b>${long}</b> homes last changed hands 15+ years ago and <b>${recent}</b> in the last 2 years. Long-time owners often value an updated tax and value review.`});
  if(away)items.push({icon:'fa-envelope-open-text',text:`<b>${away}</b> tax bills are mailed to a different address than the property. Mail to "Current Resident" reaches whoever lives there.`});
  if(topTax)items.push({icon:'fa-receipt',text:`<b>${topTax}</b> homes pay ${money(p90)}+ a year in property tax, the top 10% of this farm. Watchdog reports explain how their assessment compares.`});
  return items;
}
function paintSide(){
  const en=qs('[data-f="enrichNote"]');if(en)en.textContent=enrichNote;
  const b=qs('#ml-brief');
  // content-architecture: dynamic — each brief line is computed from the loaded farm rows, deed years and CRM matches.
  if(b){const items=brief();b.innerHTML=items.map(x=>`<li><i class="fas ${x.icon}" aria-hidden="true"></i><span>${x.text}${x.filter?` <button type="button" class="ml-link" data-crm-filter="${x.filter}">Show them</button>`:''}</span></li>`).join('')||'<li><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>Reading this farm…</span></li>'}
  const c=qs('#ml-crm-body');if(!c)return;
  const conns=crm.connections.map(x=>`<div class="ml-conn"><span class="ml-conn-icon" aria-hidden="true"><i class="fas fa-plug"></i></span><div><b>${esc(x.provider==='boldtrail'?'BoldTrail (kvCORE)':x.label)}</b><small>${x.has_error?'Last sync had a problem. Check Integrations.':x.last_synced_at?'Synced '+esc(ago(x.last_synced_at))+(x.records_synced?' · '+x.records_synced.toLocaleString()+' contacts':''):'Waiting for first sync'}</small></div><span class="ml-dot${x.has_error?' bad':''}" aria-hidden="true"></span></div>`).join('');
  const known=rows.filter(r=>relFor(r).length).length;
  // content-architecture: dynamic — connection status, sync times, match counts and the uploaded file all come from this agent's live CRM and device state.
  c.innerHTML=`${crm.error?`<p class="ml-warn">${esc(crm.error)}</p>`:''}${conns||(crm.loaded?'<p class="ml-muted">No CRM connected yet. BoldTrail (kvCORE) syncs automatically once connected.</p>':'<p class="ml-muted">Checking your connections…</p>')}<div class="ml-crm-meter"><div><b>${known.toLocaleString()}</b><span>of ${rows.length.toLocaleString()} loaded homes are in your CRM${imported.count?' or file':''}</span></div><div class="ml-meter" role="img" aria-label="${known} of ${rows.length} homes matched"><i style="width:${rows.length?Math.round(known/rows.length*100):0}%"></i></div></div>${crm.pending?`<p class="ml-muted"><i class="fas fa-circle-question" aria-hidden="true"></i> ${crm.pending} possible matches need a quick yes or no in Integrations.</p>`:''}${imported.count?`<div class="ml-file"><i class="fas fa-file-csv" aria-hidden="true"></i><span><b>${esc(imported.name)}</b><small>${imported.count.toLocaleString()} contacts · stays on this device</small></span><button type="button" class="ml-link" id="ml-file-clear">Remove</button></div>`:''}`;
  const link=qs('#ml-crm-link');if(link)link.textContent=crm.connections.length?'Manage CRM':'Connect CRM';
}
function askIntelligence(){
  const btn=qs('#ml-ask');if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  const addCss=href=>{if(document.querySelector(`link[href="${href}"]`))return;const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)};
  addCss('/property/css/data-workbench-analyst.css');
  const ready=window.WatchdogContextualAnalyst?Promise.resolve():new Promise((res,rej)=>{const s=document.createElement('script');s.src='/property/js/watchdog-contextual-analyst.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});
  ready.then(()=>{
    const a=targetRows(),known=a.filter(r=>relFor(r).length).length;
    window.WatchdogContextualAnalyst.open({surface:'agent_farm',title:'Ask Watchdog Intelligence',kicker:'WATCHDOG INTELLIGENCE',subtitle:'Ask about this farm. Watchdog uses public property records and never guesses who plans to sell.',pams_pins:a.slice(0,100).map(pinOf),contextLabel:`${list.name||'This farm'} · ${a.length.toLocaleString()} ${selected.size?'selected':'shown'} homes`,context:{farm_name:list.name||null,scope:list.scope_value||null,property_classes:label(),matching_count:totalCount,loaded_count:rows.length,in_crm_count:known},chips:['Summarize this farm for me','Which homes should I review first, and why?','Draft a friendly neighborhood tax update letter','What should I verify before mailing?']});
  }).catch(()=>toast('Watchdog Intelligence could not open. Try again.')).finally(()=>{if(btn){btn.disabled=false;btn.removeAttribute('aria-busy')}});
}

/* ------------------------------------------------------------- render -- */
// Static page markup lives in <template id="ml-page"> in the HTML. This only
// fills in the farm's own values and resolves clean routes.
function fill(root,key,text){root.querySelectorAll(`[data-f="${key}"]`).forEach(n=>n.textContent=text)}
function routeLinks(root){const lid=encodeURIComponent(list?list.id:'');root.querySelectorAll('[data-route]').forEach(a=>{a.href=route(a.dataset.route)+(a.hasAttribute('data-list-param')&&lid?'?list='+lid:'')})}
function render(data){
  const avg=key=>{const x=rows.map(r=>Number(r[key])).filter(n=>n>0);return x.length?Math.round(x.reduce((a,b)=>a+b,0)/x.length):0};
  const intel=hasIntel(),over=assessmentMode(),scanNote=intel?`${Number(data.scanned_count||0).toLocaleString()} candidate parcels scanned${data.capacity_limited?' · plan capacity applied':''}${data.truncated?' · scan cap reached':''}`:'';
  if(over){sortKey='annual';sortDir=-1}
  const page=qs('#ml-page').content.cloneNode(true);
  fill(page,'mode',over?' · Assessment screen':intel?' · Intelligence filtered':'');
  fill(page,'name',list.name||'Farm');
  fill(page,'scope',`${list.scope_value||''} · ${label()} · ${totalCount.toLocaleString()} matching parcels`);
  fill(page,'total',totalCount.toLocaleString());
  fill(page,'avgAssess',avg('assessed_value')?money(avg('assessed_value')):'—');
  fill(page,'avgTax',avg('last_year_tax')?money(avg('last_year_tax')):'—');
  const note=page.querySelector('[data-f="intelNote"]');
  note.textContent=over?`Assessment review screening, not a predicted appeal outcome. ${data.screening_note||'Verify current records before advising an owner.'}`:intel?`Your intelligence rules run after the statewide parcel search. ${scanNote}`:note.dataset.default;
  fill(page,'source',data.source||'NJ statewide parcel data');
  page.querySelector('#ml-loaded').textContent=rows.length.toLocaleString();
  routeLinks(page);
  const app=qs('#ml-app');app.replaceChildren(page);
  wire(data,over);drawTable();paintSide();
}
function wire(data,over){
  qs('#ml-search').oninput=()=>drawTable();
  qs('#ml-refresh').onclick=()=>location.reload();
  qs('#ml-export').onclick=exportCrm;
  qs('#ml-export-merge').onclick=()=>exportMerge('smart');
  qs('#ml-merge').onclick=()=>exportMerge((document.querySelector('input[name="ml-to"]:checked')||{}).value||'smart');
  qs('#ml-print').onclick=()=>printLabels((document.querySelector('input[name="ml-fmt"]:checked')||{}).value||'5160',(document.querySelector('input[name="ml-to"]:checked')||{}).value||'smart');
  qs('#ml-ask').onclick=askIntelligence;
  qs('#ml-selclear').onclick=()=>{selected.clear();drawTable()};
  qs('#ml-bulk-desk').onclick=bulkDesk;
  qs('#ml-app').addEventListener('click',e=>{
    const f=e.target.closest('[data-crm-filter]');if(f){crmFilter=f.dataset.crmFilter;document.querySelectorAll('.ml-seg [data-crm-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crmFilter===crmFilter)));drawTable();if(!f.closest('.ml-seg'))qs('#ml-results-h')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const o=e.target.closest('[data-open]');if(o){const pop=qs('#ml-pop-'+o.dataset.open),show=pop.hidden;document.querySelectorAll('.ml-pop').forEach(p=>p.hidden=true);document.querySelectorAll('[data-open]').forEach(b=>b.setAttribute('aria-expanded','false'));pop.hidden=!show;o.setAttribute('aria-expanded',String(show));return}
    if(e.target.closest('#ml-file-clear')){clearImported();paintSide();drawTable();toast('File removed from this device');}
  });
  qs('#ml-app').addEventListener('change',async e=>{
    const t=e.target;
    if(t.id==='ml-all'){filteredRows().forEach(r=>t.checked?selected.add(pinOf(r)):selected.delete(pinOf(r)));drawTable();return}
    if(t.dataset&&t.dataset.pick){const p=t.dataset.pick;t.checked?selected.add(p):selected.delete(p);t.closest('tr')?.classList.toggle('is-picked',t.checked);const all=qs('#ml-all');if(all)all.checked=filteredRows().every(r=>selected.has(pinOf(r)));paintSelection();return}
    if(t.id==='ml-file'&&t.files&&t.files[0]){const file=t.files[0];if(file.size>8*1024*1024){toast('That file is over 8 MB');return}try{importCsv(await file.text(),file.name);paintSide();drawTable();toast(`Matched against ${imported.count.toLocaleString()} contacts`)}catch(err){toast(err.message||'That file could not be read')}}
  });
  qs('#ml-more').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.innerHTML='<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Loading';try{await fetchPage(rows.length,true);const l=qs('#ml-loaded');if(l)l.textContent=rows.length.toLocaleString();drawTable();paintSide();loadWorkspace()}catch(err){if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('market-list-more',err);toast(safe(err,'market-list-more'))}finally{b.disabled=false;b.innerHTML='<i class="fas fa-chevron-down" aria-hidden="true"></i> Load more homes'}};
  qs('#ml-content').onclick=async e=>{const btn=e.target.closest('.ml-desk');if(!btn)return;const tr=btn.closest('tr');await addToDesk(tr?.dataset.pin,btn,data,over)};
}
async function addToDesk(p,btn,data,over){
  if(!p||(deskPins.has(p)&&(!over||assessmentPins.has(p))))return true;
  const row=rows.find(x=>pinOf(x)===p);if(!row)return false;
  if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Adding'}
  try{
    const payload={user_id:user.id,pams_pin:p,address:row.address,municipality:row.town||null,county:row.county||null,zip:row.zip||null,relationship:'farm',source:over?'assessment_screen':'manual',match_status:'matched',updated_at:new Date().toISOString()};
    if(!deskPins.has(p)){const x=await client.from('agent_farm_properties').insert(payload);if(x.error)throw x.error;deskPins.add(p)}
    if(over){const annual=Number(metric(row,'watchdog.chapter123_annual_overpayment')||0),reason=`Current assessment appears above the Chapter 123 screening range using the parcel's recorded sale and published ratio context. Estimated annual tax difference: ${money(annual)}.`,note='WATCHDOG_ASSESSMENT|'+JSON.stringify({address:row.address,town:row.town,pams_pin:p,annual_impact:annual,assessment_reduction:Number(metric(row,'watchdog.chapter123_assessment_reduction')||0),over_upper_pct:Number(metric(row,'watchdog.chapter123_over_upper_pct')||0),reason,source:data.source||'NJ statewide parcels + Watchdog bulk intelligence',source_date:new Date().toISOString().slice(0,10)}),key=p+':assessment_review';const a=await client.from('agent_opportunity_actions').upsert({user_id:user.id,opportunity_key:key,pams_pin:p,action_state:'watched',note,updated_at:new Date().toISOString()},{onConflict:'user_id,opportunity_key'});if(a.error)throw a.error;assessmentPins.add(p)}
    if(btn){btn.classList.add('added');btn.innerHTML='<i class="fas fa-circle-check" aria-hidden="true"></i> Added'}
    return true;
  }catch(err){
    if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('market-list-add-desk',err);
    if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-bullseye" aria-hidden="true"></i> Add to Desk'}
    toast(safe(err,'market-list-add-desk'));return false;
  }
}
async function bulkDesk(){
  const a=targetRows().filter(r=>!deskPins.has(pinOf(r)));
  if(!a.length){toast('Those homes are already on your Desk');return}
  if(a.length>50&&!confirm(`Add ${a.length} homes to your Opportunity Desk?`))return;
  const b=qs('#ml-bulk-desk');b.disabled=true;let ok=0;
  for(const r of a){if(await addToDesk(pinOf(r),null,lastMeta,assessmentMode()))ok++;else break}
  b.disabled=false;drawTable();toast(`${ok} added to your Opportunity Desk`);
}
async function start(ctx){
  user=ctx?.user;if(!user)throw new Error('Sign in required');
  client=window.NJPTRAccess?.client?.();if(!client)throw new Error('Watchdog data client unavailable');
  if(!id)throw new Error('List ID is missing');
  const [r,d,a]=await Promise.all([client.from('agent_dynamic_lists').select('*').eq('id',id).single(),client.from('agent_farm_properties').select('pams_pin').eq('user_id',user.id),client.from('agent_opportunity_actions').select('pams_pin,note').eq('user_id',user.id).like('note','WATCHDOG_ASSESSMENT|%')]);
  if(r.error)throw r.error;if(d.error)throw d.error;if(a.error)throw a.error;
  list=r.data;(d.data||[]).forEach(x=>deskPins.add(String(x.pams_pin||'')));(a.data||[]).forEach(x=>assessmentPins.add(String(x.pams_pin||'')));
  loadImported();
  const data=await fetchPage(0,false);render(data);loadWorkspace();
}
const ready=window.njptrAccessReady||Promise.reject(new Error('Access context did not initialize'));
Promise.resolve(ready).then(start).catch(err=>{
  if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('market-list-start',err);
  const h=qs('#ml-app'),t=qs('#ml-fail');if(!h||!t)return;
  const box=t.content.cloneNode(true);fill(box,'message',safe(err,'market-list-start'));routeLinks(box);
  box.querySelector('[data-reload]').addEventListener('click',()=>location.reload());
  h.replaceChildren(box);
});
})();

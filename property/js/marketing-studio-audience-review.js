(function(){'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString();
const money=n=>n==null||n===''?'—':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
const num=n=>n==null||n===''?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const score=n=>n==null||n===''?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:1});
const emptyFilters=()=>({classes:[],tenure_buckets:[],include_unknown:false,year_built_min:null,year_built_max:null,assessment_min:null,assessment_max:null,tax_min:null,tax_max:null,acres_min:null,acres_max:null,units_min:null,units_max:null,sale_year_min:null,sale_year_max:null,watchdog_score_min:null,tax_pressure_min:null,revaluation_risk_min:null,uniformity_score_min:null,keyword:''});
const S={client:null,campaignId:null,keys:[],filteredKeys:[],selected:new Set(),page:1,pageSize:50,search:'',sort:'address',dir:'asc',rows:[],total:0,pages:1,sourceLabel:'Current campaign audience',loading:false,filters:emptyFilters(),insights:{}};

function toast(m){const t=$('#pl-toast')||$('#ms-toast');if(!t)return;t.textContent=m;t.style.display='block';clearTimeout(window.__msarToast);window.__msarToast=setTimeout(()=>t.style.display='none',3800)}
async function rpc(name,args={}){const r=await S.client.rpc(name,args);if(r.error)throw r.error;return r.data}
function campaign(){return S.campaignId||new URLSearchParams(location.search).get('campaign')||''}
function propClassLabel(v){return v==='2'?'Residential':v==='4A'?'Commercial':v==='4B'?'Industrial':v==='4C'?'Apartments':v||'—'}
function fieldNum(id){const el=$(id),raw=String(el?.value??'').trim();if(raw==='')return null;const n=Number(raw.replace(/[$,]/g,''));return Number.isFinite(n)?n:null}
function activeFilterCount(){
  let n=0;
  if(S.filters.classes.length)n++;
  if(S.filters.tenure_buckets.length)n++;
  if(S.filters.include_unknown)n++;
  if(S.filters.keyword)n++;
  ['year_built_min','year_built_max','assessment_min','assessment_max','tax_min','tax_max','acres_min','acres_max','units_min','units_max','sale_year_min','sale_year_max','watchdog_score_min','tax_pressure_min','revaluation_risk_min','uniformity_score_min'].forEach(k=>{if(S.filters[k]!=null)n++});
  return n;
}
function filterSummary(){
  const f=S.filters,parts=[];
  if(f.classes.length)parts.push(f.classes.map(propClassLabel).join(', '));
  if(f.year_built_min!=null||f.year_built_max!=null)parts.push(`Year ${f.year_built_min??'…'}–${f.year_built_max??'…'}`);
  if(f.assessment_min!=null||f.assessment_max!=null)parts.push(`Assessment ${money(f.assessment_min)}–${money(f.assessment_max)}`);
  if(f.tax_min!=null||f.tax_max!=null)parts.push(`Tax ${money(f.tax_min)}–${money(f.tax_max)}`);
  if(f.acres_min!=null||f.acres_max!=null)parts.push(`Acres ${f.acres_min??'…'}–${f.acres_max??'…'}`);
  if(f.units_min!=null||f.units_max!=null)parts.push(`Units ${f.units_min??'…'}–${f.units_max??'…'}`);
  if(f.sale_year_min!=null||f.sale_year_max!=null)parts.push(`Sale year ${f.sale_year_min??'…'}–${f.sale_year_max??'…'}`);
  if(f.tenure_buckets.length)parts.push(`Time owned: ${f.tenure_buckets.map(x=>({'0_5':'0–5','5_10':'5–10','10_15':'10–15','15_20':'15–20','20_plus':'20+'}[x]||x)).join(', ')}`);
  if(f.watchdog_score_min!=null)parts.push(`Watchdog ≥ ${f.watchdog_score_min}`);
  if(f.tax_pressure_min!=null)parts.push(`Tax pressure ≥ ${f.tax_pressure_min}`);
  if(f.revaluation_risk_min!=null)parts.push(`Revaluation ≥ ${f.revaluation_risk_min}`);
  if(f.uniformity_score_min!=null)parts.push(`Uniformity ≥ ${f.uniformity_score_min}`);
  if(f.keyword)parts.push(`Building: “${f.keyword}”`);
  if(f.include_unknown)parts.push('Keep unknown values');
  return parts;
}
function filterPanel(){
 return `<section class="msar-filter-panel" id="msar-filter-panel" hidden>
   <div class="msar-filter-head">
    <div><span>ADVANCED PROPERTY FILTERS</span><h3>Drill into the exact homes you want.</h3><p>Public-record and Watchdog signals only. No demographic targeting.</p></div>
    <button type="button" id="msar-filter-close" aria-label="Close filters">×</button>
   </div>
   <div class="msar-filter-sections">
    <fieldset><legend>Property</legend>
      <div class="msar-chipline"><span>Class</span>
       <button type="button" data-msar-class="2">Residential</button><button type="button" data-msar-class="4A">Commercial</button><button type="button" data-msar-class="4B">Industrial</button><button type="button" data-msar-class="4C">Apartments</button>
      </div>
      <div class="msar-range-grid">
       <label><span>Year built</span><div><input id="msar-year-min" inputmode="numeric" placeholder="Min"><b>to</b><input id="msar-year-max" inputmode="numeric" placeholder="Max"></div></label>
       <label><span>Lot size (acres)</span><div><input id="msar-acres-min" inputmode="decimal" placeholder="Min"><b>to</b><input id="msar-acres-max" inputmode="decimal" placeholder="Max"></div></label>
       <label><span>Dwelling units</span><div><input id="msar-units-min" inputmode="numeric" placeholder="Min"><b>to</b><input id="msar-units-max" inputmode="numeric" placeholder="Max"></div></label>
       <label class="wide"><span>Building description keyword</span><div><input id="msar-keyword" placeholder="e.g. ranch, colonial, model name"></div></label>
      </div>
    </fieldset>
    <fieldset><legend>Tax & value</legend>
      <div class="msar-range-grid">
       <label><span>Assessment</span><div><input id="msar-assessment-min" inputmode="numeric" placeholder="Min"><b>to</b><input id="msar-assessment-max" inputmode="numeric" placeholder="Max"></div></label>
       <label><span>Annual property tax</span><div><input id="msar-tax-min" inputmode="numeric" placeholder="Min"><b>to</b><input id="msar-tax-max" inputmode="numeric" placeholder="Max"></div></label>
       <label><span>Recorded sale year</span><div><input id="msar-sale-year-min" inputmode="numeric" placeholder="Min"><b>to</b><input id="msar-sale-year-max" inputmode="numeric" placeholder="Max"></div></label>
      </div>
    </fieldset>
    <fieldset><legend>Time owned</legend>
      <div class="msar-chipline time"><span>Recorded deed age</span>
       <button type="button" data-msar-tenure="0_5">0–5 years</button><button type="button" data-msar-tenure="5_10">5–10</button><button type="button" data-msar-tenure="10_15">10–15</button><button type="button" data-msar-tenure="15_20">15–20</button><button type="button" data-msar-tenure="20_plus">20+</button>
      </div>
      <small>Based on trustworthy recorded deed dates. This is an ownership-duration signal, not proof of occupancy.</small>
    </fieldset>
    <fieldset><legend>Watchdog intelligence</legend>
      <div class="msar-range-grid signal">
       <label><span>Watchdog score ≥</span><input id="msar-watchdog-min" inputmode="decimal" placeholder="Any"></label>
       <label><span>Tax pressure ≥</span><input id="msar-tax-pressure-min" inputmode="decimal" placeholder="Any"></label>
       <label><span>Revaluation risk ≥</span><input id="msar-revaluation-min" inputmode="decimal" placeholder="Any"></label>
       <label><span>Uniformity score ≥</span><input id="msar-uniformity-min" inputmode="decimal" placeholder="Any"></label>
      </div>
    </fieldset>
   </div>
   <div class="msar-filter-footer">
    <label class="msar-checkline"><input type="checkbox" id="msar-include-unknown"><span>Keep properties with unknown values when a filter is active</span></label>
    <div><button type="button" class="ms-secondary" id="msar-filter-reset">Reset</button><button type="button" class="ms-primary" id="msar-filter-apply">Update results</button></div>
   </div>
  </section>`;
}
function shell(){
 let host=$('#ms-audience-review');if(host)return host;
 host=document.createElement('section');host.id='ms-audience-review';host.className='ms-card ms-wide msar-shell';
 host.innerHTML=`<div class="msar-head"><div><span>AUDIENCE REVIEW</span><h2>Choose exactly who stays in this campaign.</h2><p id="msar-source"></p></div><div class="msar-count"><b id="msar-selected">0</b><span>selected</span><small id="msar-total">0 properties loaded</small></div></div>
 <div class="msar-tools">
   <label class="wide"><span>Search audience</span><input type="search" id="msar-search" placeholder="Address, town, block, lot, building type"></label>
   <button type="button" class="msar-filter-button" id="msar-filter-open"><i class="fas fa-sliders"></i><span>Filters</span><b id="msar-filter-count" hidden>0</b></button>
   <label><span>Sort</span><select id="msar-sort"><option value="address">Address</option><option value="town">Town</option><option value="class">Property class</option><option value="year_built">Year built</option><option value="assessment">Assessment</option><option value="tax">Property tax</option><option value="sale_year">Last sale</option><option value="tenure">Years since sale</option><option value="acres">Acres</option><option value="units">Units</option><option value="watchdog_score">Watchdog score</option><option value="tax_pressure">Tax pressure</option><option value="revaluation_risk">Revaluation risk</option><option value="uniformity">Uniformity</option></select></label>
   <button type="button" class="ms-secondary" id="msar-dir">A → Z</button>
 </div>
 ${filterPanel()}
 <div id="msar-filter-summary" class="msar-filter-summary" hidden></div>
 <div id="msar-insights" class="msar-insights"></div>
 <div class="msar-bulk"><button type="button" id="msar-all-visible">Select visible</button><button type="button" id="msar-clear-visible">Clear visible</button><button type="button" id="msar-all-matching">Select all matching</button><button type="button" id="msar-clear-matching">Clear matching</button><button type="button" id="msar-reset-selection">Reset selection</button><span id="msar-selection-note"></span></div>
 <div class="msar-table-wrap"><table class="msar-table"><thead><tr><th class="check"></th><th>Address</th><th>Location</th><th>Class</th><th>Year</th><th>Building</th><th>Acres</th><th>Units</th><th>Assessment</th><th>Tax</th><th>Last sale</th><th>Years since sale</th><th>Watchdog</th><th>Tax pressure</th><th></th></tr></thead><tbody id="msar-body"><tr><td colspan="15" class="msar-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading properties…</td></tr></tbody></table></div>
 <div id="msar-detail" class="msar-detail" hidden></div>
 <div class="msar-foot"><div class="msar-pages"><button type="button" id="msar-prev">← Previous</button><span id="msar-page">Page 1</span><button type="button" id="msar-next">Next →</button><select id="msar-page-size"><option value="25">25 / page</option><option value="50" selected>50 / page</option><option value="100">100 / page</option></select></div><button type="button" class="ms-primary" id="msar-save">Save audience & continue</button></div>`;
 $('#ms-app')?.appendChild(host);bind();return host;
}
function bind(){
 let timer=null;
 $('#msar-search').oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>{S.search=e.target.value.trim();S.page=1;loadPage()},260)};
 $('#msar-sort').onchange=e=>{S.sort=e.target.value;S.page=1;loadPage()};
 $('#msar-dir').onclick=()=>{S.dir=S.dir==='asc'?'desc':'asc';$('#msar-dir').textContent=S.dir==='asc'?'A → Z':'Z → A';loadPage()};
 $('#msar-page-size').onchange=e=>{S.pageSize=Number(e.target.value||50);S.page=1;loadPage()};
 $('#msar-prev').onclick=()=>{if(S.page>1){S.page--;loadPage()}};
 $('#msar-next').onclick=()=>{if(S.page<S.pages){S.page++;loadPage()}};
 $('#msar-filter-open').onclick=()=>{$('#msar-filter-panel').hidden=false;syncFilterControls();$('#msar-filter-panel').scrollIntoView({behavior:'smooth',block:'nearest'})};
 $('#msar-filter-close').onclick=()=>{$('#msar-filter-panel').hidden=true};
 $('#msar-filter-apply').onclick=()=>{readFilterControls();S.page=1;loadPage();$('#msar-filter-panel').hidden=true};
 $('#msar-filter-reset').onclick=()=>{S.filters=emptyFilters();syncFilterControls();S.page=1;loadPage()};
 $$('[data-msar-class]').forEach(b=>b.onclick=()=>{const v=b.dataset.msarClass,i=S.filters.classes.indexOf(v);if(i>=0)S.filters.classes.splice(i,1);else S.filters.classes.push(v);b.classList.toggle('on',S.filters.classes.includes(v))});
 $$('[data-msar-tenure]').forEach(b=>b.onclick=()=>{const v=b.dataset.msarTenure,i=S.filters.tenure_buckets.indexOf(v);if(i>=0)S.filters.tenure_buckets.splice(i,1);else S.filters.tenure_buckets.push(v);b.classList.toggle('on',S.filters.tenure_buckets.includes(v))});
 $('#msar-all-visible').onclick=()=>{S.rows.forEach(r=>S.selected.add(r.pams_pin));paintRows();updateCount()};
 $('#msar-clear-visible').onclick=()=>{S.rows.forEach(r=>S.selected.delete(r.pams_pin));paintRows();updateCount()};
 $('#msar-all-matching').onclick=()=>{S.filteredKeys.forEach(k=>S.selected.add(k));paintRows();updateCount()};
 $('#msar-clear-matching').onclick=()=>{S.filteredKeys.forEach(k=>S.selected.delete(k));paintRows();updateCount()};
 $('#msar-reset-selection').onclick=()=>{S.selected=new Set(S.keys);paintRows();updateCount()};
 $('#msar-save').onclick=()=>saveAndContinue(true);
 document.addEventListener('click',e=>{const next=e.target.closest?.('.mw-next');if(next&&document.body.dataset.msWizard==='audience-review'){e.preventDefault();saveAndContinue(true)}});
}
function readFilterControls(){
 S.filters.year_built_min=fieldNum('#msar-year-min');S.filters.year_built_max=fieldNum('#msar-year-max');
 S.filters.assessment_min=fieldNum('#msar-assessment-min');S.filters.assessment_max=fieldNum('#msar-assessment-max');
 S.filters.tax_min=fieldNum('#msar-tax-min');S.filters.tax_max=fieldNum('#msar-tax-max');
 S.filters.acres_min=fieldNum('#msar-acres-min');S.filters.acres_max=fieldNum('#msar-acres-max');
 S.filters.units_min=fieldNum('#msar-units-min');S.filters.units_max=fieldNum('#msar-units-max');
 S.filters.sale_year_min=fieldNum('#msar-sale-year-min');S.filters.sale_year_max=fieldNum('#msar-sale-year-max');
 S.filters.watchdog_score_min=fieldNum('#msar-watchdog-min');S.filters.tax_pressure_min=fieldNum('#msar-tax-pressure-min');
 S.filters.revaluation_risk_min=fieldNum('#msar-revaluation-min');S.filters.uniformity_score_min=fieldNum('#msar-uniformity-min');
 S.filters.keyword=String($('#msar-keyword')?.value||'').trim();S.filters.include_unknown=!!$('#msar-include-unknown')?.checked;
}
function setVal(id,v){const el=$(id);if(el)el.value=v==null?'':v}
function syncFilterControls(){
 const f=S.filters;
 setVal('#msar-year-min',f.year_built_min);setVal('#msar-year-max',f.year_built_max);setVal('#msar-assessment-min',f.assessment_min);setVal('#msar-assessment-max',f.assessment_max);
 setVal('#msar-tax-min',f.tax_min);setVal('#msar-tax-max',f.tax_max);setVal('#msar-acres-min',f.acres_min);setVal('#msar-acres-max',f.acres_max);setVal('#msar-units-min',f.units_min);setVal('#msar-units-max',f.units_max);
 setVal('#msar-sale-year-min',f.sale_year_min);setVal('#msar-sale-year-max',f.sale_year_max);setVal('#msar-watchdog-min',f.watchdog_score_min);setVal('#msar-tax-pressure-min',f.tax_pressure_min);setVal('#msar-revaluation-min',f.revaluation_risk_min);setVal('#msar-uniformity-min',f.uniformity_score_min);setVal('#msar-keyword',f.keyword);
 if($('#msar-include-unknown'))$('#msar-include-unknown').checked=!!f.include_unknown;
 $$('[data-msar-class]').forEach(b=>b.classList.toggle('on',f.classes.includes(b.dataset.msarClass)));
 $$('[data-msar-tenure]').forEach(b=>b.classList.toggle('on',f.tenure_buckets.includes(b.dataset.msarTenure)));
 paintFilterSummary();
}
function paintFilterSummary(){
 const parts=filterSummary(),host=$('#msar-filter-summary'),badge=$('#msar-filter-count'),count=activeFilterCount();
 if(badge){badge.hidden=!count;badge.textContent=count}
 if(!host)return;
 host.hidden=!parts.length;
 host.innerHTML=parts.length?`<span>Active filters</span>${parts.map(x=>`<b>${esc(x)}</b>`).join('')}`:'';
}
function updateCount(){
 const n=S.selected.size;
 $('#msar-selected').textContent=fmt(n);$('#msar-total').textContent=`${fmt(S.keys.length)} properties loaded`;$('#msar-source').textContent=S.sourceLabel;
 $('#msar-selection-note').textContent=`${fmt(n)} of ${fmt(S.keys.length)} included · ${fmt(S.total)} match current filters`;
 const save=$('#msar-save');if(save){save.disabled=!n;save.textContent=n?`Save ${fmt(n)} homes & continue`:'Choose at least one home'}
}
function insight(label,value,sub=''){return `<div><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>`}
function paintInsights(){
 const i=S.insights||{},host=$('#msar-insights');if(!host)return;
 const fc=Number(i.filtered_count||0),owned=Number(i.owned_15_plus||0),ownedPct=fc?Math.round(owned/fc*100):0;
 host.innerHTML=`${insight('Matching properties',fmt(fc),'after current filters')}${insight('Median assessment',money(i.median_assessment))}${insight('Median annual tax',money(i.median_tax))}${insight('Median year built',i.median_year_built==null?'—':String(Math.round(Number(i.median_year_built))))}${insight('Avg Watchdog score',score(i.avg_watchdog_score),'when observed')}${insight('15+ years since sale',fmt(owned),fc?`${ownedPct}% of matches`:'')}`;
}
async function loadPage(){
 if(S.loading)return;S.loading=true;
 $('#msar-body').innerHTML='<tr><td colspan="15" class="msar-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading properties…</td></tr>';
 try{
  const d=await rpc('marketing_audience_review_filtered_page',{p_campaign_id:campaign(),p_search:S.search,p_filters:S.filters,p_page:S.page,p_page_size:S.pageSize,p_sort:S.sort,p_dir:S.dir});
  S.rows=Array.isArray(d?.rows)?d.rows:[];S.filteredKeys=Array.isArray(d?.filtered_keys)?d.filtered_keys:[];S.insights=d?.insights||{};S.total=Number(d?.total||0);S.pages=Number(d?.pages||1);S.page=Math.min(Math.max(1,Number(d?.page||S.page)),S.pages);
  paintRows();paintPager();paintInsights();paintFilterSummary();updateCount();
 }catch(e){$('#msar-body').innerHTML=`<tr><td colspan="15" class="msar-loading">${esc(e?.message||'Could not load audience data.')}</td></tr>`}
 finally{S.loading=false}
}
function rowHTML(r){
 const checked=S.selected.has(r.pams_pin),sale=r.last_sale_year?`${r.last_sale_year}${r.last_sale_price?` · ${money(r.last_sale_price)}`:''}`:'—';
 return `<tr data-msar-row="${esc(r.pams_pin)}" class="${checked?'is-included':'is-excluded'}"><td class="check"><input type="checkbox" data-msar-check="${esc(r.pams_pin)}" ${checked?'checked':''}></td><td><b>${esc(r.address||'Address unavailable')}</b><small>${esc(r.pams_pin)}</small></td><td>${esc(r.town||'—')}<small>${esc([r.county,r.zip].filter(Boolean).join(' · '))}</small></td><td>${esc(propClassLabel(r.prop_class))}</td><td>${r.year_built||'—'}</td><td>${esc(r.building_desc||'—')}</td><td>${num(r.acres)}</td><td>${r.dwelling_units??'—'}</td><td>${money(r.assessed_value)}</td><td>${money(r.last_year_tax)}</td><td>${esc(sale)}</td><td>${r.years_since_sale??'—'}</td><td><strong class="msar-signal">${score(r.watchdog_score)}</strong></td><td><strong class="msar-signal">${score(r.tax_pressure)}</strong></td><td><button type="button" class="msar-inspect" data-msar-inspect="${esc(r.pams_pin)}">Inspect</button></td></tr>`;
}
function paintRows(){
 const body=$('#msar-body');if(!body)return;
 body.innerHTML=S.rows.length?S.rows.map(rowHTML).join(''):'<tr><td colspan="15" class="msar-loading">No properties match these filters. Reset a filter or broaden the range.</td></tr>';
 $$('[data-msar-check]',body).forEach(x=>x.onchange=()=>{if(x.checked)S.selected.add(x.dataset.msarCheck);else S.selected.delete(x.dataset.msarCheck);x.closest('tr')?.classList.toggle('is-included',x.checked);x.closest('tr')?.classList.toggle('is-excluded',!x.checked);updateCount()});
 $$('[data-msar-inspect]',body).forEach(x=>x.onclick=()=>inspect(x.dataset.msarInspect));
}
function paintPager(){$('#msar-page').textContent=`Page ${S.page} of ${S.pages} · ${fmt(S.total)} matching`;$('#msar-prev').disabled=S.page<=1;$('#msar-next').disabled=S.page>=S.pages}
function stat(label,value){return `<div><span>${esc(label)}</span><b>${esc(value==null||value===''?'—':value)}</b></div>`}
function inspect(pin){
 const r=S.rows.find(x=>x.pams_pin===pin),host=$('#msar-detail');if(!r||!host)return;
 const deed=r.years_since_sale!=null?`${r.years_since_sale} years since recorded sale`:'Recorded sale date unavailable';
 const eff=Number(r.assessed_value)>0&&r.last_year_tax!=null?`${(Number(r.last_year_tax)/Number(r.assessed_value)*100).toFixed(3)}%`:'—';
 host.hidden=false;
 host.innerHTML=`<div class="msar-detail-head"><div><span>PROPERTY DETAIL</span><h3>${esc(r.address||r.pams_pin)}</h3><p>${esc([r.town,r.county,r.zip].filter(Boolean).join(' · '))}</p></div><button type="button" id="msar-detail-close">×</button></div><div class="msar-detail-grid">${stat('Watchdog score',score(r.watchdog_score))}${stat('Tax pressure',score(r.tax_pressure))}${stat('Revaluation risk',score(r.revaluation_risk))}${stat('Uniformity score',score(r.uniformity_score))}${stat('Property class',propClassLabel(r.prop_class))}${stat('Year built',r.year_built)}${stat('Building',r.building_desc)}${stat('Square feet',r.square_feet?fmt(r.square_feet):'Not in current statewide parcel feed')}${stat('Acres',r.acres)}${stat('Dwelling units',r.dwelling_units)}${stat('Assessment',money(r.assessed_value))}${stat('Land value',money(r.land_value))}${stat('Improvement value',money(r.improvement_value))}${stat('Last year tax',money(r.last_year_tax))}${stat('Tax / assessment rate',eff)}${stat('Last sale',r.last_sale_year?`${r.last_sale_year}${r.last_sale_price?` · ${money(r.last_sale_price)}`:''}`:'—')}${stat('Recorded-sale tenure signal',deed)}${stat('Block / Lot',[r.block,r.lot,r.qualifier].filter(Boolean).join(' / '))}</div><div class="msar-detail-note"><i class="fas fa-circle-info"></i><span>Years since sale comes from recorded deed data. It is useful as an ownership-duration signal, but it does not prove the current owner has occupied the property for that full period. Watchdog signals appear only when a current observation is available.</span></div>`;
 $('#msar-detail-close').onclick=()=>host.hidden=true;host.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function saveAndContinue(go){
 const b=$('#msar-save');if(!S.selected.size){toast('Choose at least one home.');return}
 const old=b?.innerHTML;if(b){b.disabled=true;b.textContent='Saving audience…'}
 try{
  await rpc('marketing_audience_hub_apply_keys',{p_campaign_id:campaign(),p_property_keys:[...S.selected],p_source_type:'audience_review',p_source_ref:'refined',p_source_label:`Refined · ${S.sourceLabel}`,p_limit:Math.max(S.selected.size,1),p_qualification_summary:{reviewed:true,original_count:S.keys.length,selected_count:S.selected.size,filtered_count:S.total,source_label:S.sourceLabel,filters:S.filters,search:S.search}});
  toast('Audience saved.');if(go)setTimeout(()=>location.href=`/property/marketing-studio-design.html?campaign=${encodeURIComponent(campaign())}`,220);
 }catch(e){toast(e?.message||'Could not save this audience.')}
 finally{if(b?.isConnected){b.disabled=false;b.innerHTML=old||'Save audience & continue';updateCount()}}
}
async function init(){
 try{
  await window.njptrAccessReady;S.client=window.NJPTRAccess.client();
  const boot=await rpc('marketing_studio_bootstrap');S.campaignId=new URLSearchParams(location.search).get('campaign')||(boot?.campaigns||[])[0]?.id||null;if(!S.campaignId)return;
  shell();const d=await rpc('marketing_audience_review_keys',{p_campaign_id:S.campaignId});S.keys=Array.isArray(d?.keys)?d.keys:[];S.filteredKeys=[...S.keys];S.selected=new Set(S.keys);S.sourceLabel=d?.source_label||'Current campaign audience';
  syncFilterControls();updateCount();await loadPage();
 }catch(e){console.warn('Audience Review unavailable',e);shell();$('#msar-body').innerHTML=`<tr><td colspan="15" class="msar-loading">${esc(e?.message||'Audience Review could not load.')}</td></tr>`}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();
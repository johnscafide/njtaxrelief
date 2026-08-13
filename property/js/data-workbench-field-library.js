(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
let catalog=null, busy=false;
const enabledTiers=new Set(['standard','agent','pro','pro_plus']);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const tierLabel=t=>t==='pro_plus'?'PRO+':t==='pro'?'PRO':t==='agent'?'AGENT':'STANDARD';
const categoryLabel=m=>{
  const raw=String(m?.category||'').toLowerCase();
  const id=String(m?.id||'').toLowerCase();
  const s=raw+' '+id;
  if(/appeal|chapter.?123|uniform/.test(s))return'Appeal & Assessment Equity';
  if(/flood|environment|wetland|hazard/.test(s))return'Flood & Environmental';
  if(/permit|construction/.test(s))return'Permits & Construction';
  if(/owner|mailing|ownership/.test(s))return'Ownership & Mailing';
  if(/assessment|assessed|valuation/.test(s))return'Assessment & Valuation';
  if(/(^|\s)tax|tax_/.test(s))return'Property Tax';
  if(/sale|deed|transfer/.test(s))return'Sales & Deeds';
  if(/building|structure|dwelling/.test(s))return'Building & Improvements';
  if(/parcel|lot|block|acre|property\.address|municipality|county|zip|pams/.test(s))return'Parcel & Location';
  if(/market|comp|price/.test(s))return'Market Intelligence';
  if(/mortgage|lien|finance|loan/.test(s))return'Finance & Liens';
  if(/watchdog|score|signal|risk|derived/.test(s))return'Watchdog Intelligence';
  return'Other Property Data';
};
const order=['Parcel & Location','Ownership & Mailing','Assessment & Valuation','Property Tax','Sales & Deeds','Building & Improvements','Appeal & Assessment Equity','Flood & Environmental','Permits & Construction','Market Intelligence','Finance & Liens','Watchdog Intelligence','Other Property Data'];
async function getCatalog(){
  if(catalog)return catalog;
  try{const r=await fetch('/property/data/marker-registry.json',{cache:'no-store'});if(r.ok)catalog=await r.json();}catch(_){ }
  return catalog||{markers:[]};
}
function markerMap(){return new Map((catalog?.markers||[]).map(m=>[m.id,m]));}
function updateCounts(host){
  $$('.dw-field-category',host).forEach(group=>{
    const all=$$('.dw-field',group), visible=all.filter(x=>!x.hidden);
    const shown=$('.dw-field-category-shown',group), total=$('.dw-field-category-total',group);
    if(shown)shown.textContent=visible.length+' shown';
    if(total)total.textContent=all.length+' fields';
    group.hidden=visible.length===0;
  });
}
function applyTierFilter(host){
  $$('.dw-field',host).forEach(label=>{
    const tier=label.dataset.fieldTier||'standard';
    label.hidden=!enabledTiers.has(tier);
  });
  updateCounts(host);
}
function setOpen(group,open,exclusive){
  if(exclusive&&open){$$('.dw-field-category.open',group.parentElement).forEach(g=>{if(g!==group){g.classList.remove('open');$('.dw-field-category-toggle',g)?.setAttribute('aria-expanded','false');}});}
  group.classList.toggle('open',open);
  $('.dw-field-category-toggle',group)?.setAttribute('aria-expanded',open?'true':'false');
}
async function organize(){
  if(busy)return;
  const host=$('#dw-fields-list');
  if(!host)return;
  const rawLabels=$$('.dw-field',host).filter(x=>!x.closest('.dw-field-category'));
  if(!rawLabels.length)return;
  busy=true;
  await getCatalog();
  const byId=markerMap(), groups=new Map();
  rawLabels.forEach(label=>{
    const input=$('[data-field]',label); if(!input)return;
    const m=byId.get(input.dataset.field)||{id:input.dataset.field,category:'other',tier:'pro_plus'};
    const cat=categoryLabel(m), tier=String(m.tier||'standard');
    label.dataset.fieldTier=tier;
    label.dataset.fieldCategory=cat;
    if(!groups.has(cat))groups.set(cat,[]);
    groups.get(cat).push(label);
  });
  host.innerHTML='';
  const filters=document.createElement('div');
  filters.className='dw-field-access-filter';
  filters.innerHTML='<div><span>ACCESS LEVELS</span><small>Filter the library without changing your plan.</small></div><div class="dw-field-access-options">'+['standard','agent','pro','pro_plus'].map(t=>`<label><input type="checkbox" value="${t}" checked><span>${tierLabel(t)}</span></label>`).join('')+'</div>';
  host.appendChild(filters);
  $$('input',filters).forEach(cb=>cb.addEventListener('change',()=>{cb.checked?enabledTiers.add(cb.value):enabledTiers.delete(cb.value);applyTierFilter(host);}));
  const searching=String($('#dw-field-search')?.value||'').trim().length>0;
  [...groups.keys()].sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b)}).forEach(cat=>{
    const section=document.createElement('section');
    section.className='dw-field-category'+(searching?' open':'');
    section.innerHTML=`<button type="button" class="dw-field-category-toggle" aria-expanded="${searching?'true':'false'}"><span class="dw-field-category-title"><b>${esc(cat)}</b><small class="dw-field-category-total">${groups.get(cat).length} fields</small></span><span class="dw-field-category-shown">${groups.get(cat).length} shown</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button><div class="dw-field-category-body"></div>`;
    const body=$('.dw-field-category-body',section);
    groups.get(cat).forEach(label=>body.appendChild(label));
    $('.dw-field-category-toggle',section).addEventListener('click',()=>setOpen(section,!section.classList.contains('open'),!searching));
    host.appendChild(section);
  });
  applyTierFilter(host);
  host.dataset.fieldLibrary='categorized';
  busy=false;
}
function watch(){
  const panel=$('#dw-field-panel');
  if(!panel)return false;
  const mo=new MutationObserver(()=>setTimeout(organize,0));
  mo.observe(panel,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('#dw-fields'))setTimeout(organize,0);});
  document.addEventListener('input',e=>{if(e.target.id==='dw-field-search')setTimeout(organize,0);});
  setTimeout(organize,0);
  return true;
}
function start(){if(watch())return;const mo=new MutationObserver(()=>{if(watch())mo.disconnect();});mo.observe(document.documentElement,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

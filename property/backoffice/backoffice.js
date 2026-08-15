(function(){
'use strict';
let client=null;
let leads=[];
let selectedId=null;
let searchTerm='';
let activeFilter='all';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,fallback='—')=>v===null||v===undefined||String(v).trim()===''?fallback:String(v);
const num=(v)=>v===null||v===undefined||v===''?null:Number(v);
function money(v){const n=num(v);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'—'}
function date(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function ago(v){if(!v)return '';const delta=Date.now()-new Date(v).getTime();if(!Number.isFinite(delta))return '';const mins=Math.max(0,Math.floor(delta/60000));if(mins<1)return 'now';if(mins<60)return mins+'m';const hrs=Math.floor(mins/60);if(hrs<24)return hrs+'h';const days=Math.floor(hrs/24);if(days<7)return days+'d';return new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function normalizePhone(v){const raw=String(v||'').trim();const d=raw.replace(/\D/g,'');if(d.length===10)return '+1'+d;if(d.length===11&&d[0]==='1')return '+'+d;return raw}
function normalizeEmail(v){return String(v||'').trim().toLowerCase()}
function slug(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function tagsFor(d){const out=new Set(['watchdog']);if(/anchor/i.test(d.program||''))out.add('anchor');if(d.tenure)out.add(slug(d.tenure));const intent=num(d.intent_score);if(Number.isFinite(intent)){out.add('intent-'+Math.round(intent));if(intent>=40)out.add('intent-engaged')}const benefit=num(d.estimated_benefit);if(Number.isFinite(benefit)&&benefit>0)out.add('benefit-'+Math.round(benefit));return Array.from(out).filter(Boolean)}
function statusTone(status){const s=String(status||'').toLowerCase();if(['verified','matched','ready','synced','qualified'].includes(s))return 'ok';if(['error','no_match'].includes(s))return 'err';return 'warn'}
function needsAttention(l){return ['review','error'].includes(l.processing_status)||['review','error'].includes(l.address_status)||['review','error','no_match'].includes(l.identity_status)||l.crm_status==='error'}
function toast(msg){const el=$('#bo-toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)}
function setStats(){
 $('#stat-total').textContent=leads.length.toLocaleString();
 $('#stat-review').textContent=leads.filter(needsAttention).length.toLocaleString();
 $('#stat-synced').textContent=leads.filter(l=>l.crm_status==='synced').length.toLocaleString();
 $('#stat-high-intent').textContent=leads.filter(l=>Number(l.intent_score)>=40).length.toLocaleString();
}
function visibleLeads(){return leads.filter(l=>{
 const hay=[l.full_name,l.email,l.phone,l.submitted_address,l.standardized_address,l.source,l.program].join(' ').toLowerCase();
 if(searchTerm&&!hay.includes(searchTerm))return false;
 if(activeFilter==='attention'&&!needsAttention(l))return false;
 if(activeFilter==='new'&&l.lead_status!=='new')return false;
 if(activeFilter==='synced'&&l.crm_status!=='synced')return false;
 if(activeFilter==='high-intent'&&Number(l.intent_score)<40)return false;
 return true;
 })}
function leadFlags(l){const flags=[];if(Number(l.intent_score)>=40)flags.push('<span class="bo-pill intent">Intent '+esc(l.intent_score)+'</span>');if(l.crm_status==='synced')flags.push('<span class="bo-pill synced">CRM synced</span>');if(needsAttention(l))flags.push('<span class="bo-pill attn">Needs review</span>');if(!flags.length)flags.push('<span class="bo-pill">'+esc(text(l.processing_status,'pending'))+'</span>');return flags.join('')}
function renderList(){const list=$('#lead-list');const rows=visibleLeads();$('#queue-count').textContent=rows.length.toLocaleString();if(!rows.length){list.innerHTML='<div class="bo-no-leads"><b>No leads match this view.</b><br><span>Use Add lead to test the pipeline or change the filters.</span></div>';return}list.innerHTML=rows.map(l=>`<button type="button" class="bo-lead-card ${l.id===selectedId?'active':''}" data-lead-id="${esc(l.id)}"><div class="bo-lead-top"><span class="bo-lead-name">${esc(text(l.full_name,'Unnamed lead'))}</span><span class="bo-lead-time">${esc(ago(l.created_at))}</span></div><div class="bo-lead-meta">${esc(text(l.submitted_address,l.email||l.phone||'No contact detail'))}</div><div class="bo-lead-flags">${leadFlags(l)}</div></button>`).join('');$$('[data-lead-id]',list).forEach(b=>b.addEventListener('click',()=>selectLead(b.dataset.leadId)))}
function field(label,value){return `<div class="bo-field"><span>${esc(label)}</span><b>${esc(text(value))}</b></div>`}
function panel(title,status,body,wide=false){return `<section class="bo-panel ${wide?'wide':''}"><div class="bo-panel-title"><span>${esc(title)}</span><em class="bo-status ${statusTone(status)}">${esc(text(status,'pending'))}</em></div>${body}</section>`}
function crmBrief(l){return [
 `Name: ${text(l.full_name,'')}`,
 `Email: ${text(l.email,'')}`,
 `Phone: ${text(l.phone,'')}`,
 `Submitted address: ${text(l.submitted_address,'')}`,
 `Standardized address: ${text(l.standardized_address,'Pending validation')}`,
 `Program: ${text(l.program,'')}`,
 `Tenure: ${text(l.tenure,'')}`,
 `Household income: ${text(l.household_income,'')}`,
 `Intent: ${text(l.intent_score,'')}${l.intent_label?' '+l.intent_label:''}`,
 `Estimated benefit: ${money(l.estimated_benefit)}`,
 `Hashtags: ${(l.tags||[]).map(t=>'#'+t).join(' ')}`,
 `Source: ${text(l.source,'')}`,
 `Notes: ${text(l.notes,'')}`
 ].join('\n')}
async function copyBrief(l){try{await navigator.clipboard.writeText(crmBrief(l));toast('CRM brief copied')}catch(e){console.warn(e);toast('Copy failed') }}
async function recordEvent(leadId,eventType,status,provider,details){const r=await client.from('backoffice_lead_events').insert({lead_id:leadId,event_type:eventType,status:status||null,provider:provider||null,details:details||{}});if(r.error)throw r.error}
async function updateLead(id,patch,eventType){const r=await client.from('backoffice_leads').update(patch).eq('id',id).select('*').single();if(r.error)throw r.error;const i=leads.findIndex(x=>x.id===id);if(i>=0)leads[i]=r.data;if(eventType)await recordEvent(id,eventType,patch.processing_status||patch.lead_status||null,'backoffice',patch);setStats();renderList();await selectLead(id,true)}
async function renderDetail(l){const host=$('#lead-detail');host.innerHTML='<div class="bo-loading">Loading lead detail…</div>';let events=[];const ev=await client.from('backoffice_lead_events').select('*').eq('lead_id',l.id).order('created_at',{ascending:false}).limit(30);if(!ev.error)events=ev.data||[];
 const tags=(l.tags||[]).length?`<div class="bo-tags">${l.tags.map(t=>`<span class="bo-tag">#${esc(t)}</span>`).join('')}</div>`:'<span class="bo-lead-meta">No tags yet</span>';
 const eventHtml=events.length?events.map(e=>`<div class="bo-event"><span class="bo-event-dot"></span><div><b>${esc(text(e.event_type,'Activity'))}</b><span>${esc([e.provider,e.status].filter(Boolean).join(' · ')||'Watchdog')}</span></div><time>${esc(date(e.created_at))}</time></div>`).join(''):'<div class="bo-lead-meta">No activity recorded yet.</div>';
 host.innerHTML=`<div class="bo-detail-head"><div><span class="bo-kicker">${esc(String(l.source||'lead').toUpperCase())}</span><h2>${esc(text(l.full_name,'Unnamed lead'))}</h2><p>${esc(text(l.email,l.phone||'No email or phone'))}</p></div><div class="bo-detail-actions"><button type="button" class="bo-button bo-button-quiet" id="copy-crm">Copy CRM brief</button><button type="button" class="bo-button bo-button-quiet" id="mark-reviewed">Mark reviewed</button></div></div><div class="bo-detail-body"><div class="bo-detail-grid">${panel('SUBMITTED','original',field('Address',l.submitted_address)+field('Phone',l.phone)+field('Email',l.email)+field('Tenure',l.tenure)+field('Income',l.household_income))}${panel('STANDARDIZED ADDRESS',l.address_status,field('Address',l.standardized_address)+field('Provider',l.standardized_address?'Connected result':'Awaiting provider')+field('Status',l.address_status))}${panel('LEAD SIGNAL',l.processing_status,field('Program',l.program)+field('Intent',l.intent_score)+field('Intent label',l.intent_label)+field('Est. benefit',money(l.estimated_benefit)))}${panel('IDENTITY CHECK',l.identity_status,field('Match score',l.identity_score==null?'Pending':l.identity_score+'%')+field('Provider',l.enrichment_provider||'Awaiting provider')+field('Status',l.identity_status))}${panel('BOLDTRAIL CRM',l.crm_status,field('Status',l.crm_status)+field('Contact ID',l.crm_contact_id)+field('Synced',l.crm_synced_at?date(l.crm_synced_at):'Pending')+(l.crm_error?field('Error',l.crm_error):''))}${panel('HASHTAGS','ready',tags)}${panel('ACTIVITY','audit',`<div class="bo-event-list">${eventHtml}</div>`,true)}</div></div>`;
 $('#copy-crm',host).addEventListener('click',()=>copyBrief(l));$('#mark-reviewed',host).addEventListener('click',async()=>{try{await updateLead(l.id,{processing_status:'ready'},'lead.reviewed');toast('Lead marked reviewed')}catch(e){toast(e.message||'Update failed')}})
}
async function selectLead(id,force=false){if(!force&&selectedId===id)return;selectedId=id;renderList();const l=leads.find(x=>x.id===id);if(l)await renderDetail(l)}
async function loadLeads(){const btn=$('#bo-refresh');if(btn)btn.disabled=true;try{const r=await client.from('backoffice_leads').select('*').order('created_at',{ascending:false}).limit(500);if(r.error)throw r.error;leads=r.data||[];setStats();renderList();if(selectedId&&leads.some(l=>l.id===selectedId))await selectLead(selectedId,true);else if(leads.length)await selectLead(leads[0].id,true);else{$('#lead-detail').innerHTML='<div class="bo-empty-detail"><span>LEAD DETAIL</span><h2>Your backoffice is ready</h2><p>No lead records have been stored yet. Add a manual test lead or connect a server-side source to the secure ingest function.</p></div>'}}catch(e){console.error(e);$('#lead-list').innerHTML=`<div class="bo-no-leads"><b>Lead queue could not load.</b><br><span>${esc(e.message||'Try again.')}</span></div>`}finally{if(btn)btn.disabled=false}}
function openDialog(){const d=$('#lead-dialog');$('#lead-form-error').textContent='';if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','')}
function closeDialog(){const d=$('#lead-dialog');if(d.open&&typeof d.close==='function')d.close();else d.removeAttribute('open')}
async function saveLead(form){const fd=new FormData(form);const raw=Object.fromEntries(fd.entries());const intent=raw.intent_score===''?null:Math.max(0,Math.min(100,Number(raw.intent_score)));const benefit=raw.estimated_benefit===''?null:Math.max(0,Number(raw.estimated_benefit));const data={source:String(raw.source||'manual').trim()||'manual',full_name:String(raw.full_name||'').trim(),email:normalizeEmail(raw.email)||null,phone:normalizePhone(raw.phone)||null,submitted_address:String(raw.submitted_address||'').trim()||null,tenure:String(raw.tenure||'').trim()||null,household_income:String(raw.household_income||'').trim()||null,program:String(raw.program||'').trim()||null,intent_score:Number.isFinite(intent)?intent:null,intent_label:Number.isFinite(intent)&&intent>=40?'ENGAGED':null,estimated_benefit:Number.isFinite(benefit)?benefit:null,notes:String(raw.notes||'').trim()||null,processing_status:'pending',address_status:'pending',identity_status:'pending',crm_status:'pending'};data.tags=tagsFor(data);data.raw_payload={ingest:'manual-backoffice',submitted_at:new Date().toISOString()};if(!data.full_name&&!data.email&&!data.phone)throw new Error('Add a name, email or phone.');const r=await client.from('backoffice_leads').insert(data).select('*').single();if(r.error)throw r.error;await recordEvent(r.data.id,'lead.created','pending','manual',{source:data.source});leads.unshift(r.data);setStats();renderList();closeDialog();form.reset();form.elements.program.value='ANCHOR Estimator';form.elements.source.value='manual';await selectLead(r.data.id,true);toast('Lead added')}
async function init(){try{await window.njptrAccessReady;client=window.NJPTRAccess.client();$('#bo-refresh').addEventListener('click',loadLeads);$('#bo-add').addEventListener('click',openDialog);$('#lead-dialog-close').addEventListener('click',closeDialog);$('#lead-dialog-cancel').addEventListener('click',closeDialog);$('#lead-search').addEventListener('input',e=>{searchTerm=e.target.value.trim().toLowerCase();renderList()});$('#lead-filter').addEventListener('change',e=>{activeFilter=e.target.value;renderList()});$('#lead-form').addEventListener('submit',async e=>{e.preventDefault();const save=$('#lead-save');const err=$('#lead-form-error');save.disabled=true;err.textContent='';try{await saveLead(e.currentTarget)}catch(ex){console.error(ex);err.textContent=ex.message||'Lead could not be saved.'}finally{save.disabled=false}});await loadLeads()}catch(e){console.error('[Backoffice]',e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

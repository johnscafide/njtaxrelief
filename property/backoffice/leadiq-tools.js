(function(){
'use strict';

const state={rows:[],view:[],files:[],filter:'all',search:'',headers:[],mapping:{},batchAllChannelConsent:false};
const $=(s,r=document)=>r.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=(v)=>String(v??'').replace(/\uFEFF/g,'').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const ALIASES={
  first:['firstname','first','givenname','contactfirstname'],
  last:['lastname','last','surname','familyname','contactlastname'],
  full:['fullname','name','contactname','displayname'],
  email:['email','emailaddress','primaryemail','contactemail','email1'],
  phone:['phone','phonenumber','mobile','mobilephone','cell','cellphone','primaryphone','contactphone'],
  street:['streetaddress','address','address1','street','propertyaddress','mailingaddress','homeaddress'],
  city:['city','town','municipality','mailingcity'],
  state:['state','province','region','mailingstate'],
  zip:['zip','zipcode','postalcode','postcode','mailingzip'],
  source:['source','leadsource','contactsource'],
  tags:['tags','hashtags','tag'],
  notes:['notes','agentnotes','comments','comment','description'],
  emailOptIn:['optinemail','emailoptin','emailoptedin','emailconsent'],
  callOptIn:['optincall','calloptin','phoneoptin','callconsent'],
  smsOptIn:['optinsms','smsoptin','textoptin','textnumberoptin','smsconsent']
};
const BOLDTRAIL_HEADERS=['First Name','Last Name','Email','Phone','Street Address','City','State','Postal Code','Source','Status','Hashtags','Notes','Watchdog Lead ID','Program','Intent Score','Estimated Benefit','Tenure','Household Income','Address Validation Status','Opt in Email','Opt in Call','Opt in SMS'];

function toast(message){let t=$('#leadiq-toast');if(!t){t=document.createElement('div');t.id='leadiq-toast';t.className='li-toast';document.body.appendChild(t)}t.textContent=message;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400)}
function csvCell(value){const s=String(value??'').replace(/\r?\n/g,' ');return `"${s.replace(/"/g,'""')}"`}
function parseCsv(text){
  text=String(text||'').replace(/^\uFEFF/,'');
  const out=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"'){quoted=false}else cell+=ch;continue}
    if(ch==='"'){quoted=true;continue}
    if(ch===','){row.push(cell);cell='';continue}
    if(ch==='\n'){row.push(cell);if(row.some(v=>clean(v)!==''))out.push(row);row=[];cell='';continue}
    if(ch==='\r')continue;
    cell+=ch;
  }
  row.push(cell);if(row.some(v=>clean(v)!==''))out.push(row);
  if(!out.length)return {headers:[],records:[]};
  const headers=out[0].map((h,i)=>clean(h)||`Column ${i+1}`);
  const records=out.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
  return {headers,records};
}
function infer(headers){
  const norm=headers.map(h=>({h,k:key(h)})),map={},used=new Set();
  for(const [field,aliases] of Object.entries(ALIASES)){
    const available=norm.filter(x=>!used.has(x.h));
    const hit=available.find(x=>aliases.includes(x.k))||available.find(x=>aliases.some(a=>a.length>=4&&x.k.includes(a)));
    if(hit){map[field]=hit.h;used.add(hit.h)}
  }
  return map;
}
function val(raw,field,map){return map[field]?clean(raw[map[field]]):''}
function parseOptIn(v){
  const s=clean(v).toLowerCase();
  if(!s)return null;
  if(['1','true','yes','y','on','opted in','opt-in','subscribed'].includes(s))return true;
  if(['0','false','no','n','off','opted out','opt-out','unsubscribed'].includes(s))return false;
  return null;
}
function exportOptIn(explicit){return state.batchAllChannelConsent||explicit===true?'1':'0'}
function normalizePhone(v){const digits=clean(v).replace(/\D/g,'');const d=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;if(d.length===10)return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;return clean(v)}
function normalizeZip(v){const m=clean(v).match(/\b(\d{5})(?:-?(\d{4}))?\b/);return m?m[1]+(m[2]?'-'+m[2]:''):clean(v)}
function splitName(full){
  const value=clean(full),p=value.split(/\s+/).filter(Boolean);
  if(p.length<2)return {first:p[0]||'',last:''};
  if(/\band\b/i.test(value))return {first:p.slice(0,-1).join(' '),last:p[p.length-1]};
  return {first:p[0],last:p.slice(1).join(' ')};
}
function normalizeNameFields(first,last,full){
  first=clean(first);last=clean(last);
  const suppliedFull=clean(full);
  full=suppliedFull||(first&&last&&key(first)===key(last)?first:[first,last].filter(Boolean).join(' '));
  if(first&&last&&key(first)===key(last)){
    const split=splitName(full||first);first=split.first;last=split.last;
  }else if(!first&&!last&&full){
    const split=splitName(full);first=split.first;last=split.last;
  }else if(!first&&full){first=splitName(full).first}
  else if(!last&&full){last=splitName(full).last}
  return {first,last,full:full||[first,last].filter(Boolean).join(' ')};
}
function normalizeRow(raw,map,file,index){
  const names=normalizeNameFields(val(raw,'first',map),val(raw,'last',map),val(raw,'full',map));
  const {first,last,full}=names;
  const email=val(raw,'email',map).toLowerCase();
  const phone=normalizePhone(val(raw,'phone',map));
  const street=val(raw,'street',map),city=val(raw,'city',map),explicitState=val(raw,'state',map),zip=normalizeZip(val(raw,'zip',map)),hasAddress=!!(street||city||zip),stateName=(explicitState||(hasAddress?'NJ':'')).toUpperCase();
  const address=hasAddress?[street,city,stateName,zip].filter(Boolean).join(', '):'';
  return {id:`${file}:${index}`,file,index,first,last,full,email,phone,street,city,state:stateName,zip,address,source:val(raw,'source',map)||'LeadIQ CSV',tags:val(raw,'tags',map),notes:val(raw,'notes',map),emailOptIn:parseOptIn(val(raw,'emailOptIn',map)),callOptIn:parseOptIn(val(raw,'callOptIn',map)),smsOptIn:parseOptIn(val(raw,'smsOptIn',map)),raw,duplicate:false,issues:[]};
}
function markQuality(rows){
  const seen=new Map();
  rows.forEach(r=>{
    const phoneDigits=r.phone.replace(/\D/g,'');
    const dedupe=r.email?`e:${r.email}`:phoneDigits.length>=10?`p:${phoneDigits}`:(r.full&&r.street?`a:${key(r.full)}|${key(r.street)}|${r.zip}`:'');
    if(dedupe){if(seen.has(dedupe)){r.duplicate=true;seen.get(dedupe).duplicate=true}else seen.set(dedupe,r)}
    if(!r.email&&!r.phone)r.issues.push('Missing contact');
    if(!r.street)r.issues.push('Missing address');
    if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))r.issues.push('Check email');
    const digits=r.phone.replace(/\D/g,'');if(r.phone&&digits.length!==10)r.issues.push('Check phone');
  });
}
function isComplete(r){return !!(r.full&&(r.email||r.phone)&&r.street&&r.city&&r.zip)&&!r.duplicate&&!r.issues.some(i=>/^Check/.test(i))}
function matches(r){
  const f=state.filter;
  if(f==='ready'&&!(r.email||r.phone))return false;
  if(f==='missing-contact'&&(r.email||r.phone))return false;
  if(f==='missing-address'&&r.street)return false;
  if(f==='duplicates'&&!r.duplicate)return false;
  if(f==='complete'&&!isComplete(r))return false;
  const q=state.search.toLowerCase();if(q&&!([r.full,r.email,r.phone,r.address,r.source,r.tags,r.file].join(' ').toLowerCase().includes(q)))return false;
  return true;
}
function deduped(rows){return rows.filter((r,i,a)=>!r.duplicate||a.findIndex(x=>(x.email&&x.email===r.email)||(!x.email&&x.phone&&x.phone===r.phone)||(!x.email&&!x.phone&&x.full===r.full&&x.street===r.street&&x.zip===r.zip))===i)}
function summary(){
  const rows=state.rows,unique=deduped(rows);
  return {total:rows.length,unique:unique.length,duplicates:rows.filter(r=>r.duplicate).length,missingContact:rows.filter(r=>!r.email&&!r.phone).length,missingAddress:rows.filter(r=>!r.street).length,complete:rows.filter(isComplete).length};
}
function render(){
  const host=$('#leadiq-stage');if(!host)return;
  if(!state.rows.length){host.innerHTML=`<div class="li-drop" id="leadiq-drop"><div><div class="li-drop-icon">⇧</div><h3>Drop a CRM CSV here</h3><p>Or choose one or more CSV files above. Nothing is stored after this page is closed.</p><span class="li-hint">Recognizes common BoldTrail, kvCORE and generic CRM contact columns.</span></div></div>`;bindDrop();setButtons(false);return}
  state.view=state.rows.filter(matches);
  const s=summary();
  const mapped=Object.entries(state.mapping).map(([field,h])=>`<span class="li-pill">${esc(field)} ← ${esc(h)}</span>`).join('');
  host.innerHTML=`
    <div class="li-summary">
      <div class="li-stat"><span>Imported</span><strong>${s.total.toLocaleString()}</strong></div>
      <div class="li-stat good"><span>Unique</span><strong>${s.unique.toLocaleString()}</strong></div>
      <div class="li-stat warn"><span>Duplicates</span><strong>${s.duplicates.toLocaleString()}</strong></div>
      <div class="li-stat warn"><span>No contact</span><strong>${s.missingContact.toLocaleString()}</strong></div>
      <div class="li-stat warn"><span>No address</span><strong>${s.missingAddress.toLocaleString()}</strong></div>
      <div class="li-stat good"><span>Complete</span><strong>${s.complete.toLocaleString()}</strong></div>
    </div>
    <div class="li-meta"><b>${state.files.length} file${state.files.length===1?'':'s'}</b><span>·</span><span>${state.view.length.toLocaleString()} shown</span><span>·</span><div class="li-pills">${mapped||'<span class="li-pill">No standard columns recognized</span>'}</div></div>
    <div class="li-consent"><label><input id="leadiq-batch-consent" type="checkbox" ${state.batchAllChannelConsent?'checked':''}><span><b>This batch has consent for email, calls and SMS</b><small>When checked, BoldTrail export sets all three opt-in fields to 1. Otherwise imported per-contact consent is preserved and unknown consent exports as 0.</small></span></label></div>
    <div class="li-table-wrap"><table class="li-table"><thead><tr><th>Contact</th><th>Email</th><th>Phone</th><th>Address</th><th>Source</th><th>Quality</th><th>File</th><th>Action</th></tr></thead><tbody>${state.view.slice(0,500).map((r)=>rowHtml(r)).join('')||'<tr><td colspan="8" class="li-empty">No contacts match this view.</td></tr>'}</tbody></table></div>
    <div class="li-footer"><span class="li-footer-note">Showing up to 500 rows on screen. Exports include the full filtered result. Contact info present is a data-completeness signal only, not proof of marketing consent.</span>${state.view.length>500?`<span class="li-pill">${state.view.length-500} more in export</span>`:''}</div>
    <div class="li-legacy"><div><b>Still in the old BTC toolbox</b><p>Open House, Property IQ, campaign/reachout and specialty utilities remain available while those are migrated separately.</p></div><a href="/btc-legacy.html">Open legacy tools →</a></div>`;
  host.querySelectorAll('[data-add-row]').forEach(b=>b.addEventListener('click',()=>prefillLead(b.dataset.addRow)));
  $('#leadiq-batch-consent')?.addEventListener('change',e=>{state.batchAllChannelConsent=!!e.target.checked;toast(state.batchAllChannelConsent?'BoldTrail all-channel opt-in enabled':'Batch opt-in override cleared')});
  setButtons(true);
}
function rowHtml(r){
  const quality=r.duplicate?'<span class="li-issue">Duplicate</span>':r.issues.length?r.issues.slice(0,2).map(i=>`<span class="li-issue">${esc(i)}</span>`).join(' '):'<span class="li-ok">Ready</span>';
  return `<tr><td><span class="li-name">${esc(r.full||'Unnamed')}</span></td><td>${r.email?esc(r.email):'<span class="li-muted">—</span>'}</td><td>${r.phone?esc(r.phone):'<span class="li-muted">—</span>'}</td><td>${r.street?`${esc(r.street)}<br><span class="li-muted">${esc([r.city,r.state,r.zip].filter(Boolean).join(', '))}</span>`:'<span class="li-muted">—</span>'}</td><td>${esc(r.source)}</td><td>${quality}</td><td>${esc(r.file)}</td><td><div class="li-row-actions"><button class="li-mini" type="button" data-add-row="${esc(r.id)}">Add to queue</button></div></td></tr>`;
}
function setButtons(enabled){['leadiq-cleaned','leadiq-boldtrail','leadiq-view-export','leadiq-clear'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=!enabled})}
function bindDrop(){const drop=$('#leadiq-drop');if(!drop)return;['dragenter','dragover'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('drag')}));['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('drag')}));drop.addEventListener('drop',ev=>loadFiles(Array.from(ev.dataTransfer.files||[])))}
async function loadFiles(files){
  files=files.filter(f=>/\.csv$/i.test(f.name)||f.type==='text/csv');if(!files.length){toast('Choose a CSV file');return}
  const merged=[],allHeaders=new Set(),maps=[];
  for(const file of files){const parsed=parseCsv(await file.text());const map=infer(parsed.headers);parsed.headers.forEach(h=>allHeaders.add(h));maps.push(map);parsed.records.forEach((raw,i)=>merged.push(normalizeRow(raw,map,file.name,i)))}
  state.rows=merged;state.files=files.map(f=>f.name);state.headers=Array.from(allHeaders);state.mapping=Object.assign({},...maps);state.filter='all';state.search='';state.batchAllChannelConsent=false;markQuality(state.rows);
  const filter=$('#leadiq-filter'),search=$('#leadiq-search');if(filter)filter.value='all';if(search)search.value='';render();toast(`${state.rows.length.toLocaleString()} contacts loaded`)
}
function exportRows(rows,type){
  if(!rows.length){toast('No contacts in this view');return}
  let headers,data,name;
  if(type==='boldtrail'){
    headers=BOLDTRAIL_HEADERS;data=deduped(rows).map(r=>{const names=normalizeNameFields(r.first,r.last,r.full);return [names.first,names.last,r.email,r.phone,r.street,r.city,r.state,r.zip,r.source||'LeadIQ CSV','new',r.tags,r.notes,'','','','','','','',exportOptIn(r.emailOptIn),exportOptIn(r.callOptIn),exportOptIn(r.smsOptIn)]});name='leadiq-boldtrail.csv';
  }else{
    headers=['Full Name','First Name','Last Name','Email','Phone','Street Address','City','State','Postal Code','Source','Hashtags','Notes','Quality'];data=(type==='cleaned'?deduped(rows):rows).map(r=>[r.full,r.first,r.last,r.email,r.phone,r.street,r.city,r.state,r.zip,r.source,r.tags,r.notes,r.duplicate?'Duplicate':r.issues.join('; ')||'Ready']);name=type==='cleaned'?'leadiq-cleaned.csv':'leadiq-filtered.csv';
  }
  const csv='\uFEFF'+[headers.map(csvCell).join(','),...data.map(row=>row.map(csvCell).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${data.length.toLocaleString()} rows exported`)
}
function prefillLead(id){
  const r=state.rows.find(x=>x.id===id),form=$('#lead-form');if(!r||!form){toast('Lead form is unavailable');return}
  const set=(name,value)=>{if(form.elements[name])form.elements[name].value=value||''};
  set('full_name',r.full);set('email',r.email);set('phone',r.phone);set('submitted_address',r.address);set('source',r.source||'LeadIQ CSV');set('program','CRM Import');set('notes',[r.notes,r.tags?`Imported tags: ${r.tags}`:'',`LeadIQ source file: ${r.file}`].filter(Boolean).join(' | '));
  const add=$('#bo-add');if(add)add.click();else if(typeof $('#lead-dialog')?.showModal==='function')$('#lead-dialog').showModal();
  toast('Contact loaded into Add lead')
}
function clearAll(){state.rows=[];state.view=[];state.files=[];state.headers=[];state.mapping={};state.batchAllChannelConsent=false;render();toast('Imported CSV cleared')}
function init(){
  const input=$('#leadiq-file');if(!input)return;
  const readyOption=$('#leadiq-filter option[value="ready"]');if(readyOption)readyOption.textContent='Has email or phone';
  input.addEventListener('change',()=>{loadFiles(Array.from(input.files||[]));input.value='' });
  $('#leadiq-filter')?.addEventListener('change',e=>{state.filter=e.target.value;render()});
  $('#leadiq-search')?.addEventListener('input',e=>{state.search=e.target.value.trim();render()});
  $('#leadiq-cleaned')?.addEventListener('click',()=>exportRows(state.rows,'cleaned'));
  $('#leadiq-boldtrail')?.addEventListener('click',()=>exportRows(state.rows,'boldtrail'));
  $('#leadiq-view-export')?.addEventListener('click',()=>exportRows(state.view,'view'));
  $('#leadiq-clear')?.addEventListener('click',clearAll);
  render();
  if(location.hash==='#leadiq')setTimeout(()=>$('#leadiq')?.scrollIntoView({block:'start'}),100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

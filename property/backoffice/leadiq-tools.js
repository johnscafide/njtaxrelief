/* LeadIQ Tools: CSV import, clean-up and CRM-ready exports, all in browser memory.
   Static markup and copy live in index.html; this file fills in the data. */
(function(){
'use strict';

const state={rows:[],view:[],files:[],filter:'all',search:'',mapping:{},batchConsent:false};
const $=(s,r=document)=>r.querySelector(s);
const clean=(v)=>String(v??'').replace(/﻿/g,'').replace(/\s+/g,' ').trim();
const key=(v)=>clean(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
const KIT_HEADERS=['First name','Email address'];

function toast(message){
  const el=$('#bo-toast');if(!el)return;
  el.textContent=message;el.hidden=false;
  requestAnimationFrame(()=>el.classList.add('is-shown'));
  clearTimeout(toast.t);toast.t=setTimeout(()=>{el.classList.remove('is-shown');setTimeout(()=>{el.hidden=true},250)},3600);
}
// Spreadsheet apps execute cells that start with = + - @ (or a tab / carriage return); prefix those with a quote so exports stay data.
function csvCell(value){let s=String(value??'').replace(/\r?\n/g,' ');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function parseCsv(text){
  text=String(text||'').replace(/^﻿/,'');
  const out=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"'){quoted=false}else cell+=ch;continue}
    if(ch==='"'){quoted=true;continue}
    if(ch===','){row.push(cell);cell='';continue}
    if(ch==='\n'){row.push(cell);if(row.some((v)=>clean(v)!==''))out.push(row);row=[];cell='';continue}
    if(ch==='\r')continue;
    cell+=ch;
  }
  row.push(cell);if(row.some((v)=>clean(v)!==''))out.push(row);
  if(!out.length)return {headers:[],records:[]};
  const headers=out[0].map((h,i)=>clean(h)||'Column '+(i+1));
  const records=out.slice(1).map((values)=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
  return {headers,records};
}
function infer(headers){
  const norm=headers.map((h)=>({h,k:key(h)})),map={},used=new Set();
  for(const [field,aliases] of Object.entries(ALIASES)){
    const available=norm.filter((x)=>!used.has(x.h));
    const hit=available.find((x)=>aliases.includes(x.k))||available.find((x)=>aliases.some((a)=>a.length>=4&&x.k.includes(a)));
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
// A recorded "no" always stays no. The batch checkbox only fills in contacts with no recorded choice.
function optedIn(explicit){return explicit===true||(state.batchConsent&&explicit!==false)}
function exportOptIn(explicit){return optedIn(explicit)?'1':'0'}
function normalizePhone(v){const digits=clean(v).replace(/\D/g,'');const d=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;if(d.length===10)return '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6);return clean(v)}
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
  if(first&&last&&key(first)===key(last)){const split=splitName(full||first);first=split.first;last=split.last}
  else if(!first&&!last&&full){const split=splitName(full);first=split.first;last=split.last}
  else if(!first&&full){first=splitName(full).first}
  else if(!last&&full){last=splitName(full).last}
  return {first,last,full:full||[first,last].filter(Boolean).join(' ')};
}
function normalizeRow(raw,map,file,index){
  const {first,last,full}=normalizeNameFields(val(raw,'first',map),val(raw,'last',map),val(raw,'full',map));
  const email=val(raw,'email',map).toLowerCase();
  const phone=normalizePhone(val(raw,'phone',map));
  const street=val(raw,'street',map),city=val(raw,'city',map),explicitState=val(raw,'state',map),zip=normalizeZip(val(raw,'zip',map)),hasAddress=!!(street||city||zip),stateName=(explicitState||(hasAddress?'NJ':'')).toUpperCase();
  const address=hasAddress?[street,city,stateName,zip].filter(Boolean).join(', '):'';
  return {id:file+':'+index,file,index,first,last,full,email,phone,street,city,state:stateName,zip,address,source:val(raw,'source',map)||'LeadIQ CSV',tags:val(raw,'tags',map),notes:val(raw,'notes',map),emailOptIn:parseOptIn(val(raw,'emailOptIn',map)),callOptIn:parseOptIn(val(raw,'callOptIn',map)),smsOptIn:parseOptIn(val(raw,'smsOptIn',map)),duplicate:false,issues:[]};
}
function markQuality(rows){
  const seen=new Map();
  rows.forEach((r)=>{
    const phoneDigits=r.phone.replace(/\D/g,'');
    const dedupe=r.email?'e:'+r.email:phoneDigits.length>=10?'p:'+phoneDigits:(r.full&&r.street?'a:'+key(r.full)+'|'+key(r.street)+'|'+r.zip:'');
    if(dedupe){if(seen.has(dedupe)){r.duplicate=true;seen.get(dedupe).duplicate=true}else seen.set(dedupe,r)}
    if(!r.email&&!r.phone)r.issues.push('Missing contact');
    if(!r.street)r.issues.push('Missing address');
    if(r.email&&!EMAIL_RE.test(r.email))r.issues.push('Check email');
    if(r.phone&&phoneDigits.length!==10)r.issues.push('Check phone');
  });
}
function isComplete(r){return !!(r.full&&(r.email||r.phone)&&r.street&&r.city&&r.zip)&&!r.duplicate&&!r.issues.some((i)=>/^Check/.test(i))}
function matches(r){
  const f=state.filter;
  if(f==='ready'&&!(r.email||r.phone))return false;
  if(f==='missing-contact'&&(r.email||r.phone))return false;
  if(f==='missing-address'&&r.street)return false;
  if(f==='duplicates'&&!r.duplicate)return false;
  if(f==='complete'&&!isComplete(r))return false;
  const q=state.search.toLowerCase();
  return !q||[r.full,r.email,r.phone,r.address,r.source,r.tags,r.file].join(' ').toLowerCase().includes(q);
}
function deduped(rows){return rows.filter((r,i,a)=>!r.duplicate||a.findIndex((x)=>(x.email&&x.email===r.email)||(!x.email&&x.phone&&x.phone===r.phone)||(!x.email&&!x.phone&&x.full===r.full&&x.street===r.street&&x.zip===r.zip))===i)}
// Kit is an email-marketing list: only contacts who opted in to email are included.
function kitRows(rows){
  const seen=new Set(),data=[];let missing=0,invalid=0,duplicates=0,notOptedIn=0;
  for(const r of rows){
    const email=clean(r.email).toLowerCase();
    if(!email){missing++;continue}
    if(!EMAIL_RE.test(email)){invalid++;continue}
    if(!optedIn(r.emailOptIn)){notOptedIn++;continue}
    if(seen.has(email)){duplicates++;continue}
    seen.add(email);
    data.push([normalizeNameFields(r.first,r.last,r.full).first,email]);
  }
  return {data,missing,invalid,duplicates,notOptedIn};
}
function summary(){
  const rows=state.rows;
  return {total:rows.length,unique:deduped(rows).length,duplicates:rows.filter((r)=>r.duplicate).length,missingContact:rows.filter((r)=>!r.email&&!r.phone).length,missingAddress:rows.filter((r)=>!r.street).length,emailOptIn:rows.filter((r)=>r.email&&optedIn(r.emailOptIn)).length};
}
function setButtons(enabled){['leadiq-cleaned','leadiq-boldtrail','leadiq-kit','leadiq-view-export','leadiq-clear'].forEach((id)=>{const el=document.getElementById(id);if(el)el.disabled=!enabled})}
function cell(tr,label,content){const td=document.createElement('td');if(label){const l=document.createElement('span');l.className='li-cell-label';l.setAttribute('aria-hidden','true');l.textContent=label;td.appendChild(l)}if(content instanceof Node)td.appendChild(content);else{const s=document.createElement('span');s.textContent=content;td.appendChild(s)}tr.appendChild(td);return td}
function muted(textValue){const s=document.createElement('span');s.className='bo-muted';s.textContent=textValue;return s}
function tag(textValue,tone){const s=document.createElement('span');s.className='bo-pill'+(tone?' is-'+tone:'');s.textContent=textValue;return s}
function optInLabel(v){return v===true?tag('Yes','good'):v===false?tag('No','bad'):muted(state.batchConsent?'Batch opt-in':'Not recorded')}
function rowElement(r,labels){
  const tr=document.createElement('tr');
  const name=document.createElement('b');name.className='li-name';name.textContent=r.full||'Unnamed';
  cell(tr,'',name);
  cell(tr,labels[1],r.email||muted('-'));
  cell(tr,labels[2],r.phone||muted('-'));
  const addr=document.createElement('span');
  if(r.street){addr.append(r.street);const sub=muted([r.city,r.state,r.zip].filter(Boolean).join(', '));sub.classList.add('li-sub');addr.append(sub)}else addr.append(muted('-'));
  cell(tr,labels[3],addr);
  cell(tr,labels[4],r.source);
  cell(tr,labels[5],optInLabel(r.emailOptIn));
  const quality=document.createElement('span');quality.className='bo-pills';
  if(r.duplicate)quality.append(tag('Duplicate','warn'));else if(r.issues.length)r.issues.slice(0,2).forEach((i)=>quality.append(tag(i,'warn')));else quality.append(tag('Ready','good'));
  cell(tr,labels[6],quality);
  cell(tr,labels[7],r.file);
  const btn=document.createElement('button');btn.type='button';btn.className='bo-btn bo-btn-ghost';btn.dataset.addRow=r.id;btn.textContent='Add to queue';btn.setAttribute('aria-label','Add '+(r.full||'this contact')+' to the lead queue');
  cell(tr,'',btn);
  return tr;
}
function render(){
  const has=state.rows.length>0;
  const drop=$('#leadiq-drop'),results=$('#leadiq-results');
  if(drop)drop.hidden=has;if(results)results.hidden=!has;
  setButtons(has);
  if(!has)return;
  state.view=state.rows.filter(matches);
  const s=summary();
  Object.keys(s).forEach((k)=>{const el=document.querySelector('[data-li-stat="'+k+'"]');if(el)el.textContent=s[k].toLocaleString()});
  const files=$('[data-li="files"]');if(files)files.textContent=state.files.length+' file'+(state.files.length===1?'':'s');
  const shown=$('[data-li="shown"]');if(shown)shown.textContent=state.view.length.toLocaleString()+' shown';
  const mapping=$('#leadiq-mapping');
  if(mapping){const entries=Object.entries(state.mapping);mapping.replaceChildren(...(entries.length?entries.map(([field,h])=>tag(field+' ← '+h,'')):[tag('No standard columns recognized','warn')]))}
  const consent=$('#leadiq-batch-consent');if(consent)consent.checked=state.batchConsent;
  const labels=Array.from(document.querySelectorAll('.li-table thead th')).map((th)=>th.textContent.trim());
  const body=$('#leadiq-rows');
  if(body){const frag=document.createDocumentFragment();state.view.slice(0,500).forEach((r)=>frag.appendChild(rowElement(r,labels)));body.replaceChildren(frag)}
  const none=$('#leadiq-none');if(none)none.hidden=state.view.length>0;
  const more=$('#leadiq-more');if(more){more.hidden=state.view.length<=500;more.textContent=(state.view.length-500).toLocaleString()+' more rows are in the export.'}
}
async function loadFiles(files){
  files=files.filter((f)=>/\.csv$/i.test(f.name)||f.type==='text/csv');
  if(!files.length){toast('Choose a CSV file.');return}
  const merged=[],maps=[];
  for(const file of files){const parsed=parseCsv(await file.text());const map=infer(parsed.headers);maps.push(map);parsed.records.forEach((raw,i)=>merged.push(normalizeRow(raw,map,file.name,i)))}
  state.rows=merged;state.files=files.map((f)=>f.name);state.mapping=Object.assign({},...maps);state.filter='all';state.search='';state.batchConsent=false;
  markQuality(state.rows);
  const filter=$('#leadiq-filter'),search=$('#leadiq-search');if(filter)filter.value='all';if(search)search.value='';
  render();toast(state.rows.length.toLocaleString()+' contacts loaded');
}
function download(name,headers,data){
  const csv='﻿'+[headers.map(csvCell).join(','),...data.map((row)=>row.map(csvCell).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportRows(rows,type){
  if(!rows.length){toast('No contacts in this view.');return}
  if(type==='boldtrail'){
    const data=deduped(rows).map((r)=>{const n=normalizeNameFields(r.first,r.last,r.full);return [n.first,n.last,r.email,r.phone,r.street,r.city,r.state,r.zip,r.source||'LeadIQ CSV','new',r.tags,r.notes,'','','','','','','',exportOptIn(r.emailOptIn),exportOptIn(r.callOptIn),exportOptIn(r.smsOptIn)]});
    download('leadiq-boldtrail.csv',BOLDTRAIL_HEADERS,data);toast(data.length.toLocaleString()+' rows exported for BoldTrail');return;
  }
  if(type==='kit'){
    const kit=kitRows(rows);
    const left=[kit.notOptedIn?kit.notOptedIn.toLocaleString()+' without an email opt-in':'',kit.missing+kit.invalid?(kit.missing+kit.invalid).toLocaleString()+' with no valid email':'',kit.duplicates?kit.duplicates.toLocaleString()+' duplicate'+(kit.duplicates===1?'':'s'):''].filter(Boolean).join(', ');
    if(!kit.data.length){toast('Nobody in this file opted in to email, so there is nothing to export for Kit.'+(left?' Left out: '+left+'.':''));return}
    download('leadiq-kit.csv',KIT_HEADERS,kit.data);
    toast(kit.data.length.toLocaleString()+' Kit contacts exported'+(left?' · left out: '+left:''));return;
  }
  const data=(type==='cleaned'?deduped(rows):rows).map((r)=>[r.full,r.first,r.last,r.email,r.phone,r.street,r.city,r.state,r.zip,r.source,r.tags,r.notes,r.duplicate?'Duplicate':r.issues.join('; ')||'Ready']);
  download(type==='cleaned'?'leadiq-cleaned.csv':'leadiq-filtered.csv',['Full Name','First Name','Last Name','Email','Phone','Street Address','City','State','Postal Code','Source','Hashtags','Notes','Quality'],data);
  toast(data.length.toLocaleString()+' rows exported');
}
function prefillLead(id){
  const r=state.rows.find((x)=>x.id===id),form=document.getElementById('bo-add-form');
  if(!r||!form){toast('The Add lead form isn’t available.');return}
  const set=(name,value)=>{if(form.elements[name])form.elements[name].value=value||''};
  set('full_name',r.full);set('email',r.email);set('phone',r.phone);set('submitted_address',r.address);set('source',r.source||'LeadIQ CSV');set('program','CRM Import');
  set('notes',[r.notes,r.tags?'Imported tags: '+r.tags:'','LeadIQ source file: '+r.file].filter(Boolean).join(' | '));
  const add=document.getElementById('bo-add');if(add)add.click();
  toast('Contact loaded into Add lead');
}
function clearAll(){state.rows=[];state.view=[];state.files=[];state.mapping={};state.batchConsent=false;render();toast('Imported CSV cleared')}
function init(){
  const input=$('#leadiq-file');if(!input)return;
  input.addEventListener('change',()=>{loadFiles(Array.from(input.files||[]));input.value=''});
  const drop=$('#leadiq-drop');
  if(drop){
    ['dragenter','dragover'].forEach((e)=>drop.addEventListener(e,(ev)=>{ev.preventDefault();drop.classList.add('is-drag')}));
    ['dragleave','drop'].forEach((e)=>drop.addEventListener(e,(ev)=>{ev.preventDefault();drop.classList.remove('is-drag')}));
    drop.addEventListener('drop',(ev)=>loadFiles(Array.from(ev.dataTransfer&&ev.dataTransfer.files||[])));
  }
  $('#leadiq-filter')?.addEventListener('change',(e)=>{state.filter=e.target.value;render()});
  $('#leadiq-search')?.addEventListener('input',(e)=>{state.search=e.target.value.trim();render()});
  $('#leadiq-batch-consent')?.addEventListener('change',(e)=>{state.batchConsent=!!e.target.checked;render();toast(state.batchConsent?'Contacts with no recorded choice now export as opted in':'Batch opt-in cleared')});
  $('#leadiq-rows')?.addEventListener('click',(e)=>{const b=e.target.closest('[data-add-row]');if(b)prefillLead(b.dataset.addRow)});
  $('#leadiq-cleaned')?.addEventListener('click',()=>exportRows(state.rows,'cleaned'));
  $('#leadiq-boldtrail')?.addEventListener('click',()=>exportRows(state.rows,'boldtrail'));
  $('#leadiq-kit')?.addEventListener('click',()=>exportRows(state.rows,'kit'));
  $('#leadiq-view-export')?.addEventListener('click',()=>exportRows(state.view,'view'));
  $('#leadiq-clear')?.addEventListener('click',clearAll);
  render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

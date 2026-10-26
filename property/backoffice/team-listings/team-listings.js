/* Team Listings (Backoffice owner and team members).
   - Type an MLS# or address and drop the Bright MLS PDF; bright-pdf.js reads it in this tab.
   - The fields fill in for a check, photos from the PDF are added, more can be uploaded.
   - Saving sends only the public fields to /api/watchdog-team-listings. The PDF is never sent.
   - Photos are redrawn as JPG in the browser before upload, which also drops GPS and camera info. */
(function(){
'use strict';
const API='/api/watchdog-team-listings';
const ORIGIN='https://www.watchdogindex.com';
const MAX_PHOTOS=40;
const MAX_SIDE=2048;
const LIVE=new Set(['coming_soon','active','under_contract','pending']);
const STALE_DAYS=14;
const STATUS_LABEL={coming_soon:'Coming soon',active:'For sale',under_contract:'Under contract',pending:'Pending',sold:'Sold',off_market:'Off market'};
const FIELDS=['mls_number','status','price','address','unit','city','zip','county','beds','baths_full','baths_half','sqft','lot','year_built','property_type','style','annual_tax','school_district','subdivision','list_date','agent_name','brokerage','remarks'];

const $=(id)=>document.getElementById(id);
const state={owner:false,name:'',userId:'',listings:[],filter:'live',editing:null,photos:[],busy:false};
let toastTimer=null;

async function token(){
  if(window.njptrAccessReady){try{await window.njptrAccessReady}catch(_){return ''}}
  try{const r=await window.NJPTRAccess.client().auth.getSession();return r&&r.data&&r.data.session&&r.data.session.access_token||''}catch(_){return ''}
}
async function call(action,body){
  const t=await token();
  const res=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify(Object.assign({action},body||{}))});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(data.error||'Something went wrong. Please try again.');e.status=res.status;throw e}
  return data;
}
function say(id,msg,kind){const el=$(id);if(!el)return;el.textContent=msg||'';el.className='tl-status'+(kind?' is-'+kind:'')}
function toast(msg){const el=$('tl-toast');el.textContent=msg;el.hidden=false;requestAnimationFrame(()=>el.classList.add('is-shown'));clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.classList.remove('is-shown');setTimeout(()=>{el.hidden=true},250)},2600)}
function el(tag,attrs,...kids){
  const n=document.createElement(tag);
  Object.entries(attrs||{}).forEach(([k,v])=>{if(v==null||v===false)return;if(k==='text')n.textContent=String(v);else if(k==='class')n.className=v;else if(k.startsWith('data-')||k.startsWith('aria-')||['href','src','alt','type','target','rel','loading','placeholder','maxlength'].includes(k))n.setAttribute(k,v===true?'':String(v));else n[k]=v});
  kids.flat().forEach((k)=>{if(k!=null&&k!==false)n.append(k)});
  return n;
}
function money(n){return n==null||n===''?'':'$'+Number(n).toLocaleString('en-US')}
function bathsText(l){const f=Number(l.baths_full)||0,h=Number(l.baths_half)||0;if(!f&&!h)return '';return (h?f+'.'+h:String(f))+' baths'}
function factsLine(l){return [l.beds!=null&&l.beds!==''?l.beds+' beds':'',bathsText(l),l.sqft?Number(l.sqft).toLocaleString('en-US')+' sq ft':''].filter(Boolean).join(' · ')}
function where(l){return [l.address+(l.unit?' #'+l.unit:''),l.city].filter(Boolean).join(', ')}

// ---------- social post text ----------
function postText(l){
  const lead={coming_soon:'Coming soon',active:'Just listed',under_contract:'Under contract',pending:'Pending',sold:'Just sold'}[l.status]||'Listed';
  return [
    lead+': '+where(l)+', NJ',
    [money(l.price),factsLine(l)].filter(Boolean).join(' · '),
    ORIGIN+'/listings/'+l.slug,
    l.brokerage||''
  ].filter(Boolean).join('\n');
}

// ---------- list ----------
function visible(){
  return state.listings.filter((l)=>state.filter==='all'||(state.filter==='mine'?l.agent_user_id===state.userId:LIVE.has(l.status)&&l.published));
}
function stale(l){
  if(!LIVE.has(l.status)||!l.can_edit)return false;
  const t=Date.parse(l.updated_at||l.created_at||'');
  return t&&Date.now()-t>STALE_DAYS*864e5;
}
function statusPicker(l){
  const s=el('select',{class:'tl-status-pick','aria-label':'Status for '+where(l),'data-status':l.id});
  s.append(...Object.keys(STATUS_LABEL).map((k)=>el('option',{value:k,text:STATUS_LABEL[k]})));
  s.value=l.status;
  return s;
}
async function changeStatus(sel){
  const l=state.listings.find((x)=>x.id===sel.dataset.status);
  if(!l)return;
  sel.disabled=true;
  try{
    const out=await call('set_status',{id:l.id,status:sel.value});
    Object.assign(l,out.listing);
    toast(where(l)+' is now '+(STATUS_LABEL[l.status]||l.status).toLowerCase()+'.');
  }catch(e){sel.value=l.status;toast(e.message||'That didn’t save.')}
  renderList();
}
function renderList(){
  const list=$('tl-list');
  const rows=visible();
  say('tl-list-status',rows.length?'':(state.listings.length?'Nothing here with this filter.':'No team listings yet. Add the first one above.'));
  list.replaceChildren(...rows.map((l)=>{
    const photo=l.photos&&l.photos[0];
    return el('li',{class:'tl-item'},
      photo?el('img',{src:photo,alt:'',loading:'lazy'}):el('span',{class:'tl-noimg','aria-hidden':'true'}),
      el('div',null,
        el('h3',{text:where(l)}),
        el('p',null,el('span',{class:'tl-badge',text:STATUS_LABEL[l.status]||l.status}),l.published?null:el('span',{class:'tl-badge is-hidden',text:'Hidden'}),stale(l)?el('span',{class:'tl-badge is-stale',text:'Still '+(STATUS_LABEL[l.status]||'').toLowerCase()+'?'}):null,el('span',{class:'tl-price',text:money(l.price)})),
        el('p',{text:[factsLine(l),l.mls_number?'MLS# '+l.mls_number:'',l.agent_name].filter(Boolean).join(' · ')})),
      el('div',{class:'tl-item-actions'},
        el('button',{class:'bo-btn bo-btn-ghost',type:'button','data-copy':l.id,text:'Copy post text'}),
        l.published?el('a',{class:'bo-btn bo-btn-ghost',href:'/listings/'+l.slug,target:'_blank',rel:'noopener',text:'Open page'}):null,
        l.can_edit?statusPicker(l):null,
        l.can_edit?el('button',{class:'bo-btn bo-btn-primary',type:'button','data-edit':l.id,text:'Edit'}):null));
  }));
}
async function loadList(){
  say('tl-list-status','Loading...');
  const data=await call('list');
  state.owner=data.owner;state.name=data.name;state.userId=data.user_id;state.listings=data.listings||[];
  renderList();
  return data;
}

// ---------- editor ----------
function form(){return $('tl-form')}
function setField(name,value){const el=form().elements[name];if(el)el.value=value==null?'':value}
function featureRow(f){
  const li=el('li',null,el('input',{'aria-label':'Feature',maxlength:60,placeholder:'Heating'}),el('input',{'aria-label':'Details',maxlength:300,placeholder:'Forced air, gas'}),el('button',{type:'button','aria-label':'Remove feature',text:'×'}));
  li.children[0].value=f&&f.label||'';li.children[1].value=f&&f.value||'';
  li.children[2].addEventListener('click',()=>li.remove());
  return li;
}
function renderFeatures(list){$('tl-features').replaceChildren(...(list||[]).map(featureRow))}
function readFeatures(){return [...$('tl-features').children].map((li)=>({label:li.children[0].value.trim(),value:li.children[1].value.trim()})).filter((f)=>f.label&&f.value)}

function renderPhotos(){
  const ul=$('tl-photos');
  ul.replaceChildren(...state.photos.map((p,i)=>{
    const cover=i?el('button',{type:'button',text:'Make cover'}):el('span');
    const drop=el('button',{type:'button','aria-label':'Remove photo '+(i+1),text:'Remove'});
    drop.addEventListener('click',()=>{state.photos.splice(i,1);renderPhotos()});
    if(i)cover.addEventListener('click',()=>{state.photos.unshift(state.photos.splice(i,1)[0]);renderPhotos()});
    return el('li',{class:p.uploading?'is-uploading':''},el('img',{alt:'Photo '+(i+1),src:p.preview||p.url}),i===0?el('span',{class:'tl-cover',text:'Cover'}):null,el('div',{class:'tl-photo-tools'},cover,drop));
  }));
  const waiting=state.photos.filter((p)=>p.uploading).length;
  $('tl-photo-note').textContent=waiting?'Uploading '+waiting+' photo'+(waiting>1?'s':'')+'...':(state.photos.length?'':'No photos yet. In Bright, download all the photos, then drop the .zip or the photos here.');
}

async function shrink(blob){
  const bitmap=await createImageBitmap(blob);
  const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
  const c=document.createElement('canvas');
  c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
  c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);
  bitmap.close&&bitmap.close();
  const out=await new Promise((resolve)=>c.toBlob(resolve,'image/jpeg',0.86));
  if(!out)throw new Error('That photo couldn’t be read.');
  return out;
}
async function uploadPhoto(item){
  try{
    const jpg=await shrink(item.blob);
    const slot=await call('photo_upload',{type:'image/jpeg'});
    const fd=new FormData();
    fd.append('cacheControl','31536000');
    fd.append('',jpg,'photo.jpg');
    const r=await fetch(slot.upload_url,{method:'PUT',headers:{'x-upsert':'false'},body:fd});
    if(!r.ok)throw new Error('A photo didn’t finish uploading. Please try again.');
    item.url=slot.public_url;item.uploading=false;delete item.blob;
  }catch(e){
    const i=state.photos.indexOf(item);if(i>=0)state.photos.splice(i,1);
    toast(e.message||'A photo didn’t upload.');
  }
  renderPhotos();
}
async function addPhotos(blobs){
  const room=MAX_PHOTOS-state.photos.length;
  if(room<=0){toast('That’s the most photos one listing can have ('+MAX_PHOTOS+').');return}
  const list=[...blobs];
  if(list.length>room)toast('Only the first '+room+' photos were added. One listing can have '+MAX_PHOTOS+'.');
  const items=list.slice(0,room).map((blob)=>({uploading:true,blob,preview:URL.createObjectURL(blob)}));
  state.photos.push(...items);renderPhotos();
  const queue=items.slice();
  await Promise.all([0,1,2].map(async()=>{while(queue.length)await uploadPhoto(queue.shift())}));
}

const PHOTO_EXT=/\.(jpe?g|png|webp|heic|heif)$/i;
const ZIP_JUNK=/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._)/i;
const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
function unzip(bytes){
  return new Promise((resolve,reject)=>{
    window.fflate.unzip(bytes,{filter:(f)=>PHOTO_EXT.test(f.name)&&!ZIP_JUNK.test(f.name)},(err,files)=>err?reject(err):resolve(files));
  });
}
// Bright's "download all photos" gives a .zip; numbered files keep the MLS order.
async function collectPhotos(fileList){
  const out=[];
  for(const f of [...fileList].sort(byName)){
    if(/\.zip$/i.test(f.name)||f.type==='application/zip'||f.type==='application/x-zip-compressed'){
      if(!window.fflate)throw new Error('Still loading. Try again in a second.');
      const files=await unzip(new Uint8Array(await f.arrayBuffer()));
      Object.keys(files).map((name)=>({name,data:files[name]})).sort(byName).forEach((x)=>out.push(new Blob([x.data],{type:/\.png$/i.test(x.name)?'image/png':/\.webp$/i.test(x.name)?'image/webp':'image/jpeg'})));
    }else if(/^image\//.test(f.type)||PHOTO_EXT.test(f.name))out.push(f);
  }
  return out;
}
async function takePhotos(fileList){
  try{
    const blobs=await collectPhotos(fileList);
    if(!blobs.length){toast('No photos found in that.');return}
    await addPhotos(blobs);
  }catch(e){toast(e.message||'Those photos couldn’t be read.')}
}

function openEditor(listing,parsed){
  state.editing=listing||null;
  form().reset();
  const fresh={};Object.keys(parsed||{}).forEach((k)=>{const v=parsed[k];if(v!=null&&v!==''&&!(Array.isArray(v)&&!v.length))fresh[k]=v});
  const src=Object.assign({status:'active',brokerage:'Opus Elite Real Estate of NJ, LLC',agent_name:state.name},listing||{},fresh);
  FIELDS.forEach((f)=>setField(f,src[f]));
  form().elements.published.checked=listing?listing.published!==false:true;
  form().elements.seller_ok.checked=!!listing;
  renderFeatures(src.features);
  state.photos=(listing&&listing.photos||[]).map((url)=>({url}));
  renderPhotos();
  $('tl-editor-title').textContent=listing?'Edit '+where(listing):'Check the details';
  $('tl-remove').hidden=!listing;
  say('tl-form-status',parsed&&!listing?'Filled in from the PDF. Give it a quick look before saving.':'');
  $('tl-editor').hidden=false;
  $('tl-editor').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function closeEditor(){
  $('tl-editor').hidden=true;state.editing=null;state.photos=[];
  $('tl-lookup').value='';$('tl-pdf').value='';say('tl-start-status','');
}

function lookupMatches(lookup,fields){
  const q=String(lookup||'').trim().toUpperCase();
  if(!q)return true;
  if(/^[A-Z]{2,6}\d{4,12}$/.test(q.replace(/\s+/g,'')))return !fields.mls_number||fields.mls_number===q.replace(/\s+/g,'');
  const num=(q.match(/^\d+/)||[''])[0];
  return !num||!fields.address||fields.address.startsWith(num);
}
async function readPdf(file){
  if(!file)return;
  if(!/pdf$/i.test(file.type)&&!/\.pdf$/i.test(file.name)){say('tl-start-status','That isn’t a PDF. Print the listing from Bright MLS as a PDF and try again.','bad');return}
  say('tl-start-status','Reading the PDF...');
  try{
    const out=await window.WatchdogBrightPdf.read(file);
    const f=out.fields;
    const lookup=$('tl-lookup').value.trim();
    if(!f.address&&lookup&&!/^[A-Z]{2,6}\d{4,12}$/i.test(lookup.replace(/\s+/g,''))){const parts=lookup.split(',');f.address=parts[0].trim();if(parts[1])f.city=parts[1].trim()}
    if(!f.mls_number&&/^[A-Z]{2,6}\d{4,12}$/i.test(lookup.replace(/\s+/g,'')))f.mls_number=lookup.replace(/\s+/g,'').toUpperCase();
    const dupe=f.mls_number&&state.listings.find((l)=>l.mls_number===f.mls_number);
    if(dupe&&!dupe.can_edit){say('tl-start-status','MLS# '+f.mls_number+' is already on the list'+(dupe.agent_name?', added by '+dupe.agent_name:'')+'.','bad');return}
    if(dupe){
      const moved=f.status&&f.status!==dupe.status;
      openEditor(dupe,f);
      say('tl-form-status',moved?'The PDF says this listing is now '+STATUS_LABEL[f.status].toLowerCase()+' (it was '+(STATUS_LABEL[dupe.status]||dupe.status).toLowerCase()+'). Save to update it.':'This MLS# is already on the list, so the PDF’s details were filled into it. Save to update it.');if(out.photos.length&&!dupe.photos.length)await addPhotos(out.photos);return}
    openEditor(null,f);
    if(!lookupMatches(lookup,f))say('tl-form-status','Heads up: the PDF doesn’t look like it matches "'+lookup+'". Check it’s the right printout.','bad');
    const found=[f.price,f.beds,f.address,f.mls_number].filter(Boolean).length;
    if(found<2)say('tl-form-status','Couldn’t read much from this PDF, so fill in what’s missing. Sending John the PDF helps fix the reader.','bad');
    say('tl-start-status','');
    if(out.photos.length)await addPhotos(out.photos);
  }catch(e){
    say('tl-start-status',e.message||'That PDF couldn’t be read.','bad');
  }
}

async function save(ev){
  ev.preventDefault();
  if(state.busy)return;
  const els=form().elements;
  if(!els.address.value.trim()||!els.city.value.trim()){say('tl-form-status','Add the street address and town.','bad');return}
  if(!els.seller_ok.checked){say('tl-form-status','Check the box saying the seller is OK with it being shown online.','bad');return}
  if(state.photos.some((p)=>p.uploading)){say('tl-form-status','Wait for the photos to finish uploading.','bad');return}
  const listing={id:state.editing?state.editing.id:undefined,published:els.published.checked,features:readFeatures(),photos:state.photos.map((p)=>p.url).filter(Boolean)};
  FIELDS.forEach((f)=>{listing[f]=els[f].value});
  state.busy=true;$('tl-save').disabled=true;say('tl-form-status','Saving...');
  try{
    const out=await call('save',{listing});
    const i=state.listings.findIndex((l)=>l.id===out.listing.id);
    if(i>=0)state.listings[i]=out.listing;else state.listings.unshift(out.listing);
    renderList();closeEditor();
    toast(out.listing.published?'Saved. It’s on the public page.':'Saved. It’s hidden from the public page.');
  }catch(e){say('tl-form-status',e.message,'bad')}
  finally{state.busy=false;$('tl-save').disabled=false}
}
async function removeListing(){
  const l=state.editing;
  if(!l||state.busy)return;
  const btn=$('tl-remove');
  if(btn.dataset.confirm!=='1'){btn.dataset.confirm='1';btn.textContent='Tap again to remove';setTimeout(()=>{btn.dataset.confirm='';btn.textContent='Remove listing'},4000);return}
  state.busy=true;
  try{await call('remove',{id:l.id});state.listings=state.listings.filter((x)=>x.id!==l.id);renderList();closeEditor();toast('Removed.')}
  catch(e){say('tl-form-status',e.message,'bad')}
  finally{state.busy=false;btn.dataset.confirm='';btn.textContent='Remove listing'}
}

// ---------- team (owner only) ----------
function renderMembers(members){
  $('tl-members').replaceChildren(...(members||[]).map((m)=>el('li',null,el('span',null,m.display_name,el('small',{text:m.email})),el('button',{class:'bo-btn bo-btn-ghost',type:'button','data-member':m.user_id,text:'Remove'}))));
  say('tl-team-status',members&&members.length?'':'No teammates added yet.');
}
async function loadMembers(){renderMembers((await call('members')).members)}

async function copyPost(id){
  const l=state.listings.find((x)=>x.id===id);
  if(!l)return;
  try{await navigator.clipboard.writeText(postText(l));toast('Post text copied.')}
  catch(_){toast('Couldn’t copy. Your browser blocked it.')}
}

function bind(){
  const drop=$('tl-drop');
  $('tl-pdf').addEventListener('change',(e)=>readPdf(e.target.files[0]));
  ['dragenter','dragover'].forEach((t)=>drop.addEventListener(t,(e)=>{e.preventDefault();drop.classList.add('is-over')}));
  ['dragleave','drop'].forEach((t)=>drop.addEventListener(t,(e)=>{e.preventDefault();drop.classList.remove('is-over')}));
  drop.addEventListener('drop',(e)=>readPdf(e.dataTransfer.files[0]));
  $('tl-manual').addEventListener('click',()=>{
    const q=$('tl-lookup').value.trim(),f={};
    if(/^[A-Z]{2,6}\d{4,12}$/i.test(q.replace(/\s+/g,'')))f.mls_number=q.replace(/\s+/g,'').toUpperCase();
    else if(q){const parts=q.split(',');f.address=parts[0].trim();if(parts[1])f.city=parts[1].trim()}
    openEditor(null,f);say('tl-form-status','');
  });
  $('tl-cancel').addEventListener('click',closeEditor);
  $('tl-photo-input').addEventListener('change',(e)=>{takePhotos(e.target.files);e.target.value=''});
  const photoDrop=$('tl-photo-drop');
  ['dragenter','dragover'].forEach((t)=>photoDrop.addEventListener(t,(e)=>{e.preventDefault();photoDrop.classList.add('is-over')}));
  ['dragleave','drop'].forEach((t)=>photoDrop.addEventListener(t,(e)=>{e.preventDefault();photoDrop.classList.remove('is-over')}));
  photoDrop.addEventListener('drop',(e)=>takePhotos(e.dataTransfer.files));
  $('tl-add-feature').addEventListener('click',()=>{const li=featureRow();$('tl-features').appendChild(li);li.children[0].focus()});
  form().addEventListener('submit',save);
  $('tl-remove').addEventListener('click',removeListing);
  document.querySelectorAll('[data-filter]').forEach((b)=>b.addEventListener('click',()=>{
    state.filter=b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x)=>x.setAttribute('aria-pressed',String(x===b)));
    renderList();
  }));
  $('tl-list').addEventListener('click',(e)=>{
    const edit=e.target.closest('[data-edit]'),copy=e.target.closest('[data-copy]');
    if(edit){const l=state.listings.find((x)=>x.id===edit.dataset.edit);if(l)openEditor(l)}
    if(copy)copyPost(copy.dataset.copy);
  });
  $('tl-list').addEventListener('change',(e)=>{const s=e.target.closest('[data-status]');if(s)changeStatus(s)});
  $('tl-team-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const els=e.target.elements;
    say('tl-team-status','Adding...');
    try{const out=await call('add_member',{email:els.email.value,name:els.name.value});e.target.reset();renderMembers(out.members);toast('Added.')}
    catch(err){say('tl-team-status',err.message,'bad')}
  });
  $('tl-members').addEventListener('click',async(e)=>{
    const b=e.target.closest('[data-member]');
    if(!b)return;
    if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='Tap again';return}
    try{renderMembers((await call('remove_member',{user_id:b.dataset.member})).members)}
    catch(err){say('tl-team-status',err.message,'bad')}
  });
}

async function init(){
  bind();
  try{
    await loadList();
    $('tl-app').hidden=false;
    if(state.owner){$('tl-team').hidden=false;loadMembers().catch((e)=>say('tl-team-status',e.message,'bad'))}
  }catch(e){
    const el=$('tl-blocked');
    el.textContent=e.message||'Team Listings couldn’t load.';
    el.hidden=false;
  }
}
window.WatchdogTeamListings={postText};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

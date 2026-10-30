/* Link Pages (Backoffice operators and team members).
   - Each person makes their own "link in bio" page, shown at /links/<slug>.
   - The preview on the right is drawn by link-page-render.js, the same file the public page uses.
   - Photos are redrawn as JPG in the browser before upload, which also drops GPS and camera info. */
(function(){
'use strict';
const API='/api/watchdog-link-pages';
const LP=window.WatchdogLinkPage;
const SIDES={profile:600,thumb:300,photo:1600,bg:2000};
const TYPE_LABEL={link:'Link',heading:'Header',text:'Text',photo:'Photo',countdown:'Countdown'};

const $=(id)=>document.getElementById(id);
const state={owner:false,userId:'',name:'',prefix:'',pages:[],page:null,dirty:false,uploads:0,slugOk:true,deleteArmed:false};
let previewTimer=null,slugTimer=null,toastTimer=null;

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
function say(id,msg,kind){const n=$(id);if(!n)return;n.textContent=msg||'';n.className='lp-status'+(kind?' is-'+kind:'')}
function toast(msg){const n=$('lp-toast');n.textContent=msg;n.hidden=false;requestAnimationFrame(()=>n.classList.add('is-shown'));clearTimeout(toastTimer);toastTimer=setTimeout(()=>{n.classList.remove('is-shown');setTimeout(()=>{n.hidden=true},250)},2600)}
function el(tag,attrs,...kids){
  const n=document.createElement(tag);
  Object.entries(attrs||{}).forEach(([k,v])=>{if(v==null||v===false)return;if(k==='text')n.textContent=String(v);else if(k==='class')n.className=v;else if(k.startsWith('data-')||k.startsWith('aria-')||['href','src','alt','type','target','rel','placeholder','maxlength','title','for','accept','rows'].includes(k))n.setAttribute(k,v===true?'':String(v));else n[k]=v});
  kids.flat().forEach((k)=>{if(k!=null&&k!==false)n.append(k)});
  return n;
}
function slugify(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'')}
function pageUrl(slug){return LP.ORIGIN+'/links/'+slug}
function photoOk(u){return typeof u==='string'&&!!state.prefix&&u.startsWith(state.prefix)}
function content(){return state.page.content}

// ---------- changes and preview ----------
function changed(){
  state.dirty=true;
  say('lp-save-status','Not saved yet');
  clearTimeout(previewTimer);
  previewTimer=setTimeout(drawPreview,150);
}
function drawPreview(){
  const frame=$('lp-frame');
  const doc=frame.contentDocument;
  if(!doc||!state.page)return;
  const clean=LP.cleanPage(content(),photoOk).page;
  const html=LP.renderPage(clean,{preview:true});
  const y=doc.scrollingElement?doc.scrollingElement.scrollTop:0;
  doc.open();doc.write(html);doc.close();
  if(y)requestAnimationFrame(()=>{if(doc.scrollingElement)doc.scrollingElement.scrollTop=y});
}

// Named form fields map to content paths like "theme.bg".
function getPath(obj,path){return path.split('.').reduce((o,k)=>o==null?o:o[k],obj)}
function setPath(obj,path,value){const keys=path.split('.');const last=keys.pop();const target=keys.reduce((o,k)=>o[k]||(o[k]={}),obj);target[last]=value}
function fieldValue(f){return f.type==='checkbox'?f.checked:f.type==='range'?Number(f.value):f.value}

function fillFields(){
  const form=$('lp-form');
  [...form.querySelectorAll('[name]')].forEach((f)=>{
    const v=getPath(content(),f.name);
    if(f.type==='checkbox')f.checked=v===true;
    else if(f.name==='theme.bg2')f.value=v||content().theme.bg;
    else f.value=v==null?'':v;
  });
  $('lp-fade').checked=!!content().theme.bg2;
  form.elements['theme.bg2'].disabled=!content().theme.bg2;
  renderPresets();renderPhotos();
}

// ---------- page picker ----------
function renderPicker(){
  const pick=$('lp-pick');
  const many=state.pages.length>1||state.owner&&state.pages.some((p)=>!p.mine);
  $('lp-pick-wrap').hidden=!many;
  pick.replaceChildren(...state.pages.map((p)=>el('option',{value:p.id,text:'/links/'+p.slug+(p.mine?'':' ('+(p.owner_name||'teammate')+')')})));
  if(state.page&&!state.page.id)pick.append(el('option',{value:'',text:'New page'}));
  pick.value=state.page&&state.page.id||'';
}
function openPage(p){
  state.page=p?{id:p.id,slug:p.slug,published:p.published,content:JSON.parse(JSON.stringify(p.content)),stats:p.stats,owner_name:p.owner_name}:newPage();
  const c=content();
  c.profile=c.profile||{};c.blocks=c.blocks||[];c.socials=c.socials||[];c.theme=c.theme||LP.blankPage('').theme;
  state.dirty=false;state.slugOk=true;state.deleteArmed=false;
  $('lp-slug').value=state.page.slug;
  $('lp-published').checked=state.page.published!==false;
  fillFields();renderBlocks();renderSocials();renderShare();renderPicker();
  $('lp-delete').hidden=!state.page.id;$('lp-delete').textContent='Delete page';
  say('lp-slug-status','');say('lp-save-status',state.page.id?'Saved':'New page, not saved yet');
  if(!state.page.id)checkSlug();
  drawPreview();
}
function newPage(){
  const mine=state.pages.filter((p)=>p.mine).length;
  const base=slugify(state.name.split(/\s+/)[0]||'')||'my-links';
  return {id:'',slug:mine?base+'-'+(mine+1):base,published:true,content:LP.blankPage(state.name),stats:{views:0,taps:{}}};
}
function renderShare(){
  const saved=!!state.page.id;
  $('lp-share').hidden=!saved;
  $('lp-open').href=saved?'/links/'+state.page.slug:'#';
  const s=state.page.stats||{views:0,taps:{}};
  const taps=Object.values(s.taps||{}).reduce((a,b)=>a+b,0);
  $('lp-stats').textContent=saved?'Last 30 days: '+s.views.toLocaleString()+' '+(s.views===1?'view':'views')+', '+taps.toLocaleString()+' '+(taps===1?'tap':'taps')+(state.page.published===false?'. The page is off right now.':''):'';
}

// ---------- slug ----------
async function checkSlug(){
  const input=$('lp-slug');
  const slug=input.value.trim().toLowerCase();
  if(!LP.SLUG.test(slug)){state.slugOk=false;say('lp-slug-status','Use lowercase letters, numbers and dashes.','bad');return}
  try{
    const out=await call('check_slug',{slug,id:state.page.id});
    if(input.value.trim().toLowerCase()!==slug)return;
    state.slugOk=out.available;
    if(!out.available)say('lp-slug-status','That one’s taken.','bad');
    else if(state.page.id&&slug!==state.page.slug)say('lp-slug-status','Available. Your old link stops working once you save.','good');
    else say('lp-slug-status',state.page.id?'':'Available','good');
  }catch(e){say('lp-slug-status',e.message,'bad')}
}

// ---------- photos ----------
async function shrink(file,side){
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,side/Math.max(bitmap.width,bitmap.height));
  const c=document.createElement('canvas');
  c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
  c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);
  bitmap.close&&bitmap.close();
  const out=await new Promise((resolve)=>c.toBlob(resolve,'image/jpeg',0.86));
  if(!out)throw new Error('That photo couldn’t be read.');
  return out;
}
async function upload(file,kind){
  if(!file)return '';
  state.uploads+=1;$('lp-save').disabled=true;say('lp-save-status','Uploading photo...');
  try{
    const jpg=await shrink(file,SIDES[kind]||1600);
    const slot=await call('photo_upload',{type:'image/jpeg'});
    const fd=new FormData();
    fd.append('cacheControl','31536000');
    fd.append('',jpg,'photo.jpg');
    const r=await fetch(slot.upload_url,{method:'PUT',headers:{'x-upsert':'false'},body:fd});
    if(!r.ok)throw new Error('The photo didn’t finish uploading. Please try again.');
    return slot.public_url;
  }catch(e){
    toast(e&&e.name==='InvalidStateError'?'This browser can’t open that photo. Try a JPG or PNG.':(e.message||'The photo didn’t upload.'));
    return '';
  }finally{
    state.uploads-=1;
    if(!state.uploads){$('lp-save').disabled=false;say('lp-save-status',state.dirty?'Not saved yet':'Saved')}
  }
}
function thumb(box,url,label){box.replaceChildren(url?el('img',{src:url,alt:label}):el('span',{text:'No photo'}))}
function renderPhotos(){
  const c=content();
  thumb($('lp-photo-preview'),c.profile.photo,'Your photo');
  $('lp-photo-remove').hidden=!c.profile.photo;
  thumb($('lp-bg-preview'),c.theme.bg_image,'Background photo');
  $('lp-bg-remove').hidden=!c.theme.bg_image;
  $('lp-dim-wrap').hidden=!c.theme.bg_image;
}

// ---------- look ----------
function renderPresets(){
  const now=content().theme.preset;
  $('lp-presets').replaceChildren(...Object.entries(LP.PRESETS).map(([key,p])=>{
    const b=el('button',{type:'button',class:'lp-preset','data-preset':key,'aria-pressed':String(now===key)},
      el('span',{class:'lp-swatch','aria-hidden':'true',style:'background:'+(p.bg2?'linear-gradient(180deg,'+p.bg+','+p.bg2+')':p.bg)},el('i',{style:'background:'+p.button}),el('i',{style:'background:'+p.accent})),
      el('b',{text:p.label}));
    return b;
  }));
}
function applyPreset(key){
  const p=LP.PRESETS[key];if(!p)return;
  const t=content().theme;
  Object.assign(t,LP.stripLabel(p),{preset:key});
  fillFields();changed();
}

// ---------- blocks ----------
function blockField(b,key,label,attrs){
  const tag=attrs&&attrs.rows?'textarea':'input';
  const input=el(tag,Object.assign({},attrs||{}));
  input.value=b[key]==null?'':b[key];
  input.addEventListener('input',()=>{b[key]=input.value;changed()});
  return el('label',{class:'lp-field'+(attrs&&attrs.wide?' lp-full':'')},label,input);
}
function blockCheck(b,key,label){
  const input=el('input',{type:'checkbox'});input.checked=b[key]===true;
  input.addEventListener('change',()=>{b[key]=input.checked;changed()});
  return el('label',{class:'lp-check'},input,' '+label);
}
function blockPhoto(b,key,kind,label){
  const box=el('div',{class:'lp-block-photo'});
  const id='lp-up-'+b.id+'-'+key;
  const file=el('input',{class:'bo-sr',id,type:'file',accept:'image/jpeg,image/png,image/webp,image/heic,image/heif'});
  const remove=el('button',{type:'button',class:'bo-btn bo-btn-ghost',text:'Remove',hidden:!b[key]});
  const draw=()=>{thumb(box,b[key],label);remove.hidden=!b[key]};
  file.addEventListener('change',async()=>{const url=await upload(file.files[0],kind);file.value='';if(url){b[key]=url;draw();changed()}});
  remove.addEventListener('click',()=>{b[key]='';draw();changed()});
  draw();
  return el('div',{class:'lp-photo-pick'},box,el('div',{class:'lp-row-btns'},el('label',{class:'bo-btn bo-btn-ghost',for:id,text:b[key]?'Change':'Upload'}),file,remove));
}
function blockBody(b){
  if(b.type==='link')return [
    el('div',{class:'lp-grid'},
      blockField(b,'label','Title',{maxlength:80,wide:true}),
      blockField(b,'url','Link',{maxlength:500,placeholder:'Website, email or phone number',wide:true}),
      blockField(b,'tag','Small text above the title',{maxlength:40,wide:true})),
    el('div',{class:'lp-block-opts'},blockPhoto(b,'image','thumb','Link photo'),blockCheck(b,'featured','Highlight this link'))];
  if(b.type==='heading')return [blockField(b,'text','Header',{maxlength:80})];
  if(b.type==='text')return [blockField(b,'text','Text',{maxlength:500,rows:3})];
  if(b.type==='photo')return [blockPhoto(b,'image','photo','Photo'),el('div',{class:'lp-grid'},blockField(b,'url','Link (optional)',{maxlength:500,placeholder:'Website, email or phone number'}),blockField(b,'alt','What’s in the photo',{maxlength:120}))];
  if(b.type==='countdown')return [el('div',{class:'lp-grid'},blockField(b,'title','Title',{maxlength:80}),blockField(b,'date','Counts down to (NJ time)',{type:'datetime-local'}))];
  return [];
}
function tool(label,text,fn,extra){const b=el('button',Object.assign({type:'button',class:'lp-tool','aria-label':label,title:label,text},extra||{}));b.addEventListener('click',fn);return b}
function move(list,i,dir,render){const j=i+dir;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];render();changed()}
function renderBlocks(){
  const list=content().blocks;
  const taps=state.page.stats&&state.page.stats.taps||{};
  $('lp-blocks').replaceChildren(...list.map((b,i)=>{
    const name=b.type==='link'?(b.label||'New link'):b.type==='heading'?(b.text||'Header'):TYPE_LABEL[b.type];
    const count=taps[b.id];
    return el('li',{class:'lp-block'+(b.hidden?' is-hidden':'')},
      el('div',{class:'lp-block-head'},
        el('span',{class:'lp-block-type',text:TYPE_LABEL[b.type]}),
        el('b',{text:name}),
        count?el('span',{class:'lp-taps',text:count.toLocaleString()+' '+(count===1?'tap':'taps')}):null,
        el('span',{class:'lp-tools'},
          tool('Move up','↑',()=>move(list,i,-1,renderBlocks),{disabled:i===0}),
          tool('Move down','↓',()=>move(list,i,1,renderBlocks),{disabled:i===list.length-1}),
          tool(b.hidden?'Show':'Hide',b.hidden?'Show':'Hide',()=>{b.hidden=!b.hidden;renderBlocks();changed()}),
          tool('Delete','×',()=>{list.splice(i,1);renderBlocks();changed()}))),
      el('div',{class:'lp-block-body'},blockBody(b)));
  }));
}
function addBlock(type){
  const list=content().blocks;
  if(list.length>=LP.MAX_BLOCKS){toast('That’s the most a page can hold.');return}
  const b={id:LP.newId(),type,hidden:false};
  if(type==='link')Object.assign(b,{label:'',tag:'',url:'',image:'',featured:false});
  if(type==='heading'||type==='text')b.text='';
  if(type==='photo')Object.assign(b,{image:'',url:'',alt:''});
  if(type==='countdown')Object.assign(b,{title:'',date:''});
  list.push(b);renderBlocks();changed();
  const last=$('lp-blocks').lastElementChild;
  const first=last&&last.querySelector('input,textarea,label.bo-btn');
  if(first){last.scrollIntoView({block:'nearest',behavior:'smooth'});if(first.focus)first.focus({preventScroll:true})}
}

// ---------- socials ----------
function hint(network){const n=LP.NETWORKS[network];return n.contact==='email'?'Email address':n.contact==='phone'?'Phone number':n.url?'@handle or link':'https://'}
function renderSocials(){
  const list=content().socials;
  const taps=state.page.stats&&state.page.stats.taps||{};
  $('lp-socials').replaceChildren(...list.map((s,i)=>{
    const pick=el('select',{'aria-label':'Site'});
    pick.append(...Object.entries(LP.NETWORKS).map(([k,n])=>el('option',{value:k,text:n.label})));
    pick.value=s.network;
    const input=el('input',{'aria-label':'Handle or link',maxlength:300,placeholder:hint(s.network)});
    input.value=s.url||'';
    pick.addEventListener('change',()=>{s.network=pick.value;input.placeholder=hint(s.network);changed()});
    input.addEventListener('input',()=>{s.url=input.value;changed()});
    const count=taps[s.id];
    return el('li',null,pick,input,count?el('span',{class:'lp-taps',text:count+(count===1?' tap':' taps')}):null,el('span',{class:'lp-tools'},
      tool('Move up','↑',()=>move(list,i,-1,renderSocials),{disabled:i===0}),
      tool('Move down','↓',()=>move(list,i,1,renderSocials),{disabled:i===list.length-1}),
      tool('Delete','×',()=>{list.splice(i,1);renderSocials();changed()})));
  }));
}

// ---------- save, delete, share ----------
async function save(e){
  if(e)e.preventDefault();
  if(state.uploads){toast('Wait for the photo to finish uploading.');return}
  const slug=$('lp-slug').value.trim().toLowerCase();
  if(!LP.SLUG.test(slug)){say('lp-save-status','Fix your link first.','bad');$('lp-slug').focus();return}
  const checked=LP.cleanPage(content(),photoOk);
  if(checked.errors.length){say('lp-save-status',checked.errors[0],'bad');return}
  $('lp-save').disabled=true;say('lp-save-status','Saving...');
  try{
    const out=await call('save',{page:{id:state.page.id,slug,published:$('lp-published').checked,content:content()}});
    const i=state.pages.findIndex((p)=>p.id===out.page.id);
    if(i>=0)state.pages[i]=out.page;else state.pages.push(out.page);
    openPage(out.page);
    say('lp-save-status','Saved','good');
    toast('Saved. Changes show on the live page within a minute.');
  }catch(err){say('lp-save-status',err.message,'bad')}
  finally{$('lp-save').disabled=false}
}
async function remove(){
  if(!state.page.id)return;
  if(!state.deleteArmed){state.deleteArmed=true;$('lp-delete').textContent='Tap again to delete';setTimeout(()=>{state.deleteArmed=false;$('lp-delete').textContent='Delete page'},4000);return}
  try{
    await call('remove',{id:state.page.id});
    state.pages=state.pages.filter((p)=>p.id!==state.page.id);
    const next=state.pages.find((p)=>p.mine)||state.pages[0];
    openPage(next||null);
    toast('Page deleted.');
  }catch(e){toast(e.message)}
}
async function copyLink(){
  try{await navigator.clipboard.writeText(pageUrl(state.page.slug));toast('Link copied.')}
  catch(_){toast('Couldn’t copy. Your browser blocked it.')}
}
function downloadQr(){
  if(!window.QRCode){toast('The QR maker didn’t load. Refresh and try again.');return}
  const box=document.createElement('div');
  new window.QRCode(box,{text:pageUrl(state.page.slug),width:720,height:720,colorDark:'#000000',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
  const canvas=box.querySelector('canvas');
  if(!canvas){toast('Couldn’t make the QR code.');return}
  const out=document.createElement('canvas');
  out.width=out.height=800;
  const ctx=out.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,800,800);ctx.drawImage(canvas,40,40);
  const a=document.createElement('a');a.download='link-page-'+state.page.slug+'-qr.png';a.href=out.toDataURL('image/png');a.click();
}

// ---------- events ----------
function bind(){
  const form=$('lp-form');
  form.addEventListener('submit',save);
  form.addEventListener('input',(e)=>{
    const f=e.target;
    if(!f.name||!state.page)return;
    setPath(content(),f.name,fieldValue(f));
    if(f.name.startsWith('theme.')&&f.name!=='theme.bg_dim'&&f.name!=='theme.font'&&f.name!=='theme.button_style'&&f.name!=='theme.corners'){content().theme.preset='custom';renderPresets()}
    changed();
  });
  $('lp-fade').addEventListener('change',()=>{
    const t=content().theme;const bg2=form.elements['theme.bg2'];
    bg2.disabled=!$('lp-fade').checked;
    t.bg2=$('lp-fade').checked?bg2.value:'';
    t.preset='custom';renderPresets();changed();
  });
  $('lp-presets').addEventListener('click',(e)=>{const b=e.target.closest('[data-preset]');if(b)applyPreset(b.dataset.preset)});
  $('lp-font').replaceChildren(...Object.entries(LP.FONTS).map(([k,f])=>el('option',{value:k,text:f.label})));
  document.querySelectorAll('[data-add]').forEach((b)=>b.addEventListener('click',()=>addBlock(b.dataset.add)));
  $('lp-add-social').addEventListener('click',()=>{
    const list=content().socials;
    if(list.length>=LP.MAX_SOCIALS){toast('That’s the most icons a page can hold.');return}
    const used=new Set(list.map((s)=>s.network));
    const network=Object.keys(LP.NETWORKS).find((k)=>!used.has(k))||'website';
    list.push({id:LP.newId(),network,url:''});renderSocials();changed();
    const last=$('lp-socials').lastElementChild;if(last)last.querySelector('input').focus();
  });
  $('lp-photo-input').addEventListener('change',async(e)=>{const url=await upload(e.target.files[0],'profile');e.target.value='';if(url){content().profile.photo=url;renderPhotos();changed()}});
  $('lp-photo-remove').addEventListener('click',()=>{content().profile.photo='';renderPhotos();changed()});
  $('lp-bg-input').addEventListener('change',async(e)=>{const url=await upload(e.target.files[0],'bg');e.target.value='';if(url){content().theme.bg_image=url;renderPhotos();changed()}});
  $('lp-bg-remove').addEventListener('click',()=>{content().theme.bg_image='';renderPhotos();changed()});
  $('lp-slug').addEventListener('input',()=>{
    const input=$('lp-slug');
    const clean=input.value.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-{2,}/g,'-').replace(/^-/,'').slice(0,40);
    if(clean!==input.value)input.value=clean;
    state.dirty=true;say('lp-save-status','Not saved yet');
    clearTimeout(slugTimer);slugTimer=setTimeout(checkSlug,400);
  });
  $('lp-published').addEventListener('change',()=>{state.dirty=true;say('lp-save-status','Not saved yet')});
  $('lp-copy').addEventListener('click',copyLink);
  $('lp-qr').addEventListener('click',downloadQr);
  $('lp-delete').addEventListener('click',remove);
  $('lp-new').addEventListener('click',()=>{
    if(state.dirty){toast('Save this page first.');return}
    openPage(null);$('lp-slug').focus();
  });
  $('lp-pick').addEventListener('change',()=>{
    const p=state.pages.find((x)=>x.id===$('lp-pick').value);
    if(state.dirty){toast('Save this page first.');renderPicker();return}
    if(p)openPage(p);
  });
  window.addEventListener('beforeunload',(e)=>{if(state.dirty){e.preventDefault();e.returnValue=''}});
}

async function init(){
  if(!LP){$('lp-blocked').textContent='Link Pages couldn’t load. Refresh to try again.';$('lp-blocked').hidden=false;return}
  bind();
  try{
    const data=await call('list');
    Object.assign(state,{owner:data.owner,userId:data.user_id,name:data.name||'',prefix:data.photo_prefix||'',pages:data.pages||[]});
    $('lp-app').hidden=false;
    const mine=state.pages.find((p)=>p.mine);
    openPage(mine||null);
  }catch(e){
    $('lp-blocked').textContent=e.message||'Link Pages couldn’t load.';
    $('lp-blocked').hidden=false;
    $('lp-new').hidden=true;
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

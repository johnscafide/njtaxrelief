(function(){
'use strict';
if(window.__WATCHDOG_NEWSLETTER_BRAND_KIT__)return;
window.__WATCHDOG_NEWSLETTER_BRAND_KIT__=true;

var BUCKET='marketing-email-brand-assets';
var db=null,user=null;
var brands=[],templates=[];
var currentBrand=null;
var selectedTemplate='email_premium_editorial_v1';
var dirty=false,busy=false;
var $=function(id){return document.getElementById(id);};

var DEFAULT_KIT={
  version:1,
  colors:{primary:'#102A4C',secondary:'#087F7A',accent:'#77D6CF',background:'#F5F7F9',surface:'#FFFFFF',text:'#17212B',muted:'#6A7889'},
  typography:{
    heading:{preferred:'Georgia',fallback:"Georgia, 'Times New Roman', serif"},
    body:{preferred:'Arial',fallback:'Arial, Helvetica, sans-serif'},
    button:{preferred:'Arial',fallback:'Arial, Helvetica, sans-serif'}
  },
  logos:{primary:null,light:null,dark:null,mark:null},
  style:{personality:'editorial',button_style:'rounded',corner_radius:'medium',image_style:'rounded',content_width:'standard'},
  newsletter:{default_template_key:'email_premium_editorial_v1'}
};

var FALLBACK_TEMPLATES=[
  {template_key:'email_basic_clean_v1',title:'Basic · Clean Update',description:'Simple, personal and easy to read.',layout_key:'email_basic_clean',content:{tier:'basic',badge:'Basic',summary:'Simple, personal and easy to read.'}},
  {template_key:'email_deluxe_modern_v1',title:'Deluxe · Modern Brief',description:'Designed, modern and visually organized.',layout_key:'email_deluxe_modern',content:{tier:'deluxe',badge:'Deluxe',summary:'Designed, modern and visually organized.'}},
  {template_key:'email_premium_editorial_v1',title:'Premium · Editorial Intelligence',description:'Editorial, premium and publication-grade.',layout_key:'email_premium_editorial',content:{tier:'premium',badge:'Premium',summary:'Editorial, premium and publication-grade.'}}
];

function clone(v){return JSON.parse(JSON.stringify(v));}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function attr(v){return esc(v).replace(/`/g,'&#96;');}
function clean(v,max){return String(v==null?'':v).replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,max||500);}
function safeUrl(v){var s=String(v||'').trim();if(!s)return'';try{var u=new URL(s,location.origin);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return'';}}
function color(v,fallback){var s=String(v||'').trim().toUpperCase();return /^#[0-9A-F]{6}$/.test(s)?s:fallback;}
function fontName(v,fallback){var s=String(v||'').replace(/[<>;{}]/g,'').trim().slice(0,80);return s||fallback;}
function nowIso(){return new Date().toISOString();}
function uid(){return user&&user.id||'';}
function note(msg,isError){var n=$('nl-brand-note');if(!n)return;n.textContent=msg||'';n.classList.toggle('error',!!isError);}
function setBusy(on){busy=!!on;var root=$('nl-brand-studio');if(root)root.setAttribute('aria-busy',on?'true':'false');if(root)root.querySelectorAll('button,input,select,textarea').forEach(function(el){el.disabled=!!on;});}
function deepMerge(base,extra){
  var out=clone(base);if(!extra||typeof extra!=='object')return out;
  Object.keys(extra).forEach(function(k){
    if(extra[k]&&typeof extra[k]==='object'&&!Array.isArray(extra[k])&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k]))out[k]=deepMerge(out[k],extra[k]);
    else out[k]=extra[k];
  });return out;
}
function brandKitOf(row){return deepMerge(DEFAULT_KIT,row&&row.profile&&row.profile.brand_kit||{});}
function currentKit(){return readBrandForm();}
function chosenTemplate(){return templates.find(function(t){return t.template_key===selectedTemplate;})||FALLBACK_TEMPLATES.find(function(t){return t.template_key===selectedTemplate;})||FALLBACK_TEMPLATES[2];}

function inject(){
  var workspace=$('nl-workspace'),nav=document.querySelector('.nl-jump-nav');if(!workspace||!nav||$('nl-brand-studio'))return false;
  var designLink=document.createElement('a');designLink.href='#nl-brand-studio';designLink.innerHTML='<i class="fas fa-palette"></i><span>Design</span>';nav.insertBefore(designLink,nav.firstChild);

  var section=document.createElement('section');section.id='nl-brand-studio';section.className='nl-card nl-brand-studio';
  section.innerHTML='\
    <header class="nl-brand-head">\
      <div><span class="nl-eyebrow">DESIGN STUDIO</span><h2>Template + Brand Kit</h2><p>Choose a layout once, apply your saved brand, then build email-safe HTML without leaving Watchdog.</p></div>\
      <span class="nl-brand-beta"><i class="fas fa-wand-magic-sparkles"></i> Brand-aware templates</span>\
    </header>\
    <div class="nl-design-step"><span>1</span><div><b>Choose a template</b><small>The same newsletter content can be rendered as Basic, Deluxe or Premium.</small></div></div>\
    <div class="nl-template-grid" id="nl-template-grid"><div class="nl-brand-loading">Loading templates…</div></div>\
    <div class="nl-design-split">\
      <details class="nl-brand-panel" id="nl-brand-panel" open>\
        <summary><div><span class="nl-design-step-mini">2</span><b>Brand Kit</b><small id="nl-brand-summary">Colors, type and logos</small></div><i class="fas fa-chevron-down"></i></summary>\
        <div class="nl-brand-panel-body">\
          <div class="nl-brand-toolbar">\
            <label>Saved brand<select id="nl-brand-select"></select></label>\
            <button class="nl-btn" type="button" id="nl-brand-new"><i class="fas fa-plus"></i> New brand</button>\
          </div>\
          <div class="nl-field-row"><label>Brand name<input id="nl-brand-name" maxlength="120" placeholder="My Brand"></label><label class="nl-brand-default-label"><span>Default brand</span><span class="nl-switch"><input id="nl-brand-default" type="checkbox"><i></i></span></label></div>\
          <div class="nl-brand-subhead"><div><b>Color palette</b><small>Saved swatches flow into every compatible template.</small></div></div>\
          <div class="nl-swatch-grid" id="nl-swatch-grid"></div>\
          <div class="nl-brand-subhead"><div><b>Typography</b><small>Save the brand font plus a reliable inbox fallback.</small></div></div>\
          <div class="nl-type-grid">\
            <label>Heading font<input id="nl-font-heading" maxlength="80" placeholder="Georgia"></label>\
            <label>Heading fallback<select id="nl-font-heading-fallback"><option value="Georgia, 'Times New Roman', serif">Georgia / Times</option><option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option><option value="'Trebuchet MS', Arial, sans-serif">Trebuchet / Arial</option><option value="'Times New Roman', Times, serif">Times New Roman</option></select></label>\
            <label>Body font<input id="nl-font-body" maxlength="80" placeholder="Arial"></label>\
            <label>Body fallback<select id="nl-font-body-fallback"><option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option><option value="'Trebuchet MS', Arial, sans-serif">Trebuchet / Arial</option><option value="Verdana, Geneva, sans-serif">Verdana / Geneva</option><option value="Georgia, 'Times New Roman', serif">Georgia / Times</option></select></label>\
          </div>\
          <div class="nl-font-note"><i class="fas fa-circle-info"></i><span>Watchdog remembers your preferred font name, but generated email uses the fallback stack for consistent Gmail, Apple Mail and Outlook rendering.</span></div>\
          <div class="nl-brand-subhead"><div><b>Logo set</b><small>Upload the right mark for light, dark and compact placements.</small></div></div>\
          <div class="nl-logo-grid" id="nl-logo-grid"></div>\
          <div class="nl-brand-subhead"><div><b>Visual style</b><small>These preferences can later carry into direct mail, ads and landing pages.</small></div></div>\
          <div class="nl-style-grid">\
            <label>Personality<select id="nl-style-personality"><option value="minimal">Minimal</option><option value="modern">Modern</option><option value="editorial">Editorial</option><option value="luxury">Luxury</option><option value="bold">Bold</option></select></label>\
            <label>Buttons<select id="nl-style-button"><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square">Square</option></select></label>\
            <label>Corners<select id="nl-style-radius"><option value="soft">Soft</option><option value="medium">Medium</option><option value="sharp">Sharp</option></select></label>\
            <label>Images<select id="nl-style-image"><option value="rounded">Rounded</option><option value="full_bleed">Full bleed</option><option value="framed">Framed</option></select></label>\
            <label>Content width<select id="nl-style-width"><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>\
          </div>\
          <div class="nl-brand-actions"><button class="nl-btn primary" type="button" id="nl-brand-save"><i class="fas fa-floppy-disk"></i> Save Brand Kit</button><button class="nl-btn danger" type="button" id="nl-brand-delete"><i class="fas fa-trash"></i> Delete</button><span class="nl-form-note" id="nl-brand-note"></span></div>\
        </div>\
      </details>\
      <details class="nl-brand-panel nl-content-builder" id="nl-template-builder" open>\
        <summary><div><span class="nl-design-step-mini">3</span><b>Newsletter content</b><small>Fill the story fields, then build the HTML.</small></div><i class="fas fa-chevron-down"></i></summary>\
        <div class="nl-brand-panel-body">\
          <div class="nl-builder-grid">\
            <label>Edition label<input id="nl-build-kicker" maxlength="80" placeholder="WEEKLY BRIEF"></label>\
            <label>Main headline<input id="nl-build-headline" maxlength="180" placeholder="Four things worth knowing right now"></label>\
          </div>\
          <label>Introduction<textarea id="nl-build-intro" rows="3" maxlength="900" placeholder="A short opening that tells readers what is inside."></textarea></label>\
          <label>Hero image URL <small>optional</small><input id="nl-build-hero" type="url" maxlength="1200" placeholder="https://..."></label>\
          <details class="nl-story-block" open><summary><b>Feature story</b><span>Primary article</span></summary><div class="nl-story-fields">\
            <label>Title<input id="nl-story-1-title" maxlength="220"></label><label>Summary<textarea id="nl-story-1-summary" rows="3" maxlength="1000"></textarea></label>\
            <div class="nl-field-row"><label>Article URL<input id="nl-story-1-url" type="url" maxlength="1200"></label><label>Button text<input id="nl-story-1-cta" maxlength="80" placeholder="Read the story"></label></div>\
          </div></details>\
          <details class="nl-story-block"><summary><b>Story 2</b><span>Supporting story</span></summary><div class="nl-story-fields"><label>Title<input id="nl-story-2-title" maxlength="220"></label><label>Summary<textarea id="nl-story-2-summary" rows="3" maxlength="1000"></textarea></label><label>Article URL<input id="nl-story-2-url" type="url" maxlength="1200"></label></div></details>\
          <details class="nl-story-block"><summary><b>Story 3</b><span>Supporting story</span></summary><div class="nl-story-fields"><label>Title<input id="nl-story-3-title" maxlength="220"></label><label>Summary<textarea id="nl-story-3-summary" rows="3" maxlength="1000"></textarea></label><label>Article URL<input id="nl-story-3-url" type="url" maxlength="1200"></label></div></details>\
          <details class="nl-story-block"><summary><b>Story 4</b><span>Supporting story</span></summary><div class="nl-story-fields"><label>Title<input id="nl-story-4-title" maxlength="220"></label><label>Summary<textarea id="nl-story-4-summary" rows="3" maxlength="1000"></textarea></label><label>Article URL<input id="nl-story-4-url" type="url" maxlength="1200"></label></div></details>\
          <details class="nl-story-block"><summary><b>Closing call to action</b><span>Optional</span></summary><div class="nl-story-fields"><label>CTA headline<input id="nl-build-cta-title" maxlength="180" placeholder="Ready to learn more?"></label><label>CTA copy<textarea id="nl-build-cta-copy" rows="2" maxlength="700"></textarea></label><div class="nl-field-row"><label>Button URL<input id="nl-build-cta-url" type="url" maxlength="1200"></label><label>Button text<input id="nl-build-cta-button" maxlength="80" placeholder="Learn more"></label></div></div></details>\
          <label>Footer line <small>optional</small><input id="nl-build-footer" maxlength="240" placeholder="Helpful updates from your local real estate resource."></label>\
          <div class="nl-builder-actions"><button class="nl-btn" type="button" id="nl-build-sample"><i class="fas fa-sparkles"></i> Load sample</button><button class="nl-btn primary" type="button" id="nl-build-html"><i class="fas fa-wand-magic-sparkles"></i> Build newsletter HTML</button><span class="nl-form-note" id="nl-build-note"></span></div>\
        </div>\
      </details>\
    </div>\
    <div class="nl-design-foot"><i class="fas fa-code"></i><span>The generated HTML appears in the existing email-content editor below. You can still edit or replace the raw HTML before sending.</span></div>';

  var connections=$('nl-connections-panel');workspace.insertBefore(section,connections||workspace.firstChild);
  renderSwatches();renderLogoSlots();bind();
  return true;
}

function renderSwatches(){
  var root=$('nl-swatch-grid');if(!root)return;
  var items=[['primary','Primary'],['secondary','Secondary'],['accent','Accent'],['background','Background'],['surface','Surface'],['text','Text'],['muted','Muted']];
  root.innerHTML=items.map(function(x){return '<label class="nl-swatch-field"><span>'+esc(x[1])+'</span><div><input type="color" id="nl-color-'+x[0]+'-picker" value="'+DEFAULT_KIT.colors[x[0]]+'"><input id="nl-color-'+x[0]+'" maxlength="7" value="'+DEFAULT_KIT.colors[x[0]]+'" spellcheck="false"></div></label>';}).join('');
  items.forEach(function(x){var p=$('nl-color-'+x[0]+'-picker'),t=$('nl-color-'+x[0]);p.addEventListener('input',function(){t.value=p.value.toUpperCase();dirty=true;paintTemplateCards();});t.addEventListener('input',function(){var c=color(t.value,'');if(c){p.value=c;dirty=true;paintTemplateCards();}});});
}
function renderLogoSlots(){
  var root=$('nl-logo-grid');if(!root)return;
  var items=[['primary','Primary','Best general-purpose logo'],['light','Light','For dark backgrounds'],['dark','Dark','For light backgrounds'],['mark','Mark','Compact icon or monogram']];
  root.innerHTML=items.map(function(x){return '<article class="nl-logo-slot" data-variant="'+x[0]+'"><div class="nl-logo-preview" id="nl-logo-preview-'+x[0]+'"><i class="fas fa-image"></i></div><div><b>'+x[1]+'</b><small>'+x[2]+'</small><label class="nl-logo-upload"><input type="file" id="nl-logo-file-'+x[0]+'" accept="image/png,image/jpeg,image/webp"><span><i class="fas fa-arrow-up-from-bracket"></i> Upload</span></label><button class="nl-logo-remove" type="button" id="nl-logo-remove-'+x[0]+'" hidden>Remove</button></div></article>';}).join('');
  items.forEach(function(x){$('nl-logo-file-'+x[0]).addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(f)uploadLogo(x[0],f);e.target.value='';});$('nl-logo-remove-'+x[0]).addEventListener('click',function(){removeLogo(x[0]);});});
}

function bind(){
  $('nl-brand-select').addEventListener('change',function(){selectBrand(this.value);});
  $('nl-brand-new').addEventListener('click',newBrand);
  $('nl-brand-save').addEventListener('click',function(){saveBrand(false);});
  $('nl-brand-delete').addEventListener('click',deleteBrand);
  $('nl-build-html').addEventListener('click',buildHtml);
  $('nl-build-sample').addEventListener('click',loadSample);
  $('nl-brand-studio').addEventListener('input',function(e){if(e.target.closest('.nl-brand-panel'))dirty=true;});
  $('nl-brand-studio').addEventListener('change',function(e){if(e.target.closest('.nl-brand-panel'))dirty=true;});
}

async function initDb(){
  var rt=window.NJPTRSupabaseRuntime;if(!rt||!rt.createClient)return false;db=rt.createClient();var s=await db.auth.getSession();user=s&&s.data&&s.data.session&&s.data.session.user||null;return !!user;
}
async function load(){
  if(!await initDb())return;
  var results=await Promise.all([
    db.from('marketing_brand_profiles').select('id,name,is_default,profile,created_at,updated_at').eq('user_id',uid()).order('is_default',{ascending:false}).order('updated_at',{ascending:false}),
    db.from('marketing_creative_templates').select('template_key,title,description,layout_key,content,sort_order').eq('creative_type','email').eq('active',true).order('sort_order',{ascending:true})
  ]);
  brands=results[0].data||[];templates=results[1].data&&results[1].data.length?results[1].data:FALLBACK_TEMPLATES;
  renderTemplates();renderBrandSelect();
  var first=brands.find(function(b){return b.is_default;})||brands[0]||null;
  if(first)selectBrand(first.id);else newBrand();
}

function renderBrandSelect(){
  var s=$('nl-brand-select');if(!s)return;
  s.innerHTML=(brands.length?brands.map(function(b,i){return '<option value="'+attr(b.id)+'">'+esc(b.name)+(b.is_default?' · default':'')+(brands.filter(function(x){return x.name===b.name;}).length>1?' · '+(i+1):'')+'</option>';}).join(''):'<option value="">New brand</option>');
  if(currentBrand&&currentBrand.id)s.value=currentBrand.id;
}
function newBrand(){
  currentBrand={id:null,name:'My Brand',is_default:brands.length===0,profile:{brand_kit:clone(DEFAULT_KIT)}};selectedTemplate=DEFAULT_KIT.newsletter.default_template_key;fillBrandForm();renderBrandSelect();dirty=false;note('New brand ready. Save it before uploading logos.');
}
function selectBrand(id){
  if(dirty&&currentBrand&&currentBrand.id&&id!==currentBrand.id&&!window.confirm('Switch brands without saving the current changes?')){renderBrandSelect();return;}
  var b=brands.find(function(x){return x.id===id;});if(!b)return;currentBrand=clone(b);var kit=brandKitOf(currentBrand);selectedTemplate=kit.newsletter&&kit.newsletter.default_template_key||selectedTemplate;fillBrandForm();dirty=false;note('');
}
function fillBrandForm(){
  var kit=brandKitOf(currentBrand);$('nl-brand-name').value=currentBrand&&currentBrand.name||'My Brand';$('nl-brand-default').checked=!!(currentBrand&&currentBrand.is_default);
  Object.keys(DEFAULT_KIT.colors).forEach(function(k){var c=color(kit.colors[k],DEFAULT_KIT.colors[k]);$('nl-color-'+k).value=c;$('nl-color-'+k+'-picker').value=c;});
  $('nl-font-heading').value=kit.typography.heading.preferred||'Georgia';$('nl-font-heading-fallback').value=kit.typography.heading.fallback||DEFAULT_KIT.typography.heading.fallback;
  $('nl-font-body').value=kit.typography.body.preferred||'Arial';$('nl-font-body-fallback').value=kit.typography.body.fallback||DEFAULT_KIT.typography.body.fallback;
  $('nl-style-personality').value=kit.style.personality||'editorial';$('nl-style-button').value=kit.style.button_style||'rounded';$('nl-style-radius').value=kit.style.corner_radius||'medium';$('nl-style-image').value=kit.style.image_style||'rounded';$('nl-style-width').value=kit.style.content_width||'standard';
  renderLogos(kit.logos||{});paintTemplateCards();var summary=$('nl-brand-summary');if(summary)summary.textContent=(currentBrand&&currentBrand.name||'My Brand')+' · '+Object.values(kit.logos||{}).filter(Boolean).length+' logo variant'+(Object.values(kit.logos||{}).filter(Boolean).length===1?'':'s');
  $('nl-brand-delete').hidden=!(currentBrand&&currentBrand.id);
}
function readBrandForm(){
  var kit=brandKitOf(currentBrand);Object.keys(DEFAULT_KIT.colors).forEach(function(k){kit.colors[k]=color($('nl-color-'+k).value,DEFAULT_KIT.colors[k]);});
  kit.typography.heading.preferred=fontName($('nl-font-heading').value,'Georgia');kit.typography.heading.fallback=$('nl-font-heading-fallback').value;
  kit.typography.body.preferred=fontName($('nl-font-body').value,'Arial');kit.typography.body.fallback=$('nl-font-body-fallback').value;kit.typography.button=clone(kit.typography.body);
  kit.style={personality:$('nl-style-personality').value,button_style:$('nl-style-button').value,corner_radius:$('nl-style-radius').value,image_style:$('nl-style-image').value,content_width:$('nl-style-width').value};
  kit.newsletter=kit.newsletter||{};kit.newsletter.default_template_key=selectedTemplate;kit.updated_at=nowIso();return kit;
}
async function saveBrand(quiet){
  if(busy)return null;var name=clean($('nl-brand-name').value,120);if(!name){note('Give this Brand Kit a name.',true);return null;}setBusy(true);if(!quiet)note('Saving Brand Kit…');
  try{
    var kit=readBrandForm(),base=currentBrand&&currentBrand.profile&&typeof currentBrand.profile==='object'?clone(currentBrand.profile):{};base.brand_kit=kit;var makeDefault=$('nl-brand-default').checked;
    if(makeDefault)await db.from('marketing_brand_profiles').update({is_default:false,updated_at:nowIso()}).eq('user_id',uid());
    var q;
    if(currentBrand&&currentBrand.id)q=await db.from('marketing_brand_profiles').update({name:name,is_default:makeDefault,profile:base,updated_at:nowIso()}).eq('id',currentBrand.id).eq('user_id',uid()).select('id,name,is_default,profile,created_at,updated_at').single();
    else q=await db.from('marketing_brand_profiles').insert({user_id:uid(),name:name,is_default:makeDefault,profile:base}).select('id,name,is_default,profile,created_at,updated_at').single();
    if(q.error)throw q.error;currentBrand=q.data;var idx=brands.findIndex(function(b){return b.id===currentBrand.id;});if(idx>=0)brands[idx]=currentBrand;else brands.unshift(currentBrand);if(makeDefault)brands=brands.map(function(b){if(b.id!==currentBrand.id)b.is_default=false;return b;});renderBrandSelect();fillBrandForm();dirty=false;if(!quiet)note('Brand Kit saved.');return currentBrand;
  }catch(err){note(err.message||'Brand Kit could not be saved.',true);return null;}finally{setBusy(false);}
}
async function deleteBrand(){
  if(!currentBrand||!currentBrand.id||busy)return;if(!window.confirm('Delete this Brand Kit? Uploaded public logo files will also be removed when possible.'))return;setBusy(true);note('Deleting Brand Kit…');
  try{var kit=brandKitOf(currentBrand),paths=Object.values(kit.logos||{}).map(function(x){return x&&x.path;}).filter(Boolean);if(paths.length)await db.storage.from(BUCKET).remove(paths);var q=await db.from('marketing_brand_profiles').delete().eq('id',currentBrand.id).eq('user_id',uid());if(q.error)throw q.error;brands=brands.filter(function(b){return b.id!==currentBrand.id;});currentBrand=null;renderBrandSelect();if(brands.length)selectBrand((brands.find(function(b){return b.is_default;})||brands[0]).id);else newBrand();note('Brand Kit deleted.');}catch(err){note(err.message||'Brand Kit could not be deleted.',true);}finally{setBusy(false);}
}
function renderLogos(logos){['primary','light','dark','mark'].forEach(function(k){var p=$('nl-logo-preview-'+k),r=$('nl-logo-remove-'+k),logo=logos&&logos[k];if(logo&&safeUrl(logo.url)){p.innerHTML='<img src="'+attr(logo.url)+'" alt="'+esc(k)+' logo">';r.hidden=false;}else{p.innerHTML='<i class="fas fa-image"></i>';r.hidden=true;}});}
async function uploadLogo(variant,file){
  if(busy)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){note('Use a PNG, JPG or WebP logo.',true);return;}if(file.size>5242880){note('Logo files must be 5 MB or smaller.',true);return;}
  if(!currentBrand||!currentBrand.id){var saved=await saveBrand(true);if(!saved)return;}
  setBusy(true);note('Uploading '+variant+' logo…');
  try{var ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path='user/'+uid()+'/brand/'+currentBrand.id+'/'+variant+'-'+Date.now()+'.'+ext,old=brandKitOf(currentBrand).logos[variant];var up=await db.storage.from(BUCKET).upload(path,file,{cacheControl:'31536000',upsert:false,contentType:file.type});if(up.error)throw up.error;var pub=db.storage.from(BUCKET).getPublicUrl(path),url=pub&&pub.data&&pub.data.publicUrl;if(!url)throw new Error('Public logo URL could not be created');var kit=brandKitOf(currentBrand);kit.logos[variant]={url:url,path:path,mime:file.type,updated_at:nowIso()};currentBrand.profile=currentBrand.profile||{};currentBrand.profile.brand_kit=kit;fillBrandForm();dirty=true;var saved2=await saveBrand(true);if(!saved2)throw new Error('Logo uploaded but Brand Kit could not be updated');if(old&&old.path&&old.path!==path)await db.storage.from(BUCKET).remove([old.path]);note(variant.charAt(0).toUpperCase()+variant.slice(1)+' logo saved.');}catch(err){note(err.message||'Logo upload failed.',true);}finally{setBusy(false);}
}
async function removeLogo(variant){
  if(busy||!currentBrand)return;var kit=brandKitOf(currentBrand),old=kit.logos&&kit.logos[variant];if(!old)return;if(!window.confirm('Remove the '+variant+' logo from this Brand Kit?'))return;setBusy(true);
  try{if(old.path)await db.storage.from(BUCKET).remove([old.path]);kit.logos[variant]=null;currentBrand.profile=currentBrand.profile||{};currentBrand.profile.brand_kit=kit;fillBrandForm();dirty=true;await saveBrand(true);note('Logo removed.');}catch(err){note(err.message||'Logo could not be removed.',true);}finally{setBusy(false);}
}

function renderTemplates(){var root=$('nl-template-grid');if(!root)return;root.innerHTML=templates.map(templateCard).join('');root.querySelectorAll('[data-template-key]').forEach(function(card){card.addEventListener('click',function(){selectTemplate(card.getAttribute('data-template-key'));});});paintTemplateCards();}
function templateCard(t){var tier=t.content&&t.content.tier||'basic',badge=t.content&&t.content.badge||tier,summary=t.content&&t.content.summary||t.description||'';return '<button type="button" class="nl-template-card" data-template-key="'+attr(t.template_key)+'" data-tier="'+attr(tier)+'"><div class="nl-template-thumb '+attr(tier)+'"><div class="nl-mini-head"></div><div class="nl-mini-hero"></div><div class="nl-mini-lines"><i></i><i></i><i></i></div><div class="nl-mini-grid"><i></i><i></i></div></div><div class="nl-template-copy"><span>'+esc(badge)+'</span><b>'+esc(t.title.replace(/^.*?·\s*/,''))+'</b><small>'+esc(summary)+'</small></div><i class="fas fa-circle-check nl-template-check"></i></button>';}
function selectTemplate(key){if(!templates.some(function(t){return t.template_key===key;})&&!FALLBACK_TEMPLATES.some(function(t){return t.template_key===key;}))return;selectedTemplate=key;dirty=true;paintTemplateCards();var t=chosenTemplate(),n=$('nl-build-note');if(n)n.textContent=t.title+' selected. Build HTML when your content is ready.';}
function paintTemplateCards(){var kit=currentKitSafe();document.querySelectorAll('.nl-template-card').forEach(function(c){c.classList.toggle('selected',c.getAttribute('data-template-key')===selectedTemplate);var thumb=c.querySelector('.nl-template-thumb');if(thumb){thumb.style.setProperty('--brand-primary',kit.colors.primary);thumb.style.setProperty('--brand-secondary',kit.colors.secondary);thumb.style.setProperty('--brand-accent',kit.colors.accent);thumb.style.setProperty('--brand-bg',kit.colors.background);}});}
function currentKitSafe(){try{return readBrandForm();}catch{return brandKitOf(currentBrand);}}

function readContent(){
  var stories=[];for(var i=1;i<=4;i++){var title=clean($('nl-story-'+i+'-title').value,220),summary=clean($('nl-story-'+i+'-summary').value,1000),url=safeUrl($('nl-story-'+i+'-url').value),cta=i===1?clean($('nl-story-1-cta').value,80):'Read more';if(title||summary)stories.push({title:title,summary:summary,url:url,cta:cta||'Read more'});}
  return{kicker:clean($('nl-build-kicker').value,80),headline:clean($('nl-build-headline').value,180),intro:clean($('nl-build-intro').value,900),hero:safeUrl($('nl-build-hero').value),stories:stories,cta:{title:clean($('nl-build-cta-title').value,180),copy:clean($('nl-build-cta-copy').value,700),url:safeUrl($('nl-build-cta-url').value),button:clean($('nl-build-cta-button').value,80)||'Learn more'},footer:clean($('nl-build-footer').value,240)};
}
function radius(kit){return kit.style.corner_radius==='sharp'?'0':kit.style.corner_radius==='soft'?'10px':'18px';}
function buttonRadius(kit){return kit.style.button_style==='square'?'0':kit.style.button_style==='pill'?'999px':'10px';}
function emailWidth(kit){return kit.style.content_width==='compact'?600:kit.style.content_width==='wide'?720:640;}
function logoUrl(kit,mode){var l=kit.logos||{};if(mode==='dark')return safeUrl(l.light&&l.light.url)||safeUrl(l.primary&&l.primary.url)||safeUrl(l.mark&&l.mark.url);return safeUrl(l.dark&&l.dark.url)||safeUrl(l.primary&&l.primary.url)||safeUrl(l.mark&&l.mark.url);}
function brandName(){return clean($('nl-brand-name').value,120)||'Newsletter';}
function storyLink(s,label,colorHex){if(!s.url)return'';return '<a href="'+attr(s.url)+'" style="color:'+colorHex+';text-decoration:none;font-size:13px;font-weight:700;">'+esc(label||s.cta||'Read more')+' &nbsp;→</a>';}
function logoHtml(kit,mode,maxH){var url=logoUrl(kit,mode);if(!url)return '<div style="font-size:17px;font-weight:800;letter-spacing:-.3px;color:'+(mode==='dark'?'#FFFFFF':kit.colors.primary)+';">'+esc(brandName())+'</div>';return '<img src="'+attr(url)+'" alt="'+attr(brandName())+'" style="display:block;max-width:190px;max-height:'+(maxH||48)+'px;width:auto;height:auto;border:0;">';}
function wrapEmail(inner,kit,width){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>'+esc(clean($('nl-subject').value,180)||brandName())+'</title></head><body style="margin:0;padding:0;background:'+kit.colors.background+';font-family:'+kit.typography.body.fallback+';color:'+kit.colors.text+';"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:'+kit.colors.background+';"><tr><td align="center" style="padding:28px 12px 44px;"><table role="presentation" width="'+width+'" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:'+width+'px;background:'+kit.colors.surface+';border-radius:'+radius(kit)+';overflow:hidden;">'+inner+'</table></td></tr></table></body></html>';}

function renderBasic(content,kit){
  var c=kit.colors,w=emailWidth(kit),rows='';
  rows+='<tr><td style="padding:32px 38px 18px;">'+logoHtml(kit,'light',42)+'</td></tr>';
  rows+='<tr><td style="padding:10px 38px 24px;">'+(content.kicker?'<div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:'+c.secondary+';">'+esc(content.kicker)+'</div>':'')+'<h1 style="margin:9px 0 12px;font-family:'+kit.typography.heading.fallback+';font-size:32px;line-height:39px;color:'+c.primary+';">'+esc(content.headline||'Your newsletter')+'</h1>'+(content.intro?'<p style="margin:0;font-size:16px;line-height:26px;color:'+c.muted+';">'+esc(content.intro)+'</p>':'')+'</td></tr>';
  content.stories.forEach(function(s,i){rows+='<tr><td style="padding:24px 38px;border-top:1px solid #E8ECEF;">'+(i===0&&content.hero?'<img src="'+attr(content.hero)+'" alt="" style="display:block;width:100%;height:auto;border-radius:'+radius(kit)+';margin-bottom:20px;">':'')+'<h2 style="margin:0 0 9px;font-family:'+kit.typography.heading.fallback+';font-size:'+(i===0?'25':'21')+'px;line-height:'+(i===0?'31':'28')+'px;color:'+c.primary+';">'+esc(s.title)+'</h2>'+(s.summary?'<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:'+c.muted+';">'+esc(s.summary)+'</p>':'')+storyLink(s,s.cta,c.secondary)+'</td></tr>';});
  if(content.cta.title)rows+='<tr><td style="padding:28px 38px;"><div style="background:'+c.primary+';border-radius:'+radius(kit)+';padding:25px;text-align:center;"><div style="font-family:'+kit.typography.heading.fallback+';font-size:24px;line-height:30px;color:#fff;font-weight:700;">'+esc(content.cta.title)+'</div>'+(content.cta.copy?'<p style="margin:9px 0 17px;color:#DCE4EC;font-size:14px;line-height:22px;">'+esc(content.cta.copy)+'</p>':'')+(content.cta.url?'<a href="'+attr(content.cta.url)+'" style="display:inline-block;background:#fff;color:'+c.primary+';text-decoration:none;font-size:13px;font-weight:800;padding:12px 18px;border-radius:'+buttonRadius(kit)+';">'+esc(content.cta.button)+'</a>':'')+'</div></td></tr>';
  rows+='<tr><td style="padding:22px 38px;text-align:center;background:#F8FAFB;color:'+c.muted+';font-size:11px;line-height:18px;">'+esc(content.footer||('Updates from '+brandName()))+'</td></tr>';return wrapEmail(rows,kit,w);
}

function renderDeluxe(content,kit){
  var c=kit.colors,w=emailWidth(kit),rows='',feature=content.stories[0],rest=content.stories.slice(1);
  rows+='<tr><td style="background:'+c.primary+';padding:27px 34px;">'+logoHtml(kit,'dark',44)+'</td></tr>';
  rows+='<tr><td style="background:'+c.primary+';padding:12px 34px 38px;">'+(content.kicker?'<div style="font-size:10px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:'+c.accent+';">'+esc(content.kicker)+'</div>':'')+'<h1 style="margin:10px 0 12px;font-family:'+kit.typography.heading.fallback+';font-size:38px;line-height:44px;color:#fff;">'+esc(content.headline||'Your newsletter')+'</h1>'+(content.intro?'<p style="margin:0;color:#D6E1EA;font-size:15px;line-height:24px;">'+esc(content.intro)+'</p>':'')+'</td></tr>';
  if(feature)rows+='<tr><td style="padding:28px 34px;">'+(content.hero?'<img src="'+attr(content.hero)+'" alt="" style="display:block;width:100%;height:auto;border-radius:'+radius(kit)+';margin-bottom:21px;">':'')+'<div style="font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:'+c.secondary+';">Featured</div><h2 style="margin:8px 0 10px;font-family:'+kit.typography.heading.fallback+';font-size:28px;line-height:34px;color:'+c.primary+';">'+esc(feature.title)+'</h2>'+(feature.summary?'<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:'+c.muted+';">'+esc(feature.summary)+'</p>':'')+(feature.url?'<a href="'+attr(feature.url)+'" style="display:inline-block;background:'+c.primary+';color:#fff;text-decoration:none;font-size:13px;font-weight:800;padding:12px 18px;border-radius:'+buttonRadius(kit)+';">'+esc(feature.cta||'Read the story')+'</a>':'')+'</td></tr>';
  if(rest.length){rows+='<tr><td style="padding:4px 34px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">';rest.forEach(function(s,i){rows+='<tr><td style="padding:20px 0;'+(i?'border-top:1px solid #E7ECEF;':'')+'"><div style="font-size:10px;font-weight:800;color:'+c.secondary+';letter-spacing:1.2px;text-transform:uppercase;">Story '+(i+2)+'</div><h3 style="margin:7px 0 8px;font-family:'+kit.typography.heading.fallback+';font-size:22px;line-height:28px;color:'+c.primary+';">'+esc(s.title)+'</h3>'+(s.summary?'<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:'+c.muted+';">'+esc(s.summary)+'</p>':'')+storyLink(s,'Read more',c.secondary)+'</td></tr>';});rows+='</table></td></tr>';}
  if(content.cta.title)rows+='<tr><td style="padding:0 26px 30px;"><div style="background:'+c.secondary+';border-radius:'+radius(kit)+';padding:28px 26px;text-align:center;color:#fff;"><div style="font-family:'+kit.typography.heading.fallback+';font-size:26px;line-height:32px;font-weight:700;">'+esc(content.cta.title)+'</div>'+(content.cta.copy?'<p style="margin:9px auto 18px;max-width:470px;font-size:14px;line-height:22px;color:#E4F3F1;">'+esc(content.cta.copy)+'</p>':'')+(content.cta.url?'<a href="'+attr(content.cta.url)+'" style="display:inline-block;background:#fff;color:'+c.primary+';text-decoration:none;font-size:13px;font-weight:800;padding:12px 19px;border-radius:'+buttonRadius(kit)+';">'+esc(content.cta.button)+'</a>':'')+'</div></td></tr>';
  rows+='<tr><td style="background:#F7F9FA;padding:24px 32px;text-align:center;color:'+c.muted+';font-size:11px;line-height:18px;">'+esc(content.footer||('Updates from '+brandName()))+'</td></tr>';return wrapEmail(rows,kit,w);
}

function renderPremium(content,kit){
  var c=kit.colors,w=emailWidth(kit),rows='',feature=content.stories[0],rest=content.stories.slice(1);
  rows+='<tr><td style="background:'+c.primary+';padding:32px 40px 20px;"><table role="presentation" width="100%"><tr><td>'+logoHtml(kit,'dark',46)+'</td><td align="right"><span style="display:inline-block;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 10px;color:#DDE6ED;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">Newsletter</span></td></tr></table></td></tr>';
  rows+='<tr><td style="background:'+c.primary+';padding:19px 40px 45px;">'+(content.kicker?'<div style="font-size:10px;font-weight:800;color:'+c.accent+';letter-spacing:1.8px;text-transform:uppercase;">'+esc(content.kicker)+'</div>':'')+'<h1 style="margin:13px 0 14px;font-family:'+kit.typography.heading.fallback+';font-size:46px;line-height:50px;font-weight:500;letter-spacing:-1px;color:#fff;">'+esc(content.headline||'The Brief')+'</h1>'+(content.intro?'<p style="margin:0;max-width:540px;font-size:15px;line-height:25px;color:#C9D5DF;">'+esc(content.intro)+'</p>':'')+'</td></tr>';
  if(feature)rows+='<tr><td style="padding:31px 40px 34px;">'+(content.hero?'<img src="'+attr(content.hero)+'" alt="" style="display:block;width:100%;height:auto;border-radius:'+radius(kit)+';margin-bottom:23px;">':'')+'<div style="font-size:10px;font-weight:800;color:'+c.secondary+';letter-spacing:1.6px;text-transform:uppercase;">Featured intelligence</div><h2 style="margin:9px 0 12px;font-family:'+kit.typography.heading.fallback+';font-size:31px;line-height:37px;font-weight:500;letter-spacing:-.4px;color:'+c.primary+';">'+esc(feature.title)+'</h2>'+(feature.summary?'<p style="margin:0 0 18px;font-size:15px;line-height:25px;color:'+c.muted+';">'+esc(feature.summary)+'</p>':'')+(feature.url?'<a href="'+attr(feature.url)+'" style="display:inline-block;background:'+c.primary+';color:#fff;text-decoration:none;font-size:13px;font-weight:800;padding:13px 19px;border-radius:'+buttonRadius(kit)+';">'+esc(feature.cta||'Explore the story')+'</a>':'')+'</td></tr>';
  rest.forEach(function(s,i){rows+='<tr><td style="padding:28px 40px;border-top:1px solid #E8ECEF;"><div style="font-size:10px;font-weight:800;color:#8793A0;letter-spacing:1.4px;text-transform:uppercase;">0'+(i+1)+' · Intelligence</div><h2 style="margin:9px 0 11px;font-family:'+kit.typography.heading.fallback+';font-size:27px;line-height:33px;font-weight:500;letter-spacing:-.35px;color:'+c.primary+';">'+esc(s.title)+'</h2>'+(s.summary?'<p style="margin:0 0 15px;font-size:15px;line-height:25px;color:'+c.muted+';">'+esc(s.summary)+'</p>':'')+storyLink(s,'Read the full insight',c.secondary)+'</td></tr>';});
  if(content.cta.title)rows+='<tr><td style="padding:8px 30px 32px;"><div style="background:'+c.primary+';border-radius:'+radius(kit)+';padding:34px 28px;text-align:center;"><div style="font-size:10px;font-weight:800;color:'+c.accent+';letter-spacing:1.6px;text-transform:uppercase;">'+esc(brandName())+'</div><div style="margin:11px auto 10px;max-width:500px;font-family:'+kit.typography.heading.fallback+';font-size:30px;line-height:36px;font-weight:500;color:#fff;">'+esc(content.cta.title)+'</div>'+(content.cta.copy?'<p style="margin:0 auto 21px;max-width:480px;font-size:14px;line-height:23px;color:#CBD7E0;">'+esc(content.cta.copy)+'</p>':'')+(content.cta.url?'<a href="'+attr(content.cta.url)+'" style="display:inline-block;background:#fff;color:'+c.primary+';text-decoration:none;font-size:13px;font-weight:800;padding:13px 21px;border-radius:'+buttonRadius(kit)+';">'+esc(content.cta.button)+'</a>':'')+'</div></td></tr>';
  rows+='<tr><td style="background:#F7F9FA;padding:27px 34px;text-align:center;">'+logoHtml(kit,'light',34)+'<div style="margin-top:11px;color:'+c.muted+';font-size:11px;line-height:18px;">'+esc(content.footer||('Updates from '+brandName()))+'</div></td></tr>';return wrapEmail(rows,kit,w);
}
function renderEmail(content,kit){var t=chosenTemplate(),tier=t.content&&t.content.tier||'premium';if(tier==='basic')return renderBasic(content,kit);if(tier==='deluxe')return renderDeluxe(content,kit);return renderPremium(content,kit);}

function buildHtml(){
  var content=readContent();if(!content.headline&&!content.stories.length){var n=$('nl-build-note');n.textContent='Add a headline or at least one story first.';n.classList.add('error');return;}
  var kit=currentKit(),html=renderEmail(content,kit),box=$('nl-content');box.value=html;box.dispatchEvent(new Event('input',{bubbles:true}));if(!$('nl-subject').value.trim()&&content.headline)$('nl-subject').value=content.headline;if(!$('nl-preview').value.trim()&&content.intro)$('nl-preview').value=content.intro.slice(0,240);$('nl-subject').dispatchEvent(new Event('input',{bubbles:true}));$('nl-preview').dispatchEvent(new Event('input',{bubbles:true}));var n=$('nl-build-note');n.classList.remove('error');n.textContent=chosenTemplate().title+' HTML built and placed in the email editor below.';document.getElementById('nl-compose-card').scrollIntoView({behavior:'smooth',block:'start'});
}
function loadSample(){
  $('nl-build-kicker').value='WEEKLY BRIEF';$('nl-build-headline').value='Four things worth knowing right now';$('nl-build-intro').value='A concise update with useful local information, fresh data and practical context.';
  $('nl-story-1-title').value='Your feature story goes here';$('nl-story-1-summary').value='Lead with the most important story in this edition. Keep the summary useful, clear and easy to scan.';$('nl-story-1-cta').value='Read the story';
  $('nl-story-2-title').value='A second useful update';$('nl-story-2-summary').value='Use supporting stories for shorter updates, market context or timely information.';
  $('nl-story-3-title').value='Another insight worth sharing';$('nl-story-3-summary').value='The template will automatically adjust when a story is left blank.';
  $('nl-build-cta-title').value='Ready to learn more?';$('nl-build-cta-copy').value='Use the closing call to action to send readers to your website, property search or another useful destination.';$('nl-build-cta-button').value='Explore more';$('nl-build-footer').value='Helpful updates from '+brandName()+'.';$('nl-build-note').textContent='Sample content loaded. Replace it with your own stories, then build the HTML.';
}

async function boot(){
  var attempts=0;while(attempts<50&&!inject()){attempts++;await new Promise(function(r){setTimeout(r,100);});}
  if(!$('nl-brand-studio'))return;
  try{await load();}catch(err){note(err.message||'Brand Kit could not load.',true);templates=FALLBACK_TEMPLATES;renderTemplates();newBrand();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

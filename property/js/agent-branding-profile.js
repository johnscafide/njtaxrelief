// content-architecture: dynamic — authenticated real-estate professional branding editor.
(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient(),user=null,row=null,saving=false,brandBusy=false,licenseBusy=false;
var PRESETS=[
 {name:'Opus Elite Real Estate',url:'https://opusagent.com/',primary:'#00778B',secondary:'#E35205',accent:'#222222',logo:'https://www.watchdogindex.com/property/assets/brokerages/opus-elite-logo.png'},
 {name:'Keller Williams',url:'https://kw.com/',primary:'#B40101',secondary:'#F4F4F4',accent:'#333333',logo:'https://www.google.com/s2/favicons?domain=kw.com&sz=256'},
 {name:'RE/MAX',url:'https://www.remax.com/usa/en',primary:'#003DA5',secondary:'#DC1C2E',accent:'#172B4D',logo:'https://www.google.com/s2/favicons?domain=remax.com&sz=256'},
 {name:'Coldwell Banker',url:'https://www.coldwellbanker.com/',primary:'#012169',secondary:'#FFFFFF',accent:'#0C2340',logo:'https://www.google.com/s2/favicons?domain=coldwellbanker.com&sz=256'},
 {name:'Compass',url:'https://www.compass.com/',primary:'#000000',secondary:'#FFFFFF',accent:'#545454',logo:'https://www.google.com/s2/favicons?domain=compass.com&sz=256'},
 {name:'eXp Realty',url:'https://www.exprealty.com/',primary:'#0A4B78',secondary:'#F58220',accent:'#183244',logo:'https://www.google.com/s2/favicons?domain=exprealty.com&sz=256'},
 {name:'Weichert',url:'https://www.weichert.com/',primary:'#FFCB05',secondary:'#000000',accent:'#58595B',logo:'https://www.google.com/s2/favicons?domain=weichert.com&sz=256'},
 {name:'Century 21',url:'https://www.century21.com/',primary:'#BEAF87',secondary:'#000000',accent:'#6B604F',logo:'https://www.google.com/s2/favicons?domain=century21.com&sz=256'},
 {name:'Berkshire Hathaway HomeServices',url:'https://www.bhhs.com/',primary:'#552448',secondary:'#E6E1DF',accent:'#222222',logo:'https://www.google.com/s2/favicons?domain=bhhs.com&sz=256'},
 {name:"Sotheby's International Realty",url:'https://www.sothebysrealty.com/',primary:'#002349',secondary:'#A7A9AC',accent:'#111111',logo:'https://www.google.com/s2/favicons?domain=sothebysrealty.com&sz=256'}
];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function val(id){var n=document.getElementById(id);return n?String(n.value||'').trim():''}
function validUrl(v){if(!v)return true;try{var u=new URL(v);return u.protocol==='https:'}catch(_){return false}}
function validEmail(v){return !v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function presetByName(name){var x=String(name||'').toLowerCase();return PRESETS.find(p=>x.includes(p.name.toLowerCase())||p.name.toLowerCase().includes(x))}
function lastName(value){var parts=String(value||'').trim().split(/\s+/).filter(Boolean);return parts.length?parts[parts.length-1]:''}
async function authHeaders(){var s=await db.auth.getSession(),t=s&&s.data&&s.data.session&&s.data.session.access_token;if(!t)throw new Error('Sign in again to continue.');return{Authorization:'Bearer '+t,Accept:'application/json'}}
function color(v,fallback){return /^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toUpperCase():fallback}
function applyBrandPreview(data){
 var p=color(data.primary_color||val('acb-primary'),'#10294B'),s=color(data.secondary_color||val('acb-secondary'),'#0B8B85'),a=color(data.accent_color||val('acb-accent'),'#1F2937');
 ['acb-primary','acb-secondary','acb-accent'].forEach((id,i)=>{var n=document.getElementById(id);if(n)n.value=[p,s,a][i]});
 var panel=document.getElementById('acb-brand-preview');if(panel){panel.style.setProperty('--broker-primary',p);panel.style.setProperty('--broker-secondary',s);panel.style.setProperty('--broker-accent',a)}
 var name=document.getElementById('acb-preview-name');if(name)name.textContent=data.brokerage_name||val('acb-brokerage')||'Your brokerage';
 var site=document.getElementById('acb-preview-site');if(site){try{site.textContent=new URL(data.website||val('acb-website')).hostname.replace(/^www\./,'')}catch(_){site.textContent='Professional brand'}}
 var logo=document.getElementById('acb-preview-logo'),fallback=document.getElementById('acb-preview-fallback'),src=data.logo_url||val('acb-logo');
 if(logo&&src){logo.src=src;logo.hidden=false;if(fallback)fallback.hidden=true}
 else if(logo){logo.hidden=true;if(fallback){fallback.hidden=false;fallback.textContent=(data.brokerage_name||val('acb-brokerage')||'B').charAt(0).toUpperCase()}}
 ['acb-brand-swatch-1','acb-brand-swatch-2','acb-brand-swatch-3'].forEach((id,i)=>{var n=document.getElementById(id);if(n)n.style.background=[p,s,a][i]});
}
function presetOptions(){return '<option value="">Choose brokerage…</option>'+PRESETS.map(p=>'<option value="'+esc(p.url)+'">'+esc(p.name)+'</option>').join('')+'<option value="other">Other / paste website</option>'}
function mount(){
 if(document.getElementById('ac-agent-branding'))return;
 var app=document.getElementById('ac-app');if(!app||app.hidden||!row)return;
 var after=document.getElementById('ac-profile-editor')||app.lastElementChild,b=row.pro_agent&&typeof row.pro_agent==='object'?row.pro_agent:{},preset=presetByName(b.brokerage_name);
 var primary=color(b.brokerage_primary_color,preset&&preset.primary||'#10294B'),secondary=color(b.brokerage_secondary_color,preset&&preset.secondary||'#0B8B85'),accent=color(b.brokerage_accent_color,preset&&preset.accent||'#1F2937'),website=b.brokerage_website||preset&&preset.url||'',defaultLicenseSearch=lastName(row.display_name||row.full_name||''),savedLogo=b.brokerage_logo_url||'';
 if(preset&&preset.name==='Opus Elite Real Estate'&&/opuselite(?:re|nj|realestate)\.com/i.test(website))website=preset.url;
 if(preset&&preset.name==='Opus Elite Real Estate'&&(!savedLogo||/google\.com\/s2\/favicons/i.test(savedLogo)))savedLogo=preset.logo;
 var section=document.createElement('section');section.id='ac-agent-branding';section.className='ac-section acp-editor acb-editor';
 section.innerHTML=
 '<header class="acp-header acb-header"><div><h2>Agent branding</h2><p>Set the brokerage identity Watchdog uses on reports and agent-facing experiences.</p></div><div class="acp-source"><i class="fa-regular fa-circle-check"></i><span>User-confirmed</span></div></header>'+
 '<div class="acb-grid">'+
  '<section class="acb-panel acb-business">'+
   '<div class="acb-brand-preview" id="acb-brand-preview" style="--broker-primary:'+primary+';--broker-secondary:'+secondary+';--broker-accent:'+accent+'">'+
    '<div class="acb-brand-mark"><img id="acb-preview-logo" '+(savedLogo?'src="'+esc(savedLogo)+'"':'')+' alt="" '+(savedLogo?'':'hidden')+'><span id="acb-preview-fallback" '+(savedLogo?'hidden':'')+'>'+esc((b.brokerage_name||'B').charAt(0).toUpperCase())+'</span></div>'+
    '<div><small>BROKERAGE</small><h3 id="acb-preview-name">'+esc(b.brokerage_name||'Your brokerage')+'</h3><p id="acb-preview-site">'+esc(website?new URL(website).hostname.replace(/^www\./,''):'Professional brand')+'</p></div>'+
    '<div class="acb-swatches"><i id="acb-brand-swatch-1" style="background:'+primary+'"></i><i id="acb-brand-swatch-2" style="background:'+secondary+'"></i><i id="acb-brand-swatch-3" style="background:'+accent+'"></i></div>'+
   '</div>'+
   '<div class="acb-discovery"><label><span>Choose brokerage</span><select id="acb-broker-preset">'+presetOptions()+'</select></label><label class="acb-website"><span>Brokerage website</span><div><input id="acb-website" type="url" value="'+esc(website)+'" placeholder="https://brokerage.com"><button type="button" id="acb-analyze"><i class="fa-solid fa-wand-magic-sparkles"></i> Find branding</button></div></label><small id="acb-brand-note" aria-live="polite">Watchdog can inspect the public website for a likely logo and brand colors. You confirm everything before saving.</small></div>'+
   '<div class="acb-fields"><label><span>Brokerage name</span><input id="acb-brokerage" maxlength="140" value="'+esc(b.brokerage_name||'')+'" placeholder="Brokerage name"></label>'+
    '<label><span>NJ license number</span><div class="acb-inline"><input id="acb-license" maxlength="60" value="'+esc(b.license_number||'')+'" placeholder="License number"><button type="button" id="acb-find-license">Find</button></div></label>'+
    '<label><span>Business phone</span><input id="acb-phone" maxlength="40" value="'+esc(b.business_phone||row.phone||'')+'" placeholder="(555) 555-5555"></label>'+
    '<label><span>Business email</span><input id="acb-email" type="email" maxlength="254" value="'+esc(b.business_email||row.email||'')+'" placeholder="agent@example.com"></label>'+
   '</div>'+
   '<div class="acb-license-search" id="acb-license-search" hidden><div><input id="acb-license-query" value="'+esc(defaultLicenseSearch)+'" placeholder="Last name (recommended) or NJ license #"><button type="button" id="acb-license-go">Search NJREC</button></div><div id="acb-license-results"></div><small>Search by last name for the most reliable match. This uses the official NJDOBI Real Estate Commission public license search. Select the correct result to fill your license number.</small></div>'+
  '</section>'+
  '<section class="acb-panel acb-imagery">'+
   '<div class="acb-panel-title"><div><i class="fa-regular fa-images"></i><span><b>Report imagery</b><small>Preview and override the imagery used on professional reports.</small></span></div></div>'+
   '<div class="acb-media-preview"><div><span>HEADSHOT</span><figure id="acb-headshot-preview">'+(b.headshot_url||row.photo_url||row.avatar_url?'<img src="'+esc(b.headshot_url||row.photo_url||row.avatar_url)+'" alt="">':'<i class="fa-regular fa-user"></i>')+'</figure></div><div><span>BROKERAGE LOGO</span><figure id="acb-logo-preview">'+(savedLogo?'<img src="'+esc(savedLogo)+'" alt="">':'<i class="fa-regular fa-image"></i>')+'</figure></div></div>'+
   '<div class="acb-fields"><label><span>Headshot URL</span><input id="acb-headshot" maxlength="600" value="'+esc(b.headshot_url||row.photo_url||row.avatar_url||'')+'" placeholder="https://…"></label><label><span>Brokerage logo URL</span><input id="acb-logo" maxlength="600" value="'+esc(savedLogo)+'" placeholder="Detected automatically or paste URL"></label>'+
    '<div class="acb-colors"><label><span>Primary</span><input id="acb-primary" type="color" value="'+primary+'"></label><label><span>Secondary</span><input id="acb-secondary" type="color" value="'+secondary+'"></label><label><span>Accent</span><input id="acb-accent" type="color" value="'+accent+'"></label></div>'+
    '<label class="acb-wide"><span>Brokerage-required disclosure</span><textarea id="acb-disclosure" maxlength="1000" rows="4" placeholder="Optional disclosure text required by your brokerage">'+esc(b.brokerage_disclosure||b.disclosure||'')+'</textarea><small>Only add language your brokerage actually requires. Watchdog does not invent disclosure text.</small></label></div>'+
  '</section>'+
 '</div>'+
 '<div class="ac-save-row acp-save acb-save"><button id="acb-save" type="button"><i class="fas fa-check"></i> Save agent branding</button><span id="acb-note" aria-live="polite"></span></div>';
 if(after&&after.parentNode)after.parentNode.insertBefore(section,after.nextSibling);else app.appendChild(section);
 bind();applyBrandPreview({brokerage_name:b.brokerage_name,website,logo_url:savedLogo,primary_color:primary,secondary_color:secondary,accent_color:accent});
}
function refreshMedia(){
 var h=val('acb-headshot'),l=val('acb-logo');
 for(const [id,url,icon] of [['acb-headshot-preview',h,'fa-user'],['acb-logo-preview',l,'fa-image']]){var f=document.getElementById(id);if(!f)continue;f.innerHTML=url?'<img src="'+esc(url)+'" alt="">':'<i class="fa-regular '+icon+'"></i>'}
 applyBrandPreview({brokerage_name:val('acb-brokerage'),website:val('acb-website'),logo_url:l,primary_color:val('acb-primary'),secondary_color:val('acb-secondary'),accent_color:val('acb-accent')});
}
function bind(){
 document.getElementById('acb-save').addEventListener('click',save);
 document.getElementById('acb-analyze').addEventListener('click',discoverBrand);
 document.getElementById('acb-find-license').addEventListener('click',()=>{var x=document.getElementById('acb-license-search');x.hidden=!x.hidden;if(!x.hidden)document.getElementById('acb-license-query').focus()});
 document.getElementById('acb-license-go').addEventListener('click',lookupLicense);
 document.getElementById('acb-broker-preset').addEventListener('change',function(){if(this.value==='other'){document.getElementById('acb-website').focus();return}if(this.value){document.getElementById('acb-website').value=this.value;var p=PRESETS.find(x=>x.url===this.value);if(p){document.getElementById('acb-brokerage').value=p.name;if(p.logo)document.getElementById('acb-logo').value=p.logo;if(p.primary)applyBrandPreview({brokerage_name:p.name,website:p.url,logo_url:p.logo,primary_color:p.primary,secondary_color:p.secondary,accent_color:p.accent})}discoverBrand()}});
 ['acb-brokerage','acb-website','acb-logo','acb-headshot','acb-primary','acb-secondary','acb-accent'].forEach(id=>document.getElementById(id).addEventListener('input',refreshMedia));
}
async function discoverBrand(){
 if(brandBusy)return;var website=val('acb-website'),note=document.getElementById('acb-brand-note');if(!validUrl(website)){note.textContent='Enter an HTTPS brokerage website first.';return}
 brandBusy=true;document.getElementById('acb-analyze').disabled=true;note.textContent='Finding public brand details…';
 try{var headers=await authHeaders(),r=await fetch('/api/brokerage-brand-discovery?url='+encodeURIComponent(website),{headers}),data=await r.json();if(!r.ok)throw new Error(data.error||'Could not analyze website.');
  document.getElementById('acb-website').value=data.website||website;document.getElementById('acb-brokerage').value=data.brokerage_name||val('acb-brokerage');
  if(data.logo_url)document.getElementById('acb-logo').value=data.logo_url;
  applyBrandPreview(data);refreshMedia();note.textContent=data.warning||'Brand found. Review the logo and colors, then save when they look right.';
 }catch(e){note.textContent=e.message||'Could not analyze that brokerage website.'}finally{brandBusy=false;document.getElementById('acb-analyze').disabled=false}
}
async function lookupLicense(){
 if(licenseBusy)return;var q=val('acb-license-query'),host=document.getElementById('acb-license-results');if(!q){host.innerHTML='<p>Enter a name or license number.</p>';return}
 licenseBusy=true;host.innerHTML='<p>Searching NJ Real Estate Commission…</p>';
 try{var headers=await authHeaders(),isNum=/^\d{5,}$/.test(q.replace(/\D/g,'')),url='/api/njrec-license-search?'+(isNum?'license='+encodeURIComponent(q.replace(/\D/g,'')):'name='+encodeURIComponent(q)),r=await fetch(url,{headers}),data=await r.json();if(!r.ok)throw new Error(data.error||'License search failed.');
  if(!data.results||!data.results.length){host.innerHTML='<p>No matching NJREC licensees found.</p>';return}
  host.innerHTML=data.results.map((x,i)=>'<button type="button" data-license-index="'+i+'"><b>'+esc(x.name)+'</b><span>NJ #'+esc(x.license_number)+' · '+esc(x.license_type)+' · '+esc(x.status)+'</span><small>'+esc(x.business||'')+'</small></button>').join('');
  host.querySelectorAll('[data-license-index]').forEach(btn=>btn.addEventListener('click',function(){var x=data.results[Number(this.dataset.licenseIndex)];document.getElementById('acb-license').value=x.license_number||'';var verifyInput=document.getElementById('ac-license-number');if(verifyInput)verifyInput.value=x.license_number||'';if(!val('acb-brokerage')&&x.business)document.getElementById('acb-brokerage').value=x.business.split(/\d/)[0].trim();host.innerHTML='<p class="success">Selected '+esc(x.name)+' · NJ #'+esc(x.license_number)+'</p>';document.dispatchEvent(new CustomEvent('watchdog:njrec-license-selected',{detail:{license_number:x.license_number||'',licensee_name:x.name||'',status:x.status||''}}));refreshMedia()}));
 }catch(e){host.innerHTML='<p>'+esc(e.message||'NJREC lookup is unavailable right now.')+'</p>'}finally{licenseBusy=false}
}
async function save(){
 if(saving||!user||!row)return;var note=document.getElementById('acb-note'),email=val('acb-email'),head=val('acb-headshot'),logo=val('acb-logo'),website=val('acb-website');
 if(!validEmail(email)){note.textContent='Enter a valid business email.';return}
 if(!validUrl(head)||!validUrl(logo)||!validUrl(website)){note.textContent='Website and image URLs must use HTTPS.';return}
 saving=true;document.getElementById('acb-save').disabled=true;note.textContent='Saving…';
 var current=row.pro_agent&&typeof row.pro_agent==='object'?row.pro_agent:{};
 var disclosure=val('acb-disclosure');
 var pro=Object.assign({},current,{brokerage_name:val('acb-brokerage')||null,brokerage_website:website||null,license_number:val('acb-license')||null,business_phone:val('acb-phone')||null,business_email:email||null,headshot_url:head||null,brokerage_logo_url:logo||null,brokerage_primary_color:val('acb-primary')||null,brokerage_secondary_color:val('acb-secondary')||null,brokerage_accent_color:val('acb-accent')||null,brokerage_disclosure:disclosure||null,disclosure:disclosure||null,report_branding_updated_at:new Date().toISOString()});
 try{var r=await db.from('profiles').update({pro_agent:pro}).eq('id',user.id).select('id,pro_agent').single();if(r.error)throw r.error;row.pro_agent=r.data.pro_agent;note.textContent='Saved. New reports and agent surfaces will use this confirmed branding.'}catch(e){note.textContent=e.message||'Could not save branding.'}finally{saving=false;document.getElementById('acb-save').disabled=false}
}
async function init(){
 try{
  if(String(document.body&&document.body.getAttribute('data-account-profile-mode')||'')!=='professional')return;
  var u=await db.auth.getUser();user=u.data&&u.data.user;if(!user)return;
  var results=await Promise.all([db.from('profiles').select('id,email,phone,avatar_url,photo_url,display_name,full_name,pro_agent').eq('id',user.id).maybeSingle(),db.from('watchdog_onboarding_profiles').select('persona,primary_profession').eq('user_id',user.id).maybeSingle()]);
  var r=results[0],onboarding=results[1];if(r.error)throw r.error;if(onboarding.error)throw onboarding.error;
  var declared=onboarding.data||{};if(declared.primary_profession!=='real_estate'||(declared.persona!=='professional'&&declared.persona!=='both')){var existing=document.getElementById('ac-agent-branding');if(existing)existing.remove();return}
  row=r.data||{id:user.id,email:user.email,pro_agent:{}};mount();var obs=new MutationObserver(mount);obs.observe(document.body,{childList:true,subtree:true});setTimeout(()=>obs.disconnect(),15000);
 }catch(e){console.warn('agent branding profile',e)}
}
document.addEventListener('watchdog:profile-updated',init);init();
})();
(function(){
  'use strict';

  var SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var BUCKET='agent-contact-files';
  var MAX_BYTES=25*1024*1024;
  var MAX_ROWS=50000;
  var PAGE_SIZE=50;
  var db=null,user=null,profile={},history=[],historyFilter='all';
  var current={meta:null,rawHeaders:[],rawRows:[],mapping:{},contacts:[],selected:new Set(),page:1,search:'',quality:'all',persisted:false,dirty:false,nameMode:'split',namePrompted:false};
  var toastTimer=null;

  var fields=[
    {key:'first_name',label:'First name',icon:'fa-user',core:true},
    {key:'last_name',label:'Last name',icon:'fa-user',core:true},
    {key:'email',label:'Email',icon:'fa-at',core:true},
    {key:'phone',label:'Phone / mobile',icon:'fa-phone',core:true},
    {key:'company',label:'Company',icon:'fa-building'},
    {key:'address',label:'Street address',icon:'fa-house'},
    {key:'city',label:'City',icon:'fa-city'},
    {key:'state',label:'State',icon:'fa-map'},
    {key:'zip',label:'ZIP / postal',icon:'fa-location-dot'},
    {key:'source',label:'Lead source',icon:'fa-arrow-turn-down'},
    {key:'status',label:'Lead status',icon:'fa-bars-progress'},
    {key:'tags',label:'Tags / groups',icon:'fa-tags'},
    {key:'notes',label:'Notes',icon:'fa-note-sticky'}
  ];
  var synonyms={
    first_name:['first name','firstname','first','given name','givenname','contact first name'],
    last_name:['last name','lastname','last','surname','family name','familyname','contact last name'],
    email:['email','email address','e-mail','e-mail address','primary email','email 1'],
    phone:['phone','phone number','mobile','mobile phone','cell','cell phone','cellphone','cell phone 1','phone 1','primary phone'],
    company:['company','company name','organization','organisation','business','brokerage'],
    address:['address','street','street address','address 1','address line 1','primary address street','primary address - street'],
    city:['city','town','locality','primary address city','primary address - city'],
    state:['state','province','state/province','region','primary address state','primary address - state/province'],
    zip:['zip','zipcode','zip code','postal','postal code','zip/postal','primary address zip','primary address - zip/postal'],
    source:['source','lead source','contact source','form or capture method','capture method','origin'],
    status:['status','lead status','contact status','stage','lead stage'],
    tags:['tags','tag','groups','group','labels','label'],
    notes:['notes','note','comments','comment','remarks','description']
  };
  var fullNameSynonyms=['name','full name','fullname','contact name','display name','customer name','lead name'];

  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function attr(v){return esc(v).replace(/`/g,'&#96;');}
  function uid(){if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);});}
  function safeName(name){return String(name||'contacts.csv').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,160)||'contacts.csv';}
  function sizeLabel(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(n<10240?1:0)+' KB';return (n/1048576).toFixed(1)+' MB';}
  function dateLabel(v){var d=new Date(v);if(!isFinite(d.getTime()))return'';return d.toLocaleString('en-US',{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined,hour:'numeric',minute:'2-digit'});}
  function showBusy(title,note){var el=q('#acx-busy');if(!el)return;q('#acx-busy-title').textContent=title||'Working on your file…';q('#acx-busy-note').textContent=note||'Keeping the original safe.';el.hidden=false;}
  function hideBusy(){var el=q('#acx-busy');if(el)el.hidden=true;}
  function toast(message,type){var el=q('#acx-toast');if(!el)return;clearTimeout(toastTimer);el.className='acx-toast show '+(type||'');el.textContent=message;toastTimer=setTimeout(function(){el.className='acx-toast';},4200);}
  function firstName(){var meta=user&&user.user_metadata||{};var name=profile.display_name||profile.full_name||meta.full_name||meta.name||'';return String(name).trim().split(/\s+/)[0]||'there';}
  function personalize(){var h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';var el=q('#acx-greeting');if(el)el.textContent=g+', '+firstName()+'. Upload a contact file, clean the messy parts, and move a dependable database wherever you work next.';}
  function createDb(){if(db)return db;if(window.NJPTRSupabaseRuntime){db=window.NJPTRSupabaseRuntime.createClient();return db;}if(!window.supabase||typeof window.supabase.createClient!=='function')throw new Error('Watchdog account services are unavailable.');db=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});return db;}
  function ensurePolishCss(){if(document.querySelector('link[data-agent-contacts-polish]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href='/agent/contacts/contacts-polish.css';l.setAttribute('data-agent-contacts-polish','1');document.head.appendChild(l);}
  ensurePolishCss();

  function normalizeHeader(v){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}
  function uniqueHeaders(headers){var seen={};return headers.map(function(h,i){var base=String(h||'').trim()||('Column '+(i+1)),n=(seen[base]||0)+1;seen[base]=n;return n===1?base:base+' ('+n+')';});}
  function isFullNameHeader(h){return fullNameSynonyms.indexOf(normalizeHeader(h))!==-1;}
  function findFullNameHeader(headers){return (headers||[]).find(isFullNameHeader)||'';}
  function splitNameText(full){var parts=String(full||'').trim().split(/\s+/).filter(Boolean);return parts.length?[parts.shift(),parts.join(' ')]:['',''];}
  function parseCsv(text){
    text=String(text||'').replace(/^\uFEFF/,'');
    var rows=[],row=[],field='',quoted=false,i=0;
    while(i<text.length){var c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}quoted=false;i++;continue;}field+=c;i++;continue;}if(c==='"'){quoted=true;i++;continue;}if(c===','){row.push(field);field='';i++;continue;}if(c==='\r'||c==='\n'){row.push(field);field='';if(row.some(function(v){return String(v).trim()!=='';}))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i+=2;else i++;continue;}field+=c;i++;}
    if(quoted)throw new Error('This CSV has an unclosed quoted field.');
    row.push(field);if(row.some(function(v){return String(v).trim()!=='';}))rows.push(row);
    if(!rows.length)throw new Error('This CSV is empty.');
    var headers=uniqueHeaders(rows.shift());
    if(!headers.length)throw new Error('No column headers were found.');
    if(rows.length>MAX_ROWS)throw new Error('This file has '+rows.length.toLocaleString()+' rows. The current limit is '+MAX_ROWS.toLocaleString()+'.');
    var out=rows.map(function(values){var obj={};headers.forEach(function(h,idx){obj[h]=values[idx]==null?'':String(values[idx]);});return obj;});
    return {headers:headers,rows:out};
  }
  function autoMap(headers){
    var used=new Set(),map={},full=findFullNameHeader(headers);
    fields.forEach(function(f){
      var candidates=synonyms[f.key]||[];
      var idx=headers.findIndex(function(h){if(used.has(h))return false;return candidates.indexOf(normalizeHeader(h))!==-1;});
      if(idx<0){idx=headers.findIndex(function(h){if(used.has(h))return false;if((f.key==='first_name'||f.key==='last_name')&&isFullNameHeader(h))return false;var n=normalizeHeader(h);if(n.length<3)return false;return candidates.some(function(c){return c.length>=3&&(n.indexOf(c)!==-1||c.indexOf(n)!==-1);});});}
      if(idx>=0){map[f.key]=headers[idx];used.add(headers[idx]);}else map[f.key]='';
    });
    map._name_first_source=map.first_name||'';
    map._name_last_source=map.last_name||'';
    map._full_name=full||'';
    map._name_mode='split';
    if(full&&!map.first_name&&!map.last_name){map.first_name='@full:'+full;map.last_name='@full:'+full;}
    return map;
  }
  function sourceNameForRow(row){
    var full=current.mapping._full_name||findFullNameHeader(current.rawHeaders);
    if(full&&row&&row[full]!=null&&String(row[full]).trim())return String(row[full]).trim();
    var f=current.mapping._name_first_source||'',l=current.mapping._name_last_source||'';
    return [f&&row&&row[f]!=null?String(row[f]).trim():'',l&&row&&row[l]!=null?String(row[l]).trim():''].filter(Boolean).join(' ').trim();
  }
  function hasNameSource(){return !!(current.mapping._full_name||current.mapping._name_first_source||current.mapping._name_last_source);}
  function applyNameMode(mode,opts){
    if(current.dirty&&!confirmReplacement())return;
    current.dirty=false;mode=mode==='together'?'together':'split';current.nameMode=mode;current.mapping._name_mode=mode;
    var full=current.mapping._full_name||'',first=current.mapping._name_first_source||'',last=current.mapping._name_last_source||'';
    if(mode==='split'){
      if(full&&!first&&!last){current.mapping.first_name='@full:'+full;current.mapping.last_name='@full:'+full;}
      else{current.mapping.first_name=first;current.mapping.last_name=last;}
    }else{
      if(full)current.mapping.first_name='@together:'+full;
      else if(first||last)current.mapping.first_name='@combine';
      else current.mapping.first_name='';
      current.mapping.last_name='';
    }
    renderNameMode();renderMap();rebuildContacts();saveMappingSoon();
    if(!(opts&&opts.silent))toast(mode==='split'?'Names will be split into First + Last.':'Names will stay together in the First Name field.','success');
  }
  function mappedValue(row,key){
    var h=current.mapping[key]||'';
    if(h.indexOf('@full:')===0){var source=h.slice(6),parts=splitNameText(row&&row[source]);return key==='first_name'?parts[0]:parts[1];}
    if(h.indexOf('@together:')===0){var together=h.slice(10);return key==='first_name'&&row&&row[together]!=null?String(row[together]).trim():'';}
    if(h==='@combine'){return key==='first_name'?sourceNameForRow(row):'';}
    return h&&row&&row[h]!=null?String(row[h]).trim():'';
  }
  function contactFromRow(row,index){var c={_id:'r'+index+'-'+uid().slice(0,8)};fields.forEach(function(f){c[f.key]=mappedValue(row,f.key);});return c;}
  function markDirty(){current.dirty=true;var label=q('#acx-current-saved');if(label){label.classList.add('warning');label.textContent='Edits not archived — export to save';}}
  function confirmReplacement(){return !current.dirty||window.confirm('Your cleaned edits have not been exported. Continue and discard those edits?');}
  window.addEventListener('beforeunload',function(e){if(!current.dirty)return;e.preventDefault();e.returnValue='';});
  function rebuildContacts(){current.contacts=current.rawRows.map(contactFromRow);current.selected.clear();current.page=1;recomputeQuality();renderReview();updateMapScore();}
  function emailValid(v){v=String(v||'').trim();return !v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
  function phoneKey(v){var d=String(v||'').replace(/\D/g,'');if(d.length>10)d=d.slice(-10);return d.length>=7?d:'';}
  function recomputeQuality(){
    var emails={},phones={};
    current.contacts.forEach(function(c){var e=String(c.email||'').trim().toLowerCase(),p=phoneKey(c.phone);if(e)emails[e]=(emails[e]||0)+1;if(p)phones[p]=(phones[p]||0)+1;});
    current.contacts.forEach(function(c){var e=String(c.email||'').trim().toLowerCase(),p=phoneKey(c.phone),badEmail=!!c.email&&!emailValid(c.email),dup=(e&&emails[e]>1)||(p&&phones[p]>1),unreachable=!String(c.email||'').trim()&&!String(c.phone||'').trim();c._flags={email:badEmail,duplicate:!!dup,unreachable:unreachable,ready:!badEmail&&!dup&&!unreachable};});
    var counts={ready:0,duplicate:0,email:0,unreachable:0};current.contacts.forEach(function(c){if(c._flags.ready)counts.ready++;if(c._flags.duplicate)counts.duplicate++;if(c._flags.email)counts.email++;if(c._flags.unreachable)counts.unreachable++;});
    [['#acx-q-ready','ready'],['#acx-q-dupes','duplicate'],['#acx-q-email','email'],['#acx-q-unreachable','unreachable']].forEach(function(x){var el=q(x[0]);if(el)el.textContent=counts[x[1]].toLocaleString();});
    if(current.meta){current.meta.stats=Object.assign({},current.meta.stats||{},counts,{working_rows:current.contacts.length,name_mode:current.nameMode});}
  }

  function mapScore(){var core=['first_name','last_name','email','phone'];var points=0;core.forEach(function(k){if(current.mapping[k]||(k==='last_name'&&current.nameMode==='together'&&current.mapping.first_name))points++;});return Math.round(points/core.length*100);}
  function updateMapScore(){var el=q('#acx-map-score');if(el)el.textContent=mapScore()+'%';}
  function specialNameOption(f){
    var value=current.mapping[f.key]||'';
    if(value.indexOf('@full:')===0){var source=value.slice(6);return '<option value="'+attr(value)+'" selected>Auto-split from '+esc(source)+'</option>';}
    if(value.indexOf('@together:')===0){var together=value.slice(10);return '<option value="'+attr(value)+'" selected>Keep together from '+esc(together)+'</option>';}
    if(value==='@combine')return '<option value="@combine" selected>Combine first + last</option>';
    return '';
  }
  function renderMap(){
    var grid=q('#acx-map-grid');if(!grid)return;
    grid.innerHTML=fields.map(function(f){var special=specialNameOption(f);var options='<option value="">Not mapped</option>'+special+current.rawHeaders.map(function(h){return '<option value="'+attr(h)+'"'+(current.mapping[f.key]===h?' selected':'')+'>'+esc(h)+'</option>';}).join('');var label=current.mapping[f.key]?(String(current.mapping[f.key]).indexOf('@')===0?(f.key==='last_name'&&current.nameMode==='split'?'Auto-split from '+esc(current.mapping._full_name||'full name'):'Name handling: '+esc(current.nameMode==='split'?'Split':'Together')):'Source: '+esc(current.mapping[f.key])):'Not included in the working file';return '<label class="acx-map-item"><span><i class="fa-solid '+f.icon+'" aria-hidden="true"></i><b>'+esc(f.label)+'</b>'+(f.core?'<em>CORE</em>':'')+'</span><select data-map-field="'+f.key+'" aria-label="Map '+esc(f.label)+'">'+options+'</select><small>'+label+'</small></label>';}).join('');
    updateMapScore();renderNameMode();
  }
  function saveMappingSoon(){
    if(!current.persisted||!current.meta||!current.meta.id)return;
    clearTimeout(saveMappingSoon.t);
    var id=current.meta.id,patch={mapping:JSON.parse(JSON.stringify(current.mapping)),stats:JSON.parse(JSON.stringify(current.meta.stats||{})),updated_at:new Date().toISOString()};
    saveMappingSoon.t=setTimeout(function(){
      db.from('agent_contact_files').update(patch).eq('id',id).then(function(result){
        if(result.error){toast('Mapping could not be saved. Export your cleaned file before leaving.','warning');return;}
        var item=history.find(function(row){return row.id===id;});if(item)Object.assign(item,patch);
      });
    },500);
  }

  function sampleNameRows(){return current.rawRows.map(sourceNameForRow).filter(Boolean).slice(0,3);}
  function namePreviewMarkup(mode){var samples=sampleNameRows();if(!samples.length)samples=['Alex Morgan','Gildardo Rincon Barrera','Madonna'];return samples.map(function(name){var parts=splitNameText(name);if(mode==='together')return '<div class="acx-name-preview-row"><span class="raw">'+esc(name)+'</span><i class="fa-solid fa-arrow-right"></i><span class="result one"><b>Full name</b>'+esc(name)+'</span></div>';return '<div class="acx-name-preview-row"><span class="raw">'+esc(name)+'</span><i class="fa-solid fa-arrow-right"></i><span class="result"><b>First</b>'+esc(parts[0]||'—')+'</span><span class="result"><b>Last</b>'+esc(parts[1]||'—')+'</span></div>';}).join('');}
  function ensureNameUi(){
    if(!q('#acx-name-intelligence')){var head=q('#acx-section-map .acx-panel-head');if(head)head.insertAdjacentHTML('afterend','<section class="acx-name-intelligence" id="acx-name-intelligence" hidden><div class="acx-name-copy"><span>NAME CLEANUP</span><h4>Turn one name column into CRM-ready fields.</h4><p id="acx-name-summary">Split into First + Last is recommended for BoldTrail and most CRMs.</p><button type="button" class="acx-name-change" data-name-open><i class="fa-solid fa-sliders"></i> Change name handling</button></div><div class="acx-name-flow" aria-label="Name cleanup example"><div class="acx-name-node raw"><small>RAW CSV</small><b id="acx-name-raw">Gildardo Rincon Barrera</b></div><i class="fa-solid fa-arrow-right"></i><div class="acx-name-node clean"><small>WATCHDOG CLEAN</small><b id="acx-name-clean">Gildardo · Rincon Barrera</b></div><i class="fa-solid fa-arrow-right"></i><div class="acx-name-node crm"><small>CRM READY</small><b>Mapped + reviewed</b></div></div></section>');}
    if(!q('#acx-name-modal'))document.body.insertAdjacentHTML('beforeend','<div class="acx-name-modal" id="acx-name-modal" hidden><button class="acx-name-backdrop" type="button" data-name-close aria-label="Close name handling"></button><section role="dialog" aria-modal="true" aria-labelledby="acx-name-title"><button class="acx-name-x" type="button" data-name-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div class="acx-name-modal-icon"><i class="fa-solid fa-user-pen"></i></div><span>CONTACT NAME SETUP</span><h2 id="acx-name-title">How should Watchdog handle names?</h2><p>We found name information in this CSV. Choose how it should be prepared before you review or export contacts.</p><div class="acx-name-choices"><button class="acx-name-choice recommended" type="button" data-name-mode="split"><i class="fa-solid fa-user-group"></i><div><span>RECOMMENDED</span><b>Split into First + Last</b><small>Best for BoldTrail and most CRMs. First word becomes First Name; everything after it stays together as Last Name.</small></div><em><i class="fa-solid fa-check"></i></em></button><button class="acx-name-choice" type="button" data-name-mode="together"><i class="fa-solid fa-user"></i><div><span>OPTIONAL</span><b>Keep the full name together</b><small>The full name stays in the First Name field and Last Name is left blank.</small></div><em><i class="fa-solid fa-check"></i></em></button></div><div class="acx-name-preview"><header><b>Preview from your file</b><small id="acx-name-preview-mode">Split preview</small></header><div id="acx-name-preview-rows"></div></div><footer><button type="button" class="acx-btn acx-btn-primary" id="acx-name-confirm">Continue with split names <i class="fa-solid fa-arrow-right"></i></button></footer></section></div>');
  }
  function renderNameMode(){
    ensureNameUi();var strip=q('#acx-name-intelligence');if(strip)strip.hidden=!hasNameSource();var summary=q('#acx-name-summary');if(summary)summary.textContent=current.nameMode==='split'?'Split into First + Last is active and recommended for BoldTrail and most CRMs.':'Full names are being kept together in the First Name field.';var sample=sampleNameRows()[0]||'Gildardo Rincon Barrera',parts=splitNameText(sample),raw=q('#acx-name-raw'),clean=q('#acx-name-clean');if(raw)raw.textContent=sample;if(clean)clean.textContent=current.nameMode==='split'?(parts[0]+' · '+(parts[1]||'—')):sample;qa('[data-name-mode]').forEach(function(btn){btn.classList.toggle('selected',btn.getAttribute('data-name-mode')===current.nameMode);});var pm=q('#acx-name-preview-mode');if(pm)pm.textContent=current.nameMode==='split'?'Split preview':'Together preview';var pr=q('#acx-name-preview-rows');if(pr)pr.innerHTML=namePreviewMarkup(current.nameMode);var confirm=q('#acx-name-confirm');if(confirm)confirm.innerHTML=current.nameMode==='split'?'Continue with split names <i class="fa-solid fa-arrow-right"></i>':'Continue with names together <i class="fa-solid fa-arrow-right"></i>';
  }
  function openNamePrompt(force){if(!hasNameSource()&&!force)return;ensureNameUi();current.namePrompted=true;renderNameMode();var modal=q('#acx-name-modal');if(modal)modal.hidden=false;document.body.classList.add('acx-modal-open');setTimeout(function(){var selected=q('.acx-name-choice.selected',modal);if(selected)selected.focus();},0);}
  function closeNamePrompt(){var modal=q('#acx-name-modal');if(modal)modal.hidden=true;document.body.classList.remove('acx-modal-open');}

  function contactMatches(c){var s=current.search.toLowerCase().trim();if(s){var hay=[c.first_name,c.last_name,c.email,c.phone,c.company,c.address,c.city,c.state,c.zip,c.source,c.status,c.tags,c.notes].join(' ').toLowerCase();if(hay.indexOf(s)===-1)return false;}if(current.quality!=='all'&&!c._flags[current.quality])return false;return true;}
  function filteredContacts(){return current.contacts.filter(contactMatches);}
  function statusChip(c){if(c._flags.duplicate)return '<span class="acx-chip warning"><i class="fa-solid fa-clone"></i>Duplicate?</span>';if(c._flags.email)return '<span class="acx-chip danger"><i class="fa-solid fa-at"></i>Check email</span>';if(c._flags.unreachable)return '<span class="acx-chip muted"><i class="fa-solid fa-phone-slash"></i>No channel</span>';return '<span class="acx-chip good"><i class="fa-solid fa-check"></i>Ready</span>';}
  function editInput(c,key,value,cls){return '<input class="acx-cell-input '+(cls||'')+'" data-edit-id="'+attr(c._id)+'" data-edit-key="'+key+'" value="'+attr(value||'')+'" aria-label="'+esc(key.replace(/_/g,' '))+'">';}
  function renderReview(){
    var list=filteredContacts(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));if(current.page>pages)current.page=pages;var start=(current.page-1)*PAGE_SIZE,visible=list.slice(start,start+PAGE_SIZE);var body=q('#acx-table-body');
    if(body)body.innerHTML=visible.map(function(c){var checked=current.selected.has(c._id)?' checked':'';var name=editInput(c,'first_name',c.first_name,'short')+editInput(c,'last_name',c.last_name,'short');var loc=editInput(c,'city',c.city,'short')+editInput(c,'state',c.state,'state');return '<tr data-row-id="'+attr(c._id)+'"><td class="check"><input type="checkbox" data-select-id="'+attr(c._id)+'"'+checked+' aria-label="Select '+esc((c.first_name+' '+c.last_name).trim()||'contact')+'"></td><td><div class="acx-inline-two">'+name+'</div></td><td>'+editInput(c,'email',c.email)+'</td><td>'+editInput(c,'phone',c.phone)+'</td><td><div class="acx-inline-two location">'+loc+'</div></td><td>'+editInput(c,'tags',c.tags)+'</td><td>'+statusChip(c)+'</td></tr>';}).join('');
    var empty=q('#acx-table-empty');if(empty)empty.hidden=!!visible.length;var count=q('#acx-visible-count');if(count)count.textContent=list.length.toLocaleString()+' contact'+(list.length===1?'':'s');var page=q('#acx-page-label');if(page)page.textContent='Page '+current.page+' of '+pages;var prev=q('#acx-prev'),next=q('#acx-next');if(prev)prev.disabled=current.page<=1;if(next)next.disabled=current.page>=pages;var rm=q('#acx-remove-selected');if(rm)rm.disabled=current.selected.size===0;var all=q('#acx-select-page');if(all){all.checked=visible.length>0&&visible.every(function(c){return current.selected.has(c._id);});all.indeterminate=visible.some(function(c){return current.selected.has(c._id);})&&!all.checked;}
    recomputeQuality();
  }

  function showSection(name){['map','review','export'].forEach(function(n){var el=q('#acx-section-'+n);if(el)el.hidden=n!==name;});qa('.acx-steps button').forEach(function(btn,index){btn.classList.remove('active','done');if(index===0){btn.classList.add('done');return;}if((index===1&&name==='map')||(index===2&&name==='review')||(index===3&&name==='export'))btn.classList.add('active');if((name==='review'||name==='export')&&index===1)btn.classList.add('done');if(name==='export'&&index===2)btn.classList.add('done');});if(name==='review')renderReview();var target=q('#acx-section-'+name);if(target)target.scrollIntoView({behavior:'smooth',block:'start'});}
  function setCurrent(meta,headers,rows,mapping,persisted,promptName){
    current.dirty=false;current.meta=meta||{};current.rawHeaders=headers||[];current.rawRows=rows||[];current.mapping=mapping&&Object.keys(mapping).length?Object.assign({},mapping):autoMap(current.rawHeaders);current.persisted=!!persisted;current.search='';current.quality='all';current.page=1;current.namePrompted=false;
    var detectedFull=findFullNameHeader(current.rawHeaders),hasNameMeta=current.mapping._name_mode!=null||current.mapping._full_name!=null||current.mapping._name_first_source!=null||current.mapping._name_last_source!=null;
    if(!hasNameMeta&&detectedFull&&current.mapping.first_name===detectedFull&&!current.mapping.last_name){current.mapping._name_first_source='';current.mapping._name_last_source='';current.mapping._full_name=detectedFull;current.mapping._name_mode='split';}
    if(current.mapping._name_first_source==null)current.mapping._name_first_source=(current.mapping.first_name&&String(current.mapping.first_name).charAt(0)!=='@')?current.mapping.first_name:'';
    if(current.mapping._name_last_source==null)current.mapping._name_last_source=(current.mapping.last_name&&String(current.mapping.last_name).charAt(0)!=='@')?current.mapping.last_name:'';
    if(current.mapping._full_name==null)current.mapping._full_name=detectedFull;
    current.nameMode=current.mapping._name_mode==='together'?'together':'split';
    applyNameMode(current.nameMode,{silent:true});
    q('#acx-empty-state').hidden=true;q('#acx-current').hidden=false;q('#acx-current-name').textContent=(meta&&meta.original_name)||'contacts.csv';q('#acx-current-meta').textContent=(rows.length.toLocaleString()+' rows · '+headers.length+' columns');var saved=q('#acx-current-saved');if(saved){saved.classList.toggle('warning',!persisted);saved.innerHTML=persisted?'<i class="fa-solid fa-lock"></i> Saved privately':'<i class="fa-solid fa-triangle-exclamation"></i> Session only';}renderMap();rebuildContacts();showSection('map');if(promptName&&hasNameSource())setTimeout(function(){openNamePrompt();},140);
  }

  function csvCell(v){var s=String(v==null?'':v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function makeCsv(headers,rows){return '\uFEFF'+[headers].concat(rows).map(function(r){return r.map(csvCell).join(',');}).join('\r\n');}
  function splitNameFallback(c){if(c.first_name||c.last_name)return [c.first_name||'',c.last_name||''];var s=String(c.name||'').trim();return splitNameText(s);}
  function genericExportRows(){var headers=['First Name','Last Name','Email','Phone','Company','Address','City','State','ZIP','Source','Status','Tags','Notes'];var rows=current.contacts.map(function(c){var n=splitNameFallback(c);return [n[0],n[1],c.email,c.phone,c.company,c.address,c.city,c.state,c.zip,c.source,c.status,c.tags,c.notes];});return {headers:headers,rows:rows};}
  function boldtrailExportRows(){var headers=['First Name','Last Name','Email','Cell Phone 1','Lead Status','Source','Primary Address - Street','Primary Address - City','Primary Address - State/Province','Primary Address - Zip/Postal','Company','Note','Tags'];var rows=current.contacts.map(function(c){var n=splitNameFallback(c);return [n[0],n[1],c.email,c.phone,c.status,c.source,c.address,c.city,c.state,c.zip,c.company,c.notes,c.tags];});return {headers:headers,rows:rows};}
  function downloadBlob(blob,name){var url=window.URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){window.URL.revokeObjectURL(url);},1500);}
  async function archiveExport(target,blob,name){if(!user)throw new Error('Sign in to archive this export.');var id=uid(),path='user/'+user.id+'/'+id+'/'+safeName(name),meta={id:id,user_id:user.id,kind:'export',parent_file_id:current.meta&&current.meta.id||null,target:target,original_name:name,storage_path:path,file_size:blob.size,mime_type:'text/csv',row_count:current.contacts.length,source_column_count:13,column_names:target==='boldtrail'?boldtrailExportRows().headers:genericExportRows().headers,mapping:current.mapping||{},stats:current.meta&&current.meta.stats||{},status:'ready'};var up=await db.storage.from(BUCKET).upload(path,blob,{contentType:'text/csv;charset=utf-8',upsert:false});if(up.error)throw up.error;var ins=await db.from('agent_contact_files').insert(meta).select('*').single();if(ins.error){await db.storage.from(BUCKET).remove([path]);throw ins.error;}history.unshift(ins.data);renderHistory();updateStats();return ins.data;}
  async function exportFile(target){if(!current.contacts.length){toast('There are no contacts in the working file.','error');return;}var data=target==='boldtrail'?boldtrailExportRows():genericExportRows();var csv=makeCsv(data.headers,data.rows),day=new Date().toISOString().slice(0,10),name=target==='boldtrail'?'watchdog-boldtrail-contacts-'+day+'.csv':'watchdog-clean-contacts-'+day+'.csv',blob=new Blob([csv],{type:'text/csv;charset=utf-8'});showBusy('Preparing your '+(target==='boldtrail'?'BoldTrail':'clean')+' CSV…','Archiving a private copy to your Watchdog account.');try{await archiveExport(target,blob,name);current.dirty=false;var savedLabel=q('#acx-current-saved');if(savedLabel){savedLabel.classList.remove('warning');savedLabel.textContent='Clean export archived';}downloadBlob(blob,name);toast('CSV exported and saved to your Watchdog library.','success');}catch(e){downloadBlob(blob,name);toast('CSV downloaded, but Watchdog could not archive the export. '+friendlyError(e),'warning');}finally{hideBusy();}}

  function friendlyError(e){var m=String(e&&e.message||e||'Unknown error');if(/row-level security/i.test(m))return 'Your account could not save this file.';if(/mime/i.test(m))return 'The file type was not accepted.';if(/payload|size|too large/i.test(m))return 'The file is too large.';return m.length>160?m.slice(0,157)+'…':m;}
  async function persistOriginal(file,parsed,mapping){var id=uid(),path='user/'+user.id+'/'+id+'/'+safeName(file.name),meta={id:id,user_id:user.id,kind:'upload',target:'source',original_name:file.name||'contacts.csv',storage_path:path,file_size:file.size,mime_type:file.type||'text/csv',row_count:parsed.rows.length,source_column_count:parsed.headers.length,column_names:parsed.headers,mapping:mapping,stats:{working_rows:parsed.rows.length,name_mode:mapping._name_mode||'split'},status:'ready'};var up=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||'text/csv',upsert:false});if(up.error)throw up.error;var ins=await db.from('agent_contact_files').insert(meta).select('*').single();if(ins.error){await db.storage.from(BUCKET).remove([path]);throw ins.error;}return ins.data;}
  async function handleFile(file){
    if(!file)return;if(!confirmReplacement()){var input=q('#acx-file-input');if(input)input.value='';return;}if(file.size>MAX_BYTES){toast('That file is larger than 25 MB.','error');return;}if(!/\.csv$/i.test(file.name||'')){toast('Choose a .csv file.','error');return;}
    showBusy('Reading '+file.name+'…','Checking the file before anything is stored.');
    try{var text=await file.text(),parsed=parseCsv(text),mapping=autoMap(parsed.headers),meta=null,persisted=false;showBusy('Saving your original file…','Private to your Watchdog account.');try{meta=await persistOriginal(file,parsed,mapping);persisted=true;history.unshift(meta);renderHistory();updateStats();}catch(saveErr){console.warn('Agent Contacts original archive failed',saveErr);meta={id:null,original_name:file.name,row_count:parsed.rows.length,file_size:file.size,mapping:mapping,stats:{working_rows:parsed.rows.length,name_mode:mapping._name_mode||'split'}};toast('The CSV loaded, but the original could not be archived. You can still clean and export this session.','warning');}setCurrent(meta,parsed.headers,parsed.rows,mapping,persisted,true);if(persisted)toast('Original CSV saved privately.','success');}catch(e){toast(friendlyError(e),'error');}finally{hideBusy();var input=q('#acx-file-input');if(input)input.value='';}
  }

  function historyIcon(item){if(item.kind==='upload')return 'fa-arrow-up-from-bracket';if(item.target==='boldtrail')return 'fa-b';return 'fa-file-export';}
  function historyLabel(item){if(item.kind==='upload')return 'Original upload';if(item.target==='boldtrail')return 'BoldTrail export';return 'Clean CSV export';}
  function renderHistory(){var wrap=q('#acx-history');if(!wrap)return;var list=history.filter(function(x){return historyFilter==='all'||x.kind===historyFilter;});if(!list.length){wrap.innerHTML='<div class="acx-history-empty"><i class="fa-regular fa-folder-open"></i><b>No '+(historyFilter==='all'?'contact files':historyFilter==='upload'?'uploads':'exports')+' yet</b><span>Your saved CSV history will appear here.</span></div>';return;}wrap.innerHTML=list.map(function(item){return '<article class="acx-history-item" data-history-id="'+attr(item.id)+'"><span class="acx-history-icon '+(item.kind==='export'?'export':'')+'"><i class="fa-solid '+historyIcon(item)+'"></i></span><div class="acx-history-copy"><b title="'+attr(item.original_name)+'">'+esc(item.original_name)+'</b><span>'+esc(historyLabel(item))+' · '+Number(item.row_count||0).toLocaleString()+' rows</span><small>'+esc(dateLabel(item.created_at))+' · '+esc(sizeLabel(item.file_size))+'</small></div><div class="acx-history-actions"><button type="button" data-history-action="open" data-history-id="'+attr(item.id)+'" title="Open file"><i class="fa-solid fa-folder-open"></i></button><button type="button" data-history-action="download" data-history-id="'+attr(item.id)+'" title="Download file"><i class="fa-solid fa-download"></i></button></div></article>';}).join('');}
  function updateStats(){var files=q('#acx-stat-files'),rows=q('#acx-stat-rows'),exports=q('#acx-stat-exports');if(files)files.textContent=history.length.toLocaleString();if(rows)rows.textContent=history.filter(function(x){return x.kind==='upload';}).reduce(function(s,x){return s+Number(x.row_count||0);},0).toLocaleString();if(exports)exports.textContent=history.filter(function(x){return x.kind==='export';}).length.toLocaleString();}
  async function loadHistory(){var res=await db.from('agent_contact_files').select('*').order('created_at',{ascending:false}).limit(100);if(res.error)throw res.error;history=res.data||[];renderHistory();updateStats();}
  async function downloadHistory(item){showBusy('Opening your private file…','Downloading it securely from your account.');try{var res=await db.storage.from(BUCKET).download(item.storage_path);if(res.error)throw res.error;downloadBlob(res.data,item.original_name||'contacts.csv');toast('File downloaded.','success');}catch(e){toast('Could not download that file. '+friendlyError(e),'error');}finally{hideBusy();}}
  async function openHistory(item){if(!confirmReplacement())return;showBusy('Reopening '+item.original_name+'…','Restoring this saved CSV into the workspace.');try{var res=await db.storage.from(BUCKET).download(item.storage_path);if(res.error)throw res.error;var text=await res.data.text(),parsed=parseCsv(text),mapping=item.kind==='upload'&&item.mapping&&Object.keys(item.mapping).length?item.mapping:autoMap(parsed.headers);setCurrent(item,parsed.headers,parsed.rows,mapping,true,false);db.from('agent_contact_files').update({last_opened_at:new Date().toISOString()}).eq('id',item.id).then(function(){});toast('Saved file reopened.','success');}catch(e){toast('Could not reopen that file. '+friendlyError(e),'error');}finally{hideBusy();}}

  function guide(view){var modal=q('#acx-guide');if(!modal)return;modal.hidden=false;document.body.classList.add('acx-modal-open');setGuideView(view||'boldtrail');setTimeout(function(){var close=q('[data-guide-close]',modal);if(close)close.focus();},0);}
  function closeGuide(){var modal=q('#acx-guide');if(modal)modal.hidden=true;document.body.classList.remove('acx-modal-open');}
  function setGuideView(view){qa('[data-guide-view]').forEach(function(btn){btn.classList.toggle('active',btn.getAttribute('data-guide-view')===view);});qa('[data-guide-panel]').forEach(function(panel){panel.hidden=panel.getAttribute('data-guide-panel')!==view;});}
  function addShellLink(){var nav=q('.wd4-nav-links');if(!nav||nav.querySelector('[data-agent-contacts-link]'))return;var a=document.createElement('a');a.href='/agent/contacts';a.className='active';a.setAttribute('data-agent-contacts-link','1');a.innerHTML='<i class="fas fa-address-book"></i>Agent Contacts';var agent=Array.prototype.find.call(nav.querySelectorAll('a'),function(x){return /agent control/i.test(x.textContent||'');});if(agent)agent.insertAdjacentElement('afterend',a);else nav.appendChild(a);}

  function bind(){
    ensureNameUi();
    ['#acx-nav-upload','#acx-hero-upload','#acx-browse','#acx-replace'].forEach(function(s){var el=q(s);if(el)el.addEventListener('click',function(e){e.preventDefault();q('#acx-file-input').click();});});
    var input=q('#acx-file-input');if(input)input.addEventListener('change',function(){handleFile(input.files&&input.files[0]);});
    var drop=q('#acx-drop');if(drop){['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('drag');});});['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('drag');if(ev==='drop')handleFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]);});});drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}});}
    var map=q('#acx-map-grid');if(map)map.addEventListener('change',function(e){var sel=e.target.closest('select[data-map-field]');if(!sel)return;if(!confirmReplacement()){renderMap();return;}current.dirty=false;var key=sel.getAttribute('data-map-field'),value=sel.value;current.mapping[key]=value;if((key==='first_name'||key==='last_name')&&value&&value.charAt(0)!=='@'){current.mapping[key==='first_name'?'_name_first_source':'_name_last_source']=value;current.mapping._full_name='';current.mapping._name_mode='split';current.nameMode='split';}renderMap();rebuildContacts();saveMappingSoon();});
    document.addEventListener('click',function(e){var open=e.target.closest('[data-name-open]');if(open){e.preventDefault();openNamePrompt(true);return;}var close=e.target.closest('[data-name-close]');if(close){e.preventDefault();closeNamePrompt();return;}var choice=e.target.closest('[data-name-mode]');if(choice){e.preventDefault();applyNameMode(choice.getAttribute('data-name-mode'),{silent:true});renderNameMode();return;}if(e.target.closest('#acx-name-confirm')){e.preventDefault();applyNameMode(current.nameMode,{silent:true});closeNamePrompt();toast(current.nameMode==='split'?'Split names selected. You can change this anytime in Mapping.':'Names will stay together. You can change this anytime in Mapping.','success');}});
    q('#acx-review-next').addEventListener('click',function(){showSection('review');});q('#acx-back-map').addEventListener('click',function(){showSection('map');});q('#acx-export-next').addEventListener('click',function(){showSection('export');});q('#acx-back-review').addEventListener('click',function(){showSection('review');});q('#acx-jump-export').addEventListener('click',function(){showSection('export');});
    qa('.acx-steps button').forEach(function(btn){btn.addEventListener('click',function(){showSection(btn.getAttribute('data-step-target'));});});
    q('#acx-search').addEventListener('input',function(e){current.search=e.target.value;current.page=1;renderReview();});q('#acx-quality-filter').addEventListener('change',function(e){current.quality=e.target.value;current.page=1;renderReview();});q('#acx-prev').addEventListener('click',function(){if(current.page>1){current.page--;renderReview();}});q('#acx-next').addEventListener('click',function(){var pages=Math.max(1,Math.ceil(filteredContacts().length/PAGE_SIZE));if(current.page<pages){current.page++;renderReview();}});
    q('#acx-table-body').addEventListener('change',function(e){var check=e.target.closest('[data-select-id]');if(check){if(check.checked)current.selected.add(check.getAttribute('data-select-id'));else current.selected.delete(check.getAttribute('data-select-id'));renderReview();return;}var edit=e.target.closest('[data-edit-id]');if(edit){var c=current.contacts.find(function(x){return x._id===edit.getAttribute('data-edit-id');});if(c){c[edit.getAttribute('data-edit-key')]=edit.value;markDirty();recomputeQuality();renderReview();}}});
    q('#acx-select-page').addEventListener('change',function(e){var list=filteredContacts().slice((current.page-1)*PAGE_SIZE,current.page*PAGE_SIZE);list.forEach(function(c){if(e.target.checked)current.selected.add(c._id);else current.selected.delete(c._id);});renderReview();});
    q('#acx-remove-selected').addEventListener('click',function(){if(!current.selected.size)return;var n=current.selected.size;current.contacts=current.contacts.filter(function(c){return !current.selected.has(c._id);});current.selected.clear();markDirty();recomputeQuality();renderReview();toast(n+' contact'+(n===1?'':'s')+' removed from this working copy.','success');});
    q('#acx-export-boldtrail').addEventListener('click',function(){exportFile('boldtrail');});q('#acx-export-generic').addEventListener('click',function(){exportFile('generic');});
    q('#acx-open-guide').addEventListener('click',function(){guide('boldtrail');});qa('[data-guide-tab]').forEach(function(btn){btn.addEventListener('click',function(){guide(btn.getAttribute('data-guide-tab'));});});qa('[data-guide-close]').forEach(function(btn){btn.addEventListener('click',closeGuide);});qa('[data-guide-view]').forEach(function(btn){btn.addEventListener('click',function(){setGuideView(btn.getAttribute('data-guide-view'));});});document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!q('#acx-name-modal').hidden)closeNamePrompt();else if(!q('#acx-guide').hidden)closeGuide();}});
    q('#acx-history').addEventListener('click',function(e){var btn=e.target.closest('[data-history-action]');if(!btn)return;var item=history.find(function(x){return x.id===btn.getAttribute('data-history-id');});if(!item)return;if(btn.getAttribute('data-history-action')==='open')openHistory(item);else downloadHistory(item);});
    qa('[data-history-filter]').forEach(function(btn){btn.addEventListener('click',function(){historyFilter=btn.getAttribute('data-history-filter');qa('[data-history-filter]').forEach(function(b){b.classList.toggle('active',b===btn);});renderHistory();});});
    q('#acx-library-refresh').addEventListener('click',async function(){try{await loadHistory();toast('File library refreshed.','success');}catch(e){toast('Could not refresh your file library.','error');}});
  }

  async function init(){
    bind();
    try{createDb();var session=await db.auth.getSession();user=session&&session.data&&session.data.session&&session.data.session.user;if(!user){q('#acx-app').setAttribute('aria-busy','false');return;}var p=await db.from('profiles').select('display_name,full_name,pro_agent,plan_tier,account_role').eq('id',user.id).maybeSingle();profile=p.data||{};personalize();await loadHistory();addShellLink();setTimeout(addShellLink,250);q('#acx-app').setAttribute('aria-busy','false');}
    catch(e){console.error('Agent Contacts init failed',e);q('#acx-app').setAttribute('aria-busy','false');q('#acx-history').innerHTML='<div class="acx-history-empty error"><i class="fa-solid fa-triangle-exclamation"></i><b>File library unavailable</b><span>Reload the page or try again shortly.</span></div>';toast('Contacts could not fully load. '+friendlyError(e),'error');}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
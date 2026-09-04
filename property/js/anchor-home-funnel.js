(function(){
  'use strict';
  if(window.__WATCHDOG_ANCHOR_HOME_FUNNEL__)return;
  window.__WATCHDOG_ANCHOR_HOME_FUNNEL__=true;

  var host=String(location.hostname||'').toLowerCase();
  var path=(location.pathname||'').replace(/\/+$/,'');
  var isWatchdog=(host==='watchdogindex.com'||host==='www.watchdogindex.com');
  if(!isWatchdog||path!=='')return;

  var SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var HANDOFF=SUPABASE_URL+'/functions/v1/anchor-result-handoff';
  var SCORE=SUPABASE_URL+'/rest/v1/rpc/get_public_realtime_watchdog_scores';
  var PARTIAL='/property/partials/anchor-home-funnel.html';
  var RESULT_SESSION='wd_anchor_home_result_v1';
  var PREFILL_SESSION='wd_anchor_2025_prefill';
  var ESTIMATE_SESSION='wd_anchor_2025_estimate_id';
  var state={db:null,user:null,partial:null,result:null,subject:null,score:null,pending:null,quick:null,observer:null};

  function q(sel,root){return(root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
  function money(value){var n=Number(value);return Number.isFinite(n)?'$'+Math.round(n).toLocaleString():'$0';}
  function moneyOrDash(value){var n=Number(value);return Number.isFinite(n)&&n>0?'$'+Math.round(n).toLocaleString():'—';}
  function pct(value){var n=Number(value);return Number.isFinite(n)?n.toFixed(2)+'%':'—';}
  function clean(value,max){return String(value==null?'':value).trim().slice(0,max||500);}
  function track(name,params){try{if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){} }

  function getDb(){
    if(state.db)return state.db;
    try{if(window.NJPTRSupabaseRuntime&&typeof window.NJPTRSupabaseRuntime.createClient==='function')state.db=window.NJPTRSupabaseRuntime.createClient();}catch(_){state.db=null;}
    return state.db;
  }

  async function refreshUser(){
    var db=getDb();if(!db)return null;
    try{var r=await db.auth.getUser();state.user=r&&r.data&&r.data.user||null;}catch(_){state.user=null;}
    return state.user;
  }

  function tokenFromHash(){
    var raw=String(location.hash||'').replace(/^#/,'').trim();
    if(raw.indexOf('anchor-result=')===0)raw=raw.slice('anchor-result='.length);
    else if(raw.indexOf('result=')===0)raw=raw.slice('result='.length);
    return /^[a-f0-9]{64}$/i.test(raw)?raw:'';
  }

  function cleanHandoffUrl(){try{history.replaceState(null,document.title,(location.pathname||'/')+(location.search||''));}catch(_){} }

  function loadPartial(){
    if(state.partial)return Promise.resolve(state.partial);
    return fetch(PARTIAL,{cache:'default'}).then(function(r){if(!r.ok)throw new Error('partial');return r.text();}).then(function(html){var holder=document.createElement('div');holder.innerHTML=html;state.partial=holder;return holder;});
  }

  function ensureScript(id,src,ready){
    return new Promise(function(resolve){
      if(ready&&ready()){resolve();return;}
      var existing=document.getElementById(id)||document.querySelector('script[src="'+src+'"]');
      if(existing){if(ready&&ready()){resolve();return;}existing.addEventListener('load',function(){resolve();},{once:true});setTimeout(resolve,1400);return;}
      var s=document.createElement('script');s.id=id;s.src=src;s.async=true;s.onload=function(){resolve();};s.onerror=function(){resolve();};document.head.appendChild(s);
    });
  }

  function placeResult(section){
    var recents=document.getElementById('wd-consumer-recents');
    if(recents&&recents.parentNode){if(recents.previousElementSibling!==section)recents.parentNode.insertBefore(section,recents);return true;}
    var hero=q('.pl-hero');if(hero&&hero.parentNode){hero.insertAdjacentElement('afterend',section);return true;}
    return false;
  }

  function placeQuick(section){
    var county=document.getElementById('wd-county-intel');
    if(county&&county.parentNode){if(county.nextElementSibling!==section)county.insertAdjacentElement('afterend',section);return true;}
    var recents=document.getElementById('wd-consumer-recents');
    if(recents&&recents.parentNode){if(recents.nextElementSibling!==section)recents.insertAdjacentElement('afterend',section);return true;}
    return false;
  }

  function enforcePlacement(){
    if(state.observer||!document.body)return;
    state.observer=new MutationObserver(function(){var result=document.getElementById('wd-anchor-home-result');if(result)placeResult(result);var quick=document.getElementById('wd-anchor-quick');if(quick)placeQuick(quick);});
    state.observer.observe(document.body,{childList:true,subtree:true});
  }

  function parseAddress(address){
    var out={street:'',city:'',state:'NJ',zip:''};
    var parts=clean(address,300).split(',').map(function(x){return x.trim();}).filter(Boolean);
    if(parts.length>=3){out.street=parts[0];out.city=parts[1];var tail=parts.slice(2).join(' ');var m=tail.match(/\bNJ\s+(\d{5}(?:-\d{4})?)\b/i);if(m)out.zip=m[1];}
    else out.street=clean(address,300);
    return out;
  }

  function normalizeResult(raw,source){
    raw=raw||{};var answers=raw.answers||{};
    return{source:source||'njptr_verified_handoff',benefit:Number(raw.benefit)||0,qualifies:raw.qualifies===true,eligibility_label:clean(raw.eligibility_label,220),first_name:clean(raw.first_name,60),address:clean(raw.address,300),tenure:raw.tenure==='rent'?'rent':'own',answers:{income:['low','mid','high'].indexOf(answers.income)>=0?answers.income:'',age:answers.age==='yes'?'yes':'no',primary:answers.primary==='yes'?'yes':answers.primary==='no'?'no':'',taxes:answers.taxes==='yes'?'yes':answers.taxes==='no'?'no':''}};
  }

  function saveResultSession(result){try{sessionStorage.setItem(RESULT_SESSION,JSON.stringify({saved_at:Date.now(),result:result}));}catch(_){} }
  function restoreResultSession(){try{var row=JSON.parse(sessionStorage.getItem(RESULT_SESSION)||'null');if(!row||!row.result||Date.now()-Number(row.saved_at||0)>6*60*60*1000)return null;return normalizeResult(row.result,row.result.source||'njptr_verified_handoff');}catch(_){return null;} }

  function compute(inputs){
    var tenure=inputs.tenure==='rent'?'rent':'own',income=['low','mid','high'].indexOf(inputs.income)>=0?inputs.income:'',primary=inputs.primary==='yes',taxes=inputs.taxes==='yes',age=inputs.age==='yes';
    var qualifies=!!(tenure&&income&&primary&&income!=='high'&&!(tenure==='rent'&&income==='mid')&&!(tenure==='own'&&!taxes));
    var benefit=0;if(qualifies){if(tenure==='own')benefit=income==='low'?1500:1000;else benefit=age?700:450;}
    return normalizeResult({benefit:benefit,qualifies:qualifies,eligibility_label:qualifies?'Likely eligible based on the answers provided':'Not currently estimated as eligible based on the answers provided',address:inputs.address||'',tenure:tenure,answers:{income:income,age:age?'yes':'no',primary:primary?'yes':'no',taxes:tenure==='own'?(taxes?'yes':'no'):''}},'watchdog_quick_estimator');
  }

  function consume(token){return fetch(HANDOFF,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({action:'consume',result_token:token})}).then(function(r){return r.json().catch(function(){return{};}).then(function(body){if(!r.ok)throw new Error(body.error||'The secure result could not be opened.');return body;});});}
  function cloneTemplate(id){var t=q('#'+id,state.partial);if(!t||!t.content)return null;return t.content.firstElementChild.cloneNode(true);}

  function renderHandoff(result){
    state.result=result;
    var old=document.getElementById('wd-anchor-home-result');if(old)old.remove();
    var section=cloneTemplate('wd-anchor-home-result-template');if(!section)return;
    var amount=q('[data-anchor-amount]',section),status=q('[data-anchor-status]',section),address=q('[data-anchor-address]',section),hello=q('[data-anchor-hello]',section),propertyLink=q('[data-anchor-property]',section);
    if(amount)amount.textContent=money(result.benefit);
    if(status){status.textContent=result.eligibility_label||'Estimate based on the answers provided.';status.classList.toggle('is-review',!result.qualifies);}
    if(address)address.textContent=result.address||'New Jersey residence';
    if(hello)hello.textContent=result.first_name?'Hi '+result.first_name+'. Your estimate is ready.':'Your estimate is ready.';
    if(propertyLink)propertyLink.href='/?address='+encodeURIComponent(result.address||'');
    section.addEventListener('click',function(e){var action=e.target&&e.target.closest&&e.target.closest('[data-anchor-action]');if(!action)return;e.preventDefault();requestAction(result,section,action.dataset.anchorAction);});
    placeResult(section);enforcePlacement();track('anchor_watchdog_home_result_view',{tenure:result.tenure,qualified:result.qualifies===true});hydrateProperty(result,section);
  }

  function renderHandoffError(message){
    var section=document.getElementById('wd-anchor-home-result');if(!section){section=cloneTemplate('wd-anchor-home-result-template');if(!section)return;placeResult(section);}
    var grid=q('.wd-anchor-home-grid',section);if(grid)grid.innerHTML='<div class="wd-anchor-home-error"><strong>This secure handoff could not be reopened.</strong><p>'+esc(message||'You can still use Watchdog normally or run the quick estimator below.')+'</p></div>';
  }

  function scoreSubject(subject){
    if(!subject||!subject.pamsPin)return Promise.resolve(null);
    return fetch(SCORE,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({p_rows:[{pams_pin:subject.pamsPin}]})}).then(function(r){if(!r.ok)throw new Error('score');return r.json();}).then(function(rows){return Array.isArray(rows)&&rows[0]||null;}).catch(function(){return null;});
  }

  function hydrateProperty(result,section){
    var host=q('[data-anchor-property-context]',section);if(!host)return;
    ensureScript('wd-anchor-home-parcel-runtime','/nj-parcel-enrich.js',function(){return typeof window.enrichLead==='function';}).then(function(){if(typeof window.enrichLead!=='function')throw new Error('parcel');return window.enrichLead(result.address);}).then(function(subject){state.subject=subject&&subject.status==='ok'?subject:null;return scoreSubject(state.subject).then(function(score){state.score=score;renderPropertyContext(host,result,state.subject,score);});}).catch(function(){renderPropertyContext(host,result,null,null);});
  }

  function renderPropertyContext(host,result,subject,score){
    if(!subject){host.innerHTML='<div class="wd-anchor-property-empty"><span>WATCHDOG PROPERTY CONTEXT</span><strong>Property match unavailable</strong><p>We will not guess when a New Jersey parcel cannot be matched confidently.</p><a href="/?address='+encodeURIComponent(result.address||'')+'">Open property search →</a></div>';return;}
    var scoreValue=score&&Number(score.watchdog_score),hasScore=Number.isFinite(scoreValue);
    host.innerHTML='<div class="wd-anchor-property-head"><span>WATCHDOG PROPERTY CONTEXT</span><b>'+esc(subject.propertyLocation||result.address)+'</b><small>'+esc(subject.municipality||'New Jersey')+(subject.county?' · '+esc(subject.county)+' County':'')+'</small></div>'+
      '<div class="wd-anchor-property-score"><div><strong>'+(hasScore?Math.round(scoreValue):'—')+'</strong><span>Watchdog Score</span></div><p>'+(hasScore?'Canonical score shown when ROBUST evidence supports it.':'Canonical score not yet available for this property.')+'</p></div>'+
      '<div class="wd-anchor-property-stats"><div><b>'+moneyOrDash(subject.assessedValue)+'</b><span>Assessment</span></div><div><b>'+moneyOrDash(subject.lastYearTax)+'</b><span>Prior-year tax</span></div><div><b>'+pct(subject.effectiveTaxRatePct)+'</b><span>Effective rate</span></div></div>'+
      '<a class="wd-anchor-property-open" href="/?address='+encodeURIComponent(result.address||'')+'">Open full property record →</a>';
    track('anchor_watchdog_home_property_loaded',{parcel_matched:true,score_available:hasScore});
  }

  function quickValues(section){function value(name){var el=q('[name="'+name+'"]',section);return el?clean(el.value,300):'';}return{tenure:value('wd_anchor_tenure'),income:value('wd_anchor_income'),age:value('wd_anchor_age'),primary:value('wd_anchor_primary'),taxes:value('wd_anchor_taxes'),address:value('wd_anchor_address')};}

  function showQuickForm(section,focusAddress){
    var out=q('[data-anchor-quick-result]',section),form=q('[data-anchor-quick-form]',section),chips=q('[data-anchor-quick-chips]',section),auth=q('[data-anchor-auth-host]',section);
    if(out)out.hidden=true;if(form)form.hidden=false;if(chips)chips.hidden=true;if(auth){auth.hidden=true;auth.innerHTML='';}
    var target=focusAddress?q('[name="wd_anchor_address"]',form):q('select,input',form);
    if(target){target.focus();if(focusAddress)target.scrollIntoView({behavior:'smooth',block:'center'});}
  }

  function ensureQuick(){
    if(document.getElementById('wd-anchor-quick')||state.result)return;
    var section=q('#wd-anchor-quick',state.partial);if(!section)return;section=section.cloneNode(true);section.hidden=false;
    var form=q('[data-anchor-quick-form]',section),tenure=q('[name="wd_anchor_tenure"]',section),taxWrap=q('[data-anchor-tax-wrap]',section),edit=q('[data-anchor-quick-edit]',section);
    if(form)form.hidden=false;
    if(tenure)tenure.addEventListener('change',function(){taxWrap.hidden=tenure.value!=='own';var tax=q('[name="wd_anchor_taxes"]',section);if(tax&&tenure.value!=='own')tax.value='';});
    if(form)form.addEventListener('submit',function(e){e.preventDefault();runQuick(section);});
    if(edit)edit.addEventListener('click',function(){showQuickForm(section,false);track('anchor_quick_estimator_edit',{surface:'watchdog_home'});});
    section.addEventListener('click',function(e){var action=e.target&&e.target.closest&&e.target.closest('[data-anchor-action]');if(!action)return;e.preventDefault();if(!state.quick)return;requestAction(state.quick,section,action.dataset.anchorAction);});
    placeQuick(section);enforcePlacement();track('anchor_quick_estimator_open',{surface:'watchdog_home',presentation:'always_open'});
  }

  function runQuick(section){
    var values=quickValues(section),status=q('[data-anchor-quick-status]',section);
    if(!values.tenure||!values.income||!values.age||!values.primary||(values.tenure==='own'&&!values.taxes)){if(status){status.textContent='Answer the short eligibility questions first.';status.classList.add('is-error');}return;}
    if(status){status.textContent='';status.classList.remove('is-error');}
    var result=compute(values);state.quick=result;var out=q('[data-anchor-quick-result]',section),form=q('[data-anchor-quick-form]',section),chips=q('[data-anchor-quick-chips]',section);if(!out)return;
    if(form)form.hidden=true;out.hidden=false;
    q('[data-anchor-quick-amount]',out).textContent=money(result.benefit);var label=q('[data-anchor-quick-label]',out);if(label){label.textContent=result.eligibility_label;label.classList.toggle('is-review',!result.qualifies);}
    var address=q('[data-anchor-quick-address]',out),addressText=q('[data-anchor-quick-address-text]',out);if(address&&addressText){address.hidden=!result.address;addressText.textContent=result.address||'';}
    if(chips){
      var incomeCopy=result.answers.income==='low'?'Income $150K or less':result.answers.income==='mid'?'Income $150K–$250K':'Income over $250K';
      var tenureChip=q('[data-anchor-chip-tenure]',chips),ageChip=q('[data-anchor-chip-age]',chips),incomeChip=q('[data-anchor-chip-income]',chips);
      if(tenureChip)tenureChip.textContent=result.tenure==='own'?'Homeowner':'Renter';
      if(ageChip)ageChip.textContent=result.answers.age==='yes'?'65 or older':'Under 65';
      if(incomeChip)incomeChip.textContent=incomeCopy;
      chips.hidden=false;
    }
    track('anchor_quick_estimator_result',{qualified:result.qualifies===true,tenure:result.tenure});
  }

  function modelInputs(model){var a=model.answers||{};return{tenure:model.tenure,income_band:a.income,age_65_plus:a.age==='yes',primary_residence:a.primary==='yes',property_taxes_paid:model.tenure==='own'?a.taxes==='yes':null};}

  function rowForSave(model){
    var subject=(model===state.result?state.subject:null),parsed=parseAddress(model.address),inputs=modelInputs(model);
    return{user_id:state.user.id,tax_year:2025,program:'ANCHOR',rules_version:'2025.1',estimate_source:model.source,tenure:inputs.tenure,income_band:inputs.income_band,age_65_plus:inputs.age_65_plus,primary_residence:inputs.primary_residence,property_taxes_paid:inputs.property_taxes_paid,property_address:clean(model.address,300),property_pams_pin:subject&&subject.pamsPin||null,property_town:subject&&subject.municipality||parsed.city||null,property_county:subject&&subject.county||null,property_zip:parsed.zip||null,property_block:subject&&subject.block||null,property_lot:subject&&subject.lot||null,property_qualifier:subject&&subject.qualifier||null,assessed_value:subject&&Number(subject.assessedValue)>0?Math.round(Number(subject.assessedValue)):null,prior_year_tax:subject&&Number(subject.lastYearTax)>0?Number(subject.lastYearTax):null,estimated_at:new Date().toISOString()};
  }

  async function saveEstimate(model,section){
    if(!model.address){var input=q('[name="wd_anchor_address"]',section),status=q('[data-anchor-save-status]',section)||q('[data-anchor-quick-status]',section);if(status){status.textContent='Add the New Jersey residence used for this estimate before saving.';status.classList.add('is-error');}if(input){input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});}throw new Error('address_required');}
    var db=getDb();if(!db||!state.user)throw new Error('auth_required');var row=rowForSave(model);
    var r=await db.from('anchor_estimates').upsert(row,{onConflict:'user_id,tax_year,program,property_address'}).select('id,estimated_amount,qualifies,property_address,application_id').single();if(r.error)throw r.error;
    model.savedEstimate=r.data;var saveStatus=q('[data-anchor-save-status]',section)||q('[data-anchor-quick-status]',section);if(saveStatus){saveStatus.textContent='Saved to your Watchdog account.';saveStatus.classList.remove('is-error');saveStatus.classList.add('is-saved');}
    qa('[data-anchor-action="save"]',section).forEach(function(b){b.textContent='Saved to Watchdog';b.disabled=true;});track('anchor_estimate_saved',{source:model.source,qualified:r.data.qualifies===true});return r.data;
  }

  function appPrefill(model,saved){
    var parsed=parseAddress(model.address),subject=(model===state.result?state.subject:null),a=model.answers||{};
    return{source:model.source,estimate_id:saved&&saved.id||'',estimated_amount:saved&&saved.estimated_amount||model.benefit,first_name:model.first_name||'',tenure:model.tenure,primary_residence:a.primary==='yes',address:model.address,street:parsed.street,city:parsed.city,state:'NJ',zip:parsed.zip,property:{pams_pin:subject&&subject.pamsPin||'',block:subject&&subject.block||'',lot:subject&&subject.lot||'',qualifier:subject&&subject.qualifier||''}};
  }

  function startApplication(model,saved){try{sessionStorage.setItem(PREFILL_SESSION,JSON.stringify(appPrefill(model,saved)));if(saved&&saved.id)sessionStorage.setItem(ESTIMATE_SESSION,saved.id);}catch(_){}track('anchor_application_start_from_estimate',{source:model.source,qualified:!!(saved?saved.qualifies:model.qualifies)});location.href='/anchor/application/2025/';}

  async function executeAction(model,section,action){
    try{var saved=model.savedEstimate||await saveEstimate(model,section);if(action==='start')startApplication(model,saved);}catch(err){if(err&&err.message==='address_required')return;var status=q('[data-anchor-save-status]',section)||q('[data-anchor-quick-status]',section);if(status){status.textContent='Watchdog could not save this estimate right now. Your result is still available on this page.';status.classList.add('is-error');}}
  }

  // content-architecture: dynamic — this validation copy appears only when a completed quick estimate lacks the address required for save/application actions.
  async function requestAction(model,section,action){
    if(model===state.quick&&!model.address){var status=q('[data-anchor-quick-status]',section);showQuickForm(section,true);if(status){status.textContent='Add the New Jersey residence used for this estimate before saving or starting an application.';status.classList.add('is-error');}return;}
    var user=state.user||await refreshUser();if(user){executeAction(model,section,action);return;}state.pending={model:model,section:section,action:action};renderAuth(section);
  }

  function renderAuth(section){
    var authHost=q('[data-anchor-auth-host]',section);if(!authHost)return;authHost.hidden=false;var authTemplate=q('#wd-anchor-home-auth-template',state.partial);authHost.innerHTML='';if(authTemplate&&authTemplate.content)authHost.appendChild(authTemplate.content.cloneNode(true));else{authHost.textContent='Watchdog account sign-in is temporarily unavailable.';return;}
    var send=q('[data-anchor-auth-send]',authHost),verify=q('[data-anchor-auth-verify]',authHost),email=q('[data-anchor-auth-email]',authHost),code=q('[data-anchor-auth-code]',authHost),wrap=q('[data-anchor-auth-code-wrap]',authHost),status=q('[data-anchor-auth-status]',authHost);
    send.addEventListener('click',async function(){var address=clean(email.value,254).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(address)){status.textContent='Enter a valid email address.';return;}send.disabled=true;status.textContent='Sending your secure sign-in code…';try{var db=getDb();if(!db)throw new Error('client');var r=await db.auth.signInWithOtp({email:address,options:{shouldCreateUser:true}});if(r.error)throw r.error;wrap.hidden=false;status.textContent='Check your email for the six-digit code.';code.focus();}catch(_){status.textContent='We could not send the sign-in code. Try again.';}finally{send.disabled=false;}});
    verify.addEventListener('click',async function(){var address=clean(email.value,254).toLowerCase(),token=clean(code.value,12).replace(/\D/g,'').slice(0,6);if(token.length!==6){status.textContent='Enter the six-digit code.';return;}verify.disabled=true;status.textContent='Verifying…';try{var db=getDb();var r=await db.auth.verifyOtp({email:address,token:token,type:'email'});if(r.error||!r.data||!r.data.user)throw(r.error||new Error('verify'));state.user=r.data.user;if(window.WatchdogPublicNav&&typeof window.WatchdogPublicNav.setUser==='function')window.WatchdogPublicNav.setUser(state.user);authHost.hidden=true;authHost.innerHTML='';var pending=state.pending;state.pending=null;if(pending)executeAction(pending.model,pending.section,pending.action);}catch(_){status.textContent='That code could not be verified. Check it and try again.';}finally{verify.disabled=false;}});
    email.focus();authHost.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  async function boot(){
    try{await loadPartial();}catch(_){return;}enforcePlacement();await refreshUser();var token=tokenFromHash(),restored=!token&&restoreResultSession();
    if(token){cleanHandoffUrl();consume(token).then(function(body){var result=normalizeResult(body&&body.result,'njptr_verified_handoff');saveResultSession(result);renderHandoff(result);}).catch(function(err){renderHandoffError(err&&err.message);setTimeout(ensureQuick,300);});}
    else if(restored)renderHandoff(restored);else setTimeout(ensureQuick,250);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
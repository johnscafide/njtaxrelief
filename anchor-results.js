(function(){
  'use strict';

  var SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var HANDOFF=SUPABASE_URL+'/functions/v1/anchor-result-handoff';
  var SCORE=SUPABASE_URL+'/rest/v1/rpc/get_public_realtime_watchdog_scores';
  var ROBUST=[
    ['R','Recourse','Paths and evidence for review.'],
    ['O','Overassessment','Assessment versus supported value.'],
    ['B','Burden','Taxes relative to property value.'],
    ['U','Uniformity','Consistency across the assessment system.'],
    ['S','Stability','Pressure for structural change.'],
    ['T','Trajectory','Direction of the tax position.']
  ];
  var TYPES={'1':'Vacant land','2':'Residential','3A':'Farm','3B':'Qualified farm','4A':'Commercial','4B':'Industrial','4C':'Apartment 5+ units','15A':'Public property','15B':'Exempt','15C':'Cemetery','15D':'Exempt','15E':'Exempt','15F':'Exempt'};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(v){var n=Number(v);return Number.isFinite(n)&&n>0?'$'+Math.round(n).toLocaleString():'Not on file';}
  function pct(v){var n=Number(v);return Number.isFinite(n)?n.toFixed(2)+'%':'Not on file';}
  function track(name,params){try{if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){}}
  function tokenFromHash(){var raw=String(location.hash||'').replace(/^#/,'').trim();if(raw.indexOf('result=')===0)raw=raw.slice(7);return /^[a-f0-9]{64}$/i.test(raw)?raw:'';}
  function cleanUrl(){try{history.replaceState(null,'','/anchor/results/');}catch(_){}}
  function root(){return document.getElementById('wd-anchor-result');}
  function loading(){var el=root();if(!el)return;el.innerHTML='<div class="wd-ar-card wd-ar-loading"><div class="wd-ar-spinner"></div><h2>Opening your secure result</h2><p>Watchdog is loading your ANCHOR estimate and matching the residence you entered to New Jersey public property records.</p></div>';}
  function error(message){var el=root();if(!el)return;el.innerHTML='<div class="wd-ar-card wd-ar-error"><h2>This secure result is no longer available.</h2><p>'+esc(message||'Run the estimator again to create a fresh result.')+'</p><div class="wd-ar-actions" style="justify-content:center"><a class="wd-ar-btn primary" href="https://njpropertytaxrelief.com/anchor-estimator.html">Run the estimator again</a><a class="wd-ar-btn secondary" href="/">Explore Watchdog</a></div></div>';}
  function fact(value,label){return '<div class="wd-ar-fact"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>';}
  function stat(value,label){return '<div class="wd-ar-stat"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>';}
  function robust(){return ROBUST.map(function(d){return '<div class="wd-ar-dim"><span class="wd-ar-letter">'+d[0]+'</span><span><b>'+esc(d[1])+'</b><span>'+esc(d[2])+'</span></span></div>';}).join('');}
  function tenureLabel(v){return v==='own'?'Homeowner':v==='rent'?'Renter':'Not provided';}
  function incomeLabel(v){return v==='low'?'Under $150,000':v==='mid'?'$150,001–$250,000':v==='high'?'Over $250,000':'Not provided';}

  function renderBase(result){
    var el=root();if(!el)return;
    var benefit=Number(result.benefit)||0;
    var amount=benefit?'$'+benefit.toLocaleString():'$0';
    var hello=result.first_name?'Hi '+esc(result.first_name)+'. ':'';
    el.innerHTML=''
      +'<div class="wd-ar-grid">'
      +'<section class="wd-ar-card">'
      +'<div class="wd-ar-benefit"><div class="wd-ar-benefit-label">Your estimated ANCHOR benefit</div><div class="wd-ar-benefit-amount">'+amount+'</div><div class="wd-ar-benefit-status"><span>●</span><span>'+esc(result.eligibility_label||'Estimate based on the answers provided.')+'</span></div></div>'
      +'<div class="wd-ar-section"><h2>'+hello+'Here is the answer you came for.</h2><p>This estimate was recalculated server-side after your email verification. It is informational and is not a determination from the New Jersey Division of Taxation.</p><div class="wd-ar-facts">'
      +fact(tenureLabel(result.tenure),'Residence status')
      +fact(incomeLabel(result.answers&&result.answers.income),'Income bracket')
      +fact(result.answers&&result.answers.age==='yes'?'65 or older':'Under 65 / not selected','Age answer')
      +fact(result.qualifies?'Likely eligible':'Review eligibility','Estimator outcome')
      +'</div></div>'
      +'<div class="wd-ar-section"><h2>Your rebate is only one part of the property story.</h2><p>Because you entered a verified New Jersey residence, Watchdog can put that estimate next to the public assessment, tax record and property signals that affect the home itself.</p></div>'
      +'</section>'
      +'<aside class="wd-ar-card wd-ar-property" id="wd-ar-property"><div class="wd-ar-property-head"><div><h2>Watchdog property intelligence</h2><div class="wd-ar-address">'+esc(result.address)+'</div></div><div class="wd-ar-public">NJ public record</div></div><div class="wd-ar-loading" style="padding:28px 10px"><div class="wd-ar-spinner"></div><p>Matching this residence to governed property records…</p></div></aside>'
      +'</div>'
      +'<section class="wd-ar-next"><h2>Now you are inside Watchdog.</h2><p>Use Watchdog to explore property records, taxes, assessments, scores and New Jersey property intelligence beyond the relief estimate.</p><div class="wd-ar-actions"><a class="wd-ar-btn primary" href="/" data-wd-next="home">Explore Watchdog</a><a class="wd-ar-btn secondary" href="/insights/">Read Watchdog Insights</a></div></section>'
      +'<div class="wd-ar-disclaimer">ANCHOR eligibility and benefit amounts are governed by the State of New Jersey and can change. Watchdog and NJPropertyTaxRelief.com are independent resources and are not affiliated with or endorsed by the State of New Jersey. Property-record data can lag real-world changes. Watchdog Score is shown only when sufficient canonical ROBUST evidence exists.</div>';
    Array.prototype.slice.call(document.querySelectorAll('[data-wd-next]')).forEach(function(a){a.addEventListener('click',function(){track('anchor_watchdog_continue',{destination:'watchdog_home'});});});
  }

  function scoreSubject(subject){
    if(!subject||!subject.pamsPin)return Promise.resolve(null);
    return fetch(SCORE,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({p_rows:[{pams_pin:subject.pamsPin}]})})
      .then(function(r){if(!r.ok)throw new Error('score '+r.status);return r.json();})
      .then(function(rows){var row=Array.isArray(rows)&&rows[0];return row||null;})
      .catch(function(){return null;});
  }

  function propertyType(code){var key=String(code||'').toUpperCase();return TYPES[key]|| (key?'Class '+key:'Not on file');}
  function sourceLabel(row){if(!row||!Number.isFinite(Number(row.watchdog_score)))return 'Canonical score pending';if(row.score_source==='robust_observation')return 'Canonical ROBUST-v1 observation';if(row.score_source==='robust_public_cache')return 'Canonical ROBUST-v1 public cache';return 'Canonical ROBUST-v1';}

  function renderProperty(result,subject,scoreRow){
    var el=document.getElementById('wd-ar-property');if(!el)return;
    if(!subject||subject.status!=='ok'||!subject.pamsPin){
      el.innerHTML='<div class="wd-ar-property-head"><div><h2>Watchdog property intelligence</h2><div class="wd-ar-address">'+esc(result.address)+'</div></div><div class="wd-ar-public">NJ public record</div></div><p>Watchdog could not confidently attach this residence to a state parcel record without guessing. Your ANCHOR estimate above is unaffected.</p><div class="wd-ar-actions"><a class="wd-ar-btn primary" href="/">Try Watchdog property search</a></div>';
      return;
    }
    var score=scoreRow&&Number(scoreRow.watchdog_score);var hasScore=Number.isFinite(score);
    el.innerHTML=''
      +'<div class="wd-ar-property-head"><div><h2>Watchdog property intelligence</h2><div class="wd-ar-address">'+esc(subject.propertyLocation||result.address)+' · '+esc(subject.municipality||'New Jersey')+(subject.county?' · '+esc(subject.county)+' County':'')+'</div></div><div class="wd-ar-public">NJ public record</div></div>'
      +'<div class="wd-ar-score"><div class="wd-ar-score-ring"><span>'+(hasScore?Math.round(score):'—')+'<small>'+(hasScore?'/ 100':'PENDING')+'</small></span></div><div class="wd-ar-score-copy"><b>'+(hasScore?'Watchdog Score':'Canonical score not yet available')+'</b><span>'+(hasScore?'Watchdog tells you where the property stands. ROBUST explains why.':'Watchdog will not invent a score when canonical evidence is insufficient.')+'</span><span style="margin-top:7px;font-size:9px;font-weight:850">'+esc(sourceLabel(scoreRow))+'</span></div></div>'
      +'<div class="wd-ar-stats">'
      +stat(money(subject.assessedValue),'Assessed value')
      +stat(money(subject.lastYearTax),'Prior-year tax')
      +stat(pct(subject.effectiveTaxRatePct),'Effective tax rate')
      +stat(propertyType(subject.propertyClass),'Property class')
      +stat(subject.yearBuilt?String(subject.yearBuilt):'Not on file','Year built')
      +stat(Number(subject.lastSalePrice)>0?money(subject.lastSalePrice):'Not on file','Recorded sale')
      +'</div>'
      +'<div class="wd-ar-robust"><div class="wd-ar-robust-title">ROBUST foundation</div><div class="wd-ar-robust-sub">One score. Six dimensions. Evidence first.</div><div class="wd-ar-robust-grid">'+robust()+'</div></div>'
      +'<p class="wd-ar-note">The property record is separate from your ANCHOR eligibility. A renter may see the public record for the residence without any implication of ownership.</p>';
    track('anchor_watchdog_property_loaded',{parcel_matched:true,score_available:hasScore,tenure:result.tenure||'unknown'});
  }

  function hydrateProperty(result){
    if(typeof window.enrichLead!=='function')return renderProperty(result,null,null);
    window.enrichLead(result.address).then(function(subject){return scoreSubject(subject).then(function(scoreRow){renderProperty(result,subject,scoreRow);});}).catch(function(){renderProperty(result,null,null);});
  }

  function consume(token){
    return fetch(HANDOFF,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({action:'consume',result_token:token})})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(body){if(!r.ok)throw new Error(body.error||'The result could not be opened.');return body;});});
  }

  function boot(){
    var token=tokenFromHash();
    cleanUrl();
    loading();
    if(!token){error('The secure handoff token is missing. Run the estimator again to create a new result.');return;}
    consume(token).then(function(body){
      var result=body&&body.result;if(!result)throw new Error('The secure result payload was empty.');
      renderBase(result);track('anchor_watchdog_result_view',{tenure:result.tenure||'unknown',qualified:!!result.qualifies});hydrateProperty(result);
    }).catch(function(err){error(err&&err.message?err.message:'Run the estimator again to create a new result.');});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(function(){
'use strict';
if(window.__WATCHDOG_ANCHOR_MUNICIPAL_TAX__)return;window.__WATCHDOG_ANCHOR_MUNICIPAL_TAX__=true;
var busy=false,lastKey='',lastResult=null;
function q(s,r){return(r||document).querySelector(s)}
function val(name){var el=q('[name="'+name+'"]');return el?String(el.value||'').trim():''}
function setIfBlank(name,value){if(value===null||value===undefined||value==='')return false;var el=q('[name="'+name+'"]');if(!el||String(el.value||'').trim())return false;el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true}
function money(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Not published'}
function num(v,d){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d||0,maximumFractionDigits:d||3}):'Not published'}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function client(){try{return window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(_){return null}}
function host(){var step=q('.wd-step[data-step="property"]');if(!step)return null;var h=q('#wd-municipal-tax-evidence',step);if(h)return h;h=document.createElement('div');h.id='wd-municipal-tax-evidence';h.className='wd-callout neutral';var heading=q('h2',step);if(heading)heading.insertAdjacentElement('afterend',h);else step.prepend(h);renderIdle(h);return h}
function renderIdle(h){
  // content-architecture: dynamic — availability copy changes with whether this municipality has a supported live tax provider and exact-match capability.
  h.innerHTML='<strong>Official municipal tax record</strong><p>Watchdog can check supported municipal tax systems and fill tax amounts only after an exact address match.</p><button type="button" class="wd-btn secondary small" data-municipal-tax-lookup>Check official tax record</button><small style="display:block;margin-top:8px">Your existing entries are never overwritten.</small>';
}
function renderBusy(h){
  // content-architecture: dynamic — transient network state shown only while the signed-in user is running an official-record lookup.
  h.innerHTML='<strong>Checking the official municipal tax record…</strong><p>Matching the address to the municipality’s public tax account.</p>';
}
function yearRow(year,a){if(!a)return'';
  // content-architecture: dynamic — row values and presence are generated from the years returned by the municipality’s live tax provider.
  return '<div style="display:grid;grid-template-columns:70px repeat(3,minmax(0,1fr));gap:8px;padding:7px 0;border-top:1px solid rgba(15,23,42,.08);font-size:.84rem"><b>'+esc(year)+'</b><span>'+money(a.property_tax_billed)+'</span><span>'+num(a.tax_rate,3)+'</span><span>'+money(a.total_assessed_value)+'</span></div>';
}
function renderResult(h,r,filled){lastResult=r;
  if(r.status==='provider_not_available'){
    // content-architecture: dynamic — provider-not-available is a municipality-specific live lookup outcome.
    h.innerHTML='<strong>No supported live municipal tax feed found</strong><p>Enter the property-tax information from the tax bill or municipal record. Watchdog will not guess.</p>';return;
  }
  if(r.status==='no_exact_match'){
    // content-architecture: dynamic — no-exact-match is returned only after live candidate matching for the submitted property.
    h.innerHTML='<strong>Municipal tax system found, but the property was not matched exactly</strong><p>Nothing was filled. Confirm the street address or enter the tax information manually.</p><button type="button" class="wd-btn secondary small" data-municipal-tax-lookup>Try again</button>';return;
  }
  if(r.status!=='exact_match'){
    // content-architecture: dynamic — recovery state depends on the current provider response rather than stable page copy.
    h.innerHTML='<strong>Official tax record could not be retrieved</strong><p>Nothing was filled. You can continue using your tax bill.</p><button type="button" class="wd-btn secondary small" data-municipal-tax-lookup>Try again</button>';return;
  }
  var a24=r.annual&&r.annual['2024'],a25=r.annual&&r.annual['2025'];
  // content-architecture: dynamic — exact-match presentation embeds live provider label, subject address/account, annual tax evidence, provenance and checked timestamp.
  h.innerHTML='<strong>Official municipal tax record matched</strong><p>'+esc(r.provider_label||'Official municipal tax system')+' matched <b>'+esc(r.match&&r.match.property_location||'this address')+'</b>'+(r.match&&r.match.account_id?' · Account '+esc(r.match.account_id):'')+'. '+(filled?'Watchdog filled blank property fields below.':'Your existing values were preserved.')+'</p><div style="margin-top:10px"><div style="display:grid;grid-template-columns:70px repeat(3,minmax(0,1fr));gap:8px;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em"><span>Year</span><span>Taxes billed</span><span>Tax rate</span><span>Assessment</span></div>'+yearRow('2024',a24)+yearRow('2025',a25)+'</div><small style="display:block;margin-top:10px">Checked '+esc(new Date(r.checked_at).toLocaleString())+'. Review these public-record values before filing. Watchdog does not overwrite answers you entered yourself.</small>';
}
async function lookup(force){if(busy)return;var address=val('mailing.address'),city=val('mailing.city'),zip=val('mailing.zip'),code=val('mailing.municipality_code').replace(/\D/g,'').slice(0,4);if(!address||code.length!==4)return;var key=[code,address,city,zip,val('property.block'),val('property.lot')].join('|').toUpperCase();if(!force&&key===lastKey&&lastResult)return;var h=host(),c=client();if(!h||!c)return;busy=true;lastKey=key;renderBusy(h);try{var res=await c.functions.invoke('municipal-property-tax-evidence',{body:{municipality_code:code,address:[address,city,'NJ',zip].filter(Boolean).join(', '),block:val('property.block'),lot:val('property.lot')}});if(res.error)throw res.error;var r=res.data||{},filled=false;if(r.status==='exact_match'){var p=r.match&&r.match.parcel||{},a=r.annual||{};filled=setIfBlank('property.block',p.block)||filled;filled=setIfBlank('property.lot',p.lot)||filled;filled=setIfBlank('property.qualifier',p.qualifier)||filled;filled=setIfBlank('property.tax_2024',a['2024']&&a['2024'].property_tax_billed)||filled;filled=setIfBlank('property.tax_2025',a['2025']&&a['2025'].property_tax_billed)||filled}renderResult(h,r,filled)}catch(e){console.warn('Municipal tax lookup unavailable',e);
    // content-architecture: dynamic — this error recovery state exists only when the live municipal lookup fails.
    h.innerHTML='<strong>Official tax lookup is temporarily unavailable</strong><p>Nothing was changed. You can continue with your tax bill.</p><button type="button" class="wd-btn secondary small" data-municipal-tax-lookup>Try again</button>';
  }finally{busy=false}}
document.addEventListener('click',function(e){var b=e.target.closest('[data-municipal-tax-lookup]');if(b){e.preventDefault();lookup(true);return}var next=e.target.closest('.wd-step[data-step="address"] [data-next]');if(next)setTimeout(function(){lookup(false)},350)});
var observer=new MutationObserver(function(){var step=q('.wd-step[data-step="property"].is-active');if(step){host();lookup(false)}});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});host()},{once:true});else{observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});host()}
})();

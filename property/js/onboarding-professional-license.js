(function(){
  'use strict';
  var root=document.getElementById('wd-onboarding-root');
  if(!root||!window.NJPTRSupabaseRuntime)return;
  var db=window.NJPTRSupabaseRuntime.createClient();
  var captured='';
  var bypass=false;
  var submitted=false;

  function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function normalize(v){return String(v||'').toUpperCase().replace(/\s+/g,'').trim();}
  function valid(v){return /^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$/.test(normalize(v));}

  function showPrompt(button){
    var shell=document.createElement('div');
    shell.id='wd-license-onboarding-prompt';
    shell.innerHTML='<p class="wd-onboarding-step">PROFESSIONAL VERIFICATION</p><h2>What is your NJ real-estate license number?</h2><p class="wd-onboarding-note">Watchdog verifies professional identity against the New Jersey Division of Consumer Affairs. This does not change your plan or unlock owner/contact data.</p><div class="wd-onboarding-field"><input id="wd-license-onboarding-input" class="wd-onboarding-input" type="text" inputmode="text" maxlength="14" autocomplete="off" placeholder="0562117" value="'+esc(captured)+'"></div><p class="wd-onboarding-note"><a href="https://www.njconsumeraffairs.gov/Pages/verification.aspx" target="_blank" rel="noopener noreferrer">Official NJ DCA license verification</a></p><div id="wd-license-onboarding-error" class="wd-onboarding-error"></div><div class="wd-onboarding-actions"><button type="button" class="wd-onboarding-back" id="wd-license-onboarding-back">Back</button><button type="button" class="wd-onboarding-next" id="wd-license-onboarding-continue" disabled>Continue</button></div>';
    var prior=Array.from(root.childNodes);
    root.innerHTML='';
    root.appendChild(shell);
    var input=document.getElementById('wd-license-onboarding-input');
    var next=document.getElementById('wd-license-onboarding-continue');
    function sync(){input.value=normalize(input.value).slice(0,14);next.disabled=!valid(input.value);}
    input.addEventListener('input',sync);sync();input.focus();
    document.getElementById('wd-license-onboarding-back').addEventListener('click',function(){root.innerHTML='';prior.forEach(function(n){root.appendChild(n);});});
    next.addEventListener('click',function(){
      captured=normalize(input.value);
      if(!valid(captured)){document.getElementById('wd-license-onboarding-error').textContent='Enter a valid NJ real-estate license number.';return;}
      root.innerHTML='';prior.forEach(function(n){root.appendChild(n);});
      bypass=true;
      button.click();
      bypass=false;
    });
  }

  root.addEventListener('click',function(event){
    var button=event.target&&event.target.closest&&event.target.closest('[data-choice="real_estate"]');
    if(!button||bypass)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    showPrompt(button);
  },true);

  var observer=new MutationObserver(async function(){
    if(submitted||!captured)return;
    if(!document.body.classList.contains('wd-plan-view'))return;
    submitted=true;
    try{
      var result=await db.rpc('submit_my_professional_license_v1',{p_license_number:captured});
      if(result.error)throw result.error;
    }catch(error){
      submitted=false;
      console.warn('[Watchdog] professional verification submission deferred to Account:',error&&error.message||error);
    }
  });
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();

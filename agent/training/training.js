(function(){
  'use strict';
  var MODULES=['welcome','property_intelligence','agent_workspace','property_pulse','contacts_crm','transactions','pro_plus','roadmap'];
  var client=null,user=null,state=null,current='welcome',completed=[];
  var nav=document.getElementById('tr-nav'),bar=document.getElementById('tr-progress-bar'),progressTitle=document.getElementById('tr-progress-title'),progressCopy=document.getElementById('tr-progress-copy'),resume=document.getElementById('tr-resume'),account=document.getElementById('tr-account'),requirement=document.getElementById('tr-requirement'),status=document.getElementById('tr-status'),ack=document.getElementById('tr-ack'),completeBtn=document.getElementById('tr-complete'),shotDialog=document.getElementById('tr-shot-dialog'),shotImg=document.getElementById('tr-shot-dialog-img'),shotTitle=document.getElementById('tr-shot-dialog-title'),shotCaption=document.getElementById('tr-shot-dialog-caption');

  function sb(){ if(client)return client; if(!window.NJPTRSupabaseRuntime) return null; try{client=window.NJPTRSupabaseRuntime.createClient();return client}catch(_e){return null} }
  function escPlan(v){v=String(v||'standard');return v==='pro_plus'?'Pro+':v.charAt(0).toUpperCase()+v.slice(1)}
  function setStatus(msg,type){if(!status)return;status.textContent=msg||'';status.className='tr-status'+(type?' '+type:'')}
  function returnTarget(){
    var value=new URLSearchParams(location.search).get('return')||'/agent-desk';
    try{var url=new URL(value,location.origin);if(url.origin!==location.origin)return '/agent-desk';if(/^\/agent\/training\/?/.test(url.pathname))return '/agent-desk';return url.pathname+url.search+url.hash}catch(_e){return '/agent-desk'}
  }
  function show(module,scroll){
    if(MODULES.indexOf(module)<0)module='welcome';current=module;
    document.querySelectorAll('.tr-lesson').forEach(function(el){el.hidden=el.getAttribute('data-module')!==module;el.classList.toggle('active',!el.hidden)});
    document.querySelectorAll('[data-module-target]').forEach(function(btn){btn.classList.toggle('active',btn.getAttribute('data-module-target')===module)});
    if(scroll!==false)window.scrollTo({top:Math.max(0,document.querySelector('.tr-layout').offsetTop-82),behavior:'smooth'});
  }
  function nextOf(module){var i=MODULES.indexOf(module);return MODULES[Math.min(MODULES.length-1,i+1)]}
  function paint(){
    completed=Array.isArray(completed)?completed:[];
    document.querySelectorAll('[data-module-target]').forEach(function(btn){btn.classList.toggle('reviewed',completed.indexOf(btn.getAttribute('data-module-target'))>=0)});
    document.querySelectorAll('[data-review]').forEach(function(btn){var done=completed.indexOf(btn.getAttribute('data-review'))>=0;btn.classList.toggle('reviewed',done);if(done)btn.innerHTML='Reviewed <i class="fa-solid fa-check"></i>'});
    var count=MODULES.filter(function(m){return completed.indexOf(m)>=0}).length,pct=Math.round(count/MODULES.length*100);
    bar.style.width=pct+'%';
    if(user){
      progressTitle.textContent=count===MODULES.length?'All lessons reviewed':count+' of '+MODULES.length+' lessons reviewed';
      progressCopy.textContent=state&&state.required&&!state.completed?'Training is required before this trial can enter the rest of Watchdog.':state&&state.completed?'Training complete. You can revisit any lesson at any time.':'Progress is saved to your Watchdog account.';
      resume.innerHTML=(state&&state.completed?'Review training':'Resume training')+' <i class="fa-solid fa-arrow-right"></i>';
    }
    completeBtn.disabled=!(user&&count===MODULES.length&&ack.checked);
  }
  async function refresh(){
    var c=sb();if(!c){paint();return}
    var session=await c.auth.getSession();user=session&&session.data&&session.data.session&&session.data.session.user||null;
    if(!user){account.textContent='Demo preview';requirement.innerHTML='<i class="fa-solid fa-circle-play"></i> Watchdog Agent Academy';paint();return}
    account.textContent=user.email||'Signed in';
    var res=await c.rpc('get_my_agent_training_state');
    if(res.error){console.warn('[Watchdog training]',res.error.message||res.error);paint();return}
    state=Array.isArray(res.data)?res.data[0]:res.data;
    completed=state&&Array.isArray(state.completed_modules)?state.completed_modules:[];
    if(state&&state.required&&!state.completed)requirement.innerHTML='<i class="fa-solid fa-lock"></i> Required for your '+escPlan(state.plan_tier)+' trial';
    else if(state&&state.completed)requirement.innerHTML='<i class="fa-solid fa-circle-check"></i> Training complete · revisit anytime';
    else requirement.innerHTML='<i class="fa-solid fa-graduation-cap"></i> Professional Training Center';
    paint();
  }
  async function review(module){
    if(completed.indexOf(module)<0&&user){
      var c=sb();if(!c)return;
      setStatus('');
      var res=await c.rpc('update_my_agent_training_progress',{p_module:module,p_reviewed:true});
      if(res.error){setStatus(res.error.message||'Could not save training progress.','error');return}
      var row=Array.isArray(res.data)?res.data[0]:res.data;
      completed=row&&Array.isArray(row.completed_modules)?row.completed_modules:completed;
    }else if(completed.indexOf(module)<0&&!user){
      completed.push(module);
    }
    paint();show(nextOf(module));
  }
  async function finish(){
    if(!user){var c=sb();if(c&&window.WatchdogAuth)window.WatchdogAuth.openSignIn('/agent/training/?return='+encodeURIComponent(returnTarget()));else location.href='/onboarding/?next='+encodeURIComponent(location.pathname+location.search);return}
    if(!ack.checked)return;
    completeBtn.disabled=true;setStatus('Saving training completion…');
    try{
      var res=await sb().rpc('complete_my_agent_training',{p_acknowledged:true});
      if(res.error)throw res.error;
      if(!state)state={};state.completed=true;setStatus('Training complete. Opening Watchdog…','success');
      setTimeout(function(){location.assign(returnTarget())},350);
    }catch(e){setStatus(e&&e.message||'Could not complete training.','error');completeBtn.disabled=false}
  }

  function openShot(button){
    if(!button||!shotDialog||!shotImg)return;
    var img=button.querySelector('img'),src=button.getAttribute('data-training-shot')||(img&&img.getAttribute('src'))||'';
    if(!src)return;
    shotImg.src=src;
    shotImg.alt=img&&img.alt||'Expanded Watchdog training visual';
    if(shotTitle)shotTitle.textContent=button.getAttribute('data-training-shot-label')||'Watchdog training visual';
    if(shotCaption){
      var figure=button.closest('figure'),caption=figure&&figure.querySelector('figcaption');
      shotCaption.textContent=caption?caption.textContent:'';
    }
    if(typeof shotDialog.showModal==='function')shotDialog.showModal();
  }
  function closeShot(){if(shotDialog&&shotDialog.open)shotDialog.close()}

  nav.addEventListener('click',function(e){var b=e.target.closest('[data-module-target]');if(b)show(b.getAttribute('data-module-target'))});
  document.addEventListener('click',function(e){var shot=e.target.closest('[data-training-shot]');if(shot){openShot(shot);return}if(e.target.closest('[data-shot-close]')){closeShot();return}var r=e.target.closest('[data-review]');if(r){review(r.getAttribute('data-review'));return}var p=e.target.closest('[data-prev]');if(p)show(p.getAttribute('data-prev'))});
  resume.addEventListener('click',function(){var first=MODULES.find(function(m){return completed.indexOf(m)<0})||'welcome';show(first)});
  if(shotDialog)shotDialog.addEventListener('click',function(e){if(e.target===shotDialog)closeShot()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeShot()});
  ack.addEventListener('change',paint);completeBtn.addEventListener('click',finish);
  show('welcome',false);refresh().catch(function(e){console.warn('[Watchdog training]',e&&e.message||e);paint()});
})();
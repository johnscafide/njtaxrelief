/* Agent Desk: create or turn off the agent's browser extension key. The key
   is shown once; the server stores only its hash. */
(function(){
  'use strict';
  var root=document.getElementById('ad-extension');
  if(!root)return;
  var msg=root.querySelector('[data-ext-msg]');
  var box=root.querySelector('[data-ext-key]');
  var input=root.querySelector('#ad-ext-key-value');
  function say(key){msg.textContent=root.getAttribute('data-msg-'+key)||'';}
  function client(){return window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;}
  function call(action){
    var db=client();
    if(!db){say('signin');return Promise.resolve(null);}
    return db.auth.getSession().then(function(r){
      var token=r&&r.data&&r.data.session&&r.data.session.access_token;
      if(!token){say('signin');return null;}
      return fetch('/api/watchdog-extension',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:action})})
        .then(function(res){return res.json().catch(function(){return{};}).then(function(j){return{status:res.status,body:j};});});
    }).catch(function(){say('error');return null;});
  }
  root.querySelector('[data-ext-create]').addEventListener('click',function(e){
    var b=e.currentTarget;b.disabled=true;msg.textContent='';
    call('create_key').then(function(r){
      b.disabled=false;if(!r)return;
      if(r.status===200&&r.body.key){input.value=r.body.key;box.hidden=false;say('created');input.focus();input.select();return;}
      box.hidden=true;say(r.status===403?'plan':'error');
    });
  });
  root.querySelector('[data-ext-revoke]').addEventListener('click',function(e){
    var b=e.currentTarget;b.disabled=true;msg.textContent='';
    call('revoke').then(function(r){b.disabled=false;if(!r)return;input.value='';box.hidden=true;say(r.status===200?'revoked':'error');});
  });
  root.querySelector('[data-ext-copy]').addEventListener('click',function(){
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(input.value).then(function(){say('copied');},function(){input.select();});
    else input.select();
  });
})();

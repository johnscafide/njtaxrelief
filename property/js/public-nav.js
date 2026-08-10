(function(){
  'use strict';
  var user=null, lastFocus=null;
  function q(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function recent(){try{return JSON.parse(localStorage.getItem('watchdogRecentProperties')||'[]').slice(0,4);}catch(e){return[];}}
  function setRecent(r){
    if(!r||!r.address)return;
    var rows=recent().filter(function(x){return x.pin!==r.pin&&x.address!==r.address;});
    rows.unshift({address:r.address,town:r.town||'',pin:r.pin||'',at:new Date().toISOString()});
    try{localStorage.setItem('watchdogRecentProperties',JSON.stringify(rows.slice(0,8)));}catch(e){}
    renderProfile();
  }
  function displayName(){var m=user&&user.user_metadata||{};return m.full_name||m.name||(user&&user.email||'').split('@')[0]||'Your account';}
  function avatar(){var m=user&&user.user_metadata||{};return m.avatar_url||m.picture||'';}
  function renderTrigger(){var b=q('wd-profile-trigger');if(!b)return;var a=avatar();b.innerHTML=a?'<img src="'+esc(a)+'" alt="">':'<i class="fas fa-user"></i><span>'+(user?'Account':'Sign in')+'</span>';b.setAttribute('aria-label',user?'Open account menu':'Sign in or open account menu');}
  function renderProfile(){
    var host=q('wd-profile-content');if(!host)return;
    var rs=recent();
    var recentHtml=rs.length?rs.map(function(x){return '<a class="wd-public-link" href="/property/?address='+encodeURIComponent(x.address)+'"><i class="fas fa-clock-rotate-left"></i><span>'+esc(x.address)+'<small>'+esc(x.town||'New Jersey')+'</small></span><i class="fas fa-chevron-right"></i></a>';}).join(''):'<div class="wd-public-recent-empty">Properties you open will appear here on this device.</div>';
    if(!user){host.innerHTML='<button class="wd-public-signin" type="button" onclick="WatchdogPublicNav.signIn()"><i class="fab fa-google"></i> Sign in to Watchdog</button><div class="wd-public-section"><span class="wd-public-label">Recently viewed</span><div class="wd-public-recent">'+recentHtml+'</div></div><div class="wd-public-section"><a class="wd-public-link" href="/property/account.html"><i class="fas fa-circle-user"></i><span>Account details</span><i class="fas fa-chevron-right"></i></a></div>';return;}
    var a=avatar();
    host.innerHTML='<div class="wd-public-account">'+(a?'<img src="'+esc(a)+'" alt="">':'<div class="avatar">'+esc(displayName().charAt(0).toUpperCase())+'</div>')+'<div><b>'+esc(displayName())+'</b><span>'+esc(user.email||'')+'</span></div></div>'+
      '<div class="wd-public-section"><a class="wd-public-link" href="/property/dashboard.html"><i class="fas fa-house"></i><span>Your home &amp; properties</span><i class="fas fa-chevron-right"></i></a><a class="wd-public-link" href="/property/dashboard.html#profile"><i class="fas fa-user-gear"></i><span>Profile &amp; benefits</span><i class="fas fa-chevron-right"></i></a><a class="wd-public-link" href="/property/account.html"><i class="fas fa-credit-card"></i><span>Account &amp; billing</span><i class="fas fa-chevron-right"></i></a></div>'+
      '<div class="wd-public-section"><span class="wd-public-label">Recently viewed</span><div class="wd-public-recent">'+recentHtml+'</div></div><div class="wd-public-section"><button class="wd-public-link" style="border:0;background:transparent;width:100%;cursor:pointer" type="button" onclick="WatchdogPublicNav.signOut()"><i class="fas fa-arrow-right-from-bracket"></i><span>Sign out</span></button></div>';
  }
  function open(which){close();lastFocus=document.activeElement;var sheet=q(which==='profile'?'wd-profile-sheet':'wd-main-sheet'),back=q('wd-public-backdrop');if(!sheet||!back)return;sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');back.classList.add('open');document.body.classList.add('wd-public-menu-open');var c=sheet.querySelector('.wd-public-close');if(c)c.focus();}
  function close(){['wd-main-sheet','wd-profile-sheet'].forEach(function(id){var e=q(id);if(e){e.classList.remove('open');e.setAttribute('aria-hidden','true');}});var b=q('wd-public-backdrop');if(b)b.classList.remove('open');document.body.classList.remove('wd-public-menu-open');if(lastFocus&&lastFocus.focus)lastFocus.focus();lastFocus=null;}
  function signIn(){close();if(typeof window.plSignInPrompt==='function')window.plSignInPrompt();}
  function signOut(){close();if(typeof window.plSignOut==='function')window.plSignOut();}
  function setUser(u){user=u||null;renderTrigger();renderProfile();}

  function runAddressFromQuery(){
    var params;
    try{params=new URLSearchParams(window.location.search||'');}catch(e){return;}
    var address=(params.get('address')||'').trim();
    if(!address)return;
    var attempts=0;
    function handoff(){
      attempts+=1;
      var input=q('pl-addr');
      if(input&&typeof window.plLookup==='function'){
        input.value=address;
        window.plLookup();
        try{
          var clean=new URL(window.location.href);
          clean.searchParams.delete('address');
          window.history.replaceState({},document.title,clean.pathname+clean.search+clean.hash);
        }catch(e){}
        return;
      }
      if(attempts<80)window.setTimeout(handoff,100);
    }
    handoff();
  }

  function init(){renderTrigger();renderProfile();document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});runAddressFromQuery();}
  window.WatchdogPublicNav={open:open,close:close,setUser:setUser,remember:setRecent,signIn:signIn,signOut:signOut};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
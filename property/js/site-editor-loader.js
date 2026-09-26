/* Watchdog site editor loader.
   Runs on every Watchdog page. Signed-out visitors cost nothing: no request is
   made unless a Supabase session exists. Signed-in users are checked once per
   browser session against the server-side developer role, and only confirmed
   developers download the editor itself (property/js/site-editor.js). */
(function(){
  'use strict';
  if(window.__WD_SITE_EDITOR_LOADER__) return;
  window.__WD_SITE_EDITOR_LOADER__ = true;
  if(window.top !== window) return;

  var VERSION = '20260926a';
  var AUTH_KEY = 'sb-uvkvaxljhhngydvlrzom-auth-token';
  var CACHE_KEY = 'wd-site-editor:access';
  var NEGATIVE_TTL = 10 * 60 * 1000;

  function session(){
    try{
      var raw = localStorage.getItem(AUTH_KEY);
      if(!raw) return null;
      var parsed = JSON.parse(raw);
      var s = parsed && (parsed.currentSession || parsed);
      if(!s || !s.access_token) return null;
      return { token:s.access_token, uid:String(s.user && s.user.id || ''), expired:Number(s.expires_at || 0) * 1000 < Date.now() + 5000 };
    }catch(_){ return null; }
  }
  function readCache(uid){
    try{
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if(!c || c.uid !== uid) return null;
      if(!c.ok && Date.now() - c.at > NEGATIVE_TTL) return null;
      return c;
    }catch(_){ return null; }
  }
  function writeCache(uid, ok){
    try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({ uid:uid, ok:!!ok, at:Date.now() })); }catch(_){}
  }
  function load(){
    if(document.querySelector('script[data-wd-site-editor]')) return;
    var script = document.createElement('script');
    script.src = '/property/js/site-editor.js?v=' + VERSION;
    script.defer = true;
    script.setAttribute('data-wd-site-editor', '1');
    document.head.appendChild(script);
  }
  var retried = false;
  function start(){
    var s = session();
    if(!s) return;
    var cached = readCache(s.uid);
    if(cached){ if(cached.ok) load(); return; }
    /* Give the page's Supabase client a moment to refresh an expired token. */
    if(s.expired){ if(!retried){ retried = true; setTimeout(start, 4000); } return; }
    fetch('/api/site-editor', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + s.token },
      body:JSON.stringify({ action:'session' }),
      credentials:'same-origin',
      cache:'no-store'
    }).then(function(r){
        if(r.status === 401) return undefined;
        return r.ok ? r.json() : null;
      })
      .then(function(data){
        if(data === undefined) return;
        var ok = !!(data && data.developer);
        writeCache(s.uid, ok);
        if(ok) load();
      })
      .catch(function(){});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();

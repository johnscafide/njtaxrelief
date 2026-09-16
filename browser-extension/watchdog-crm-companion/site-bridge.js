(()=>{
  'use strict';
  if(!/(^|\.)watchdogindex\.com$/i.test(location.hostname))return;
  if(!/^\/agent\/contacts(?:\/|$)/i.test(location.pathname))return;
  const version=chrome.runtime.getManifest().version||'';
  document.documentElement.setAttribute('data-watchdog-crm-companion-version',version);
  let meta=document.querySelector('meta[name="watchdog-crm-companion"]');
  if(!meta){meta=document.createElement('meta');meta.name='watchdog-crm-companion';document.documentElement.appendChild(meta);}
  meta.content=version;
})();

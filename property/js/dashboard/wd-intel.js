/* Watchdog Intelligence right-side pull-in. */
(function(w,d){
'use strict';
var built=false,lastFocus=null;
function build(){
  var host=d.getElementById('wdd-drawer');if(!host||built)return host;
  host.innerHTML='<button class="wdd-drawer-scrim" type="button" data-close aria-label="Close Watchdog Intelligence"></button><aside class="wdd-drawer-panel" role="dialog" aria-modal="true" aria-label="Watchdog Intelligence"><div class="wdd-drawer-head"><div><span>Watchdog Intelligence</span><b>Ask about your properties</b></div><div class="wdd-fill"></div><a href="/property/intelligence" target="_blank" rel="noopener" aria-label="Open the full page"><i class="fas fa-up-right-from-square" aria-hidden="true"></i></a><button type="button" data-close aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button></div><iframe title="Watchdog Intelligence" src="/property/intelligence/?embed=1" loading="lazy"></iframe></aside>';
  host.addEventListener('click',function(ev){if(ev.target.closest('[data-close]'))close();});built=true;return host;
}
function open(){var host=build();if(!host)return;lastFocus=d.activeElement;host.hidden=false;d.body.style.overflow='hidden';var btn=host.querySelector('.wdd-drawer-head button[data-close]');if(btn)btn.focus();}
function close(){var host=d.getElementById('wdd-drawer');if(!host||host.hidden)return;host.hidden=true;d.body.style.overflow='';if(lastFocus&&lastFocus.focus)lastFocus.focus();}
d.addEventListener('click',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#wdd-pull'))open();});
d.addEventListener('wd:open-intelligence',open);d.addEventListener('keydown',function(ev){if(ev.key==='Escape')close();});
w.WatchdogIntelligenceDrawer={open:open,close:close};
})(window,document);

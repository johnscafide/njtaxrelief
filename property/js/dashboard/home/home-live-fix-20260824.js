/* Property Home physical-device follow-up · 2026-08-24
   Narrow, non-blocking fixes for mobile header/spacing, selected-property weather,
   and human-ad attribution. No score, entitlement, or property-data logic changes. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_LIVE_FIX_20260824__)return;
window.__WATCHDOG_HOME_LIVE_FIX_20260824__=true;

var SUPABASE_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var SUPABASE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
var cssHref='/property/css/home/home-mobile-live-fix-20260824.css?v=20260824c';
var weatherToken=0,weatherCache={};

function q(s,r){return (r||document).querySelector(s)}
function ensureCss(){
 if(document.querySelector('link[data-watchdog-home-live-fix]'))return;
 var l=document.createElement('link');l.rel='stylesheet';l.href=cssHref;l.media='(max-width: 820px)';l.setAttribute('data-watchdog-home-live-fix','1');document.head.appendChild(l);
}
function weatherIcon(text){
 var t=String(text||'').toLowerCase();
 if(t.indexOf('thunder')>=0)return'fa-cloud-bolt';
 if(t.indexOf('snow')>=0)return'fa-snowflake';
 if(t.indexOf('rain')>=0||t.indexOf('shower')>=0)return'fa-cloud-rain';
 if(t.indexOf('cloud')>=0)return'fa-cloud-sun';
 if(t.indexOf('clear')>=0||t.indexOf('sun')>=0)return'fa-sun';
 return'fa-cloud-sun';
}
function weatherNode(){
 var top=q('.hm27-top-right');if(!top)return null;
 var node=q('.hm27-weather',top);
 if(node)return node;
 node=document.createElement('div');node.className='hm27-weather';node.setAttribute('aria-label','Weather near selected property');node.innerHTML='<i class="fas fa-sun" aria-hidden="true"></i><span><strong>Weather</strong><small>Selected property</small></span>';
 var notify=q('#hm27-notify',top);top.insertBefore(node,notify||top.firstChild);return node;
}
function paintWeather(temp,unit,summary){
 var node=weatherNode();if(!node)return;
 var icon=q('i',node),strong=q('strong',node),small=q('small',node);
 if(icon)icon.className='fas '+weatherIcon(summary);
 if(strong)strong.textContent=(temp==null?'Weather':Math.round(Number(temp))+'°'+(unit||'F'));
 if(small)small.textContent=summary||'Selected property';
}
function client(){
 try{
  if(!window.supabase||!window.supabase.createClient)return null;
  return window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
 }catch(_e){return null;}
}
function forecastFor(lat,lon){
 var key=Number(lat).toFixed(3)+','+Number(lon).toFixed(3),cached=weatherCache[key];
 if(cached&&Date.now()-cached.at<10*60*1000)return Promise.resolve(cached.value);
 return fetch('/api/watchdog-weather?lat='+encodeURIComponent(Number(lat).toFixed(4))+'&lon='+encodeURIComponent(Number(lon).toFixed(4)),{headers:{Accept:'application/json'}})
  .then(function(r){if(!r.ok)throw new Error('weather '+r.status);return r.json()})
  .then(function(v){if(v&&v.error)throw new Error(v.error);weatherCache[key]={at:Date.now(),value:v};return v;});
}
function refreshWeather(){
 var sw=q('#hm-switch'),pin=sw&&sw.value;if(!pin){paintWeather(null,'F','Selected property');return;}
 var token=++weatherToken,c=client();if(!c)return;
 c.auth.getSession().then(function(x){
  if(token!==weatherToken||!x.data||!x.data.session)return null;
  return c.from('saved_properties').select('lat,lon,address,town,city,zip').eq('pams_pin',pin).maybeSingle();
 }).then(function(x){
  if(token!==weatherToken||!x||x.error||!x.data||!Number.isFinite(Number(x.data.lat))||!Number.isFinite(Number(x.data.lon)))return null;
  return forecastFor(x.data.lat,x.data.lon);
 }).then(function(w){if(token===weatherToken&&w)paintWeather(w.temperature,w.temperatureUnit,w.shortForecast)}).catch(function(){/* weather is supplemental; never block Property Home */});
}

function fixJohnAd(root){
 root=root||document;
 var banner=q('.hm-footer-ad .gt-banner',root)||q('.hm-footer-ad .gt-banner');if(!banner)return;
 var img=q('.gt-photo img',banner),href=String(banner.getAttribute('href')||''),isJohn=(img&&/johnprofile/i.test(img.getAttribute('src')||''))||/john_(?:buyer|seller)|home-value|search-homes/i.test(href);
 if(!isJohn)return;
 var eyebrow=q('.gt-eyebrow',banner),disc=q('.gt-disc',banner);
 if(eyebrow&&!/^John Scafide\b/i.test(eyebrow.textContent||''))eyebrow.textContent='John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate';
 if(disc&&(!/^Advertisement\. John Scafide\b/i.test(disc.textContent||'')||/Watchdog is a licensed New Jersey real estate agent/i.test(disc.textContent||'')))disc.textContent='Advertisement. John Scafide is a licensed New Jersey real estate agent, NJ License #2079591, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
}
function watchAd(){
 var footer=q('.hm-footer-ad');if(!footer){setTimeout(watchAd,600);return;}
 fixJohnAd();
 if('MutationObserver'in window)new MutationObserver(function(){fixJohnAd()}).observe(footer,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','href']});
}
function wireSwitch(){
 var sw=q('#hm-switch');if(!sw)return;
 if(sw.dataset.wdWeatherWired==='1')return;
 sw.dataset.wdWeatherWired='1';sw.addEventListener('change',function(){setTimeout(refreshWeather,0)});refreshWeather();
}
function boot(){
 ensureCss();weatherNode();wireSwitch();watchAd();
 var attempts=0,t=setInterval(function(){attempts++;weatherNode();wireSwitch();fixJohnAd();if(attempts>20)clearInterval(t)},350);
}
ensureCss();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

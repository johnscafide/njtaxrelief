/* Watchdog Property Home 2027 chrome.
   Dashboard-matched navigation, notifications, profile controls and live property weather.
   The property intelligence engine remains in /property/js/dashboard/home/index.js. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_2027__) return;
window.__WATCHDOG_HOME_2027__=true;

var URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
if(!window.supabase) return;
var db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
var user=null,profile={},property=null,events=[],weatherToken=0,weatherTimer=null;
var READ_KEY='watchdogHomeNotificationsReadAtV2';

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function valid(v){if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;}
function isNj(lat,lon){return lat>=38.8&&lat<=41.4&&lon>=-75.8&&lon<=-73.7;}
function pretty(v){return String(v||'Property update').replace(/[._-]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function when(v){var d=new Date(v);if(!Number.isFinite(d.getTime()))return'';return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function getReadAt(){try{return localStorage.getItem(READ_KEY)||'';}catch(_){return'';}}
function setReadAt(){try{localStorage.setItem(READ_KEY,new Date().toISOString());}catch(_){}paintNotifications();}

function paintDate(){var d=new Date(),date=document.getElementById('hm27-date-label'),day=document.getElementById('hm27-day-label');if(date)date.textContent=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});if(day)day.textContent=d.toLocaleDateString('en-US',{weekday:'long'});}
function firstName(){var m=user&&user.user_metadata||{};var n=profile.display_name||profile.full_name||m.full_name||m.name||(user&&user.email||'').split('@')[0]||'there';return String(n).split(/\s+/)[0];}
function avatarUrl(){var m=user&&user.user_metadata||{};return profile.avatar_url||m.avatar_url||m.picture||'';}
function paintAvatar(){var host=document.getElementById('hm27-avatar');if(!host)return;var url=avatarUrl();host.innerHTML=url?'<img src="'+esc(url)+'" alt="">':'<span class="hm27-avatar-fallback">'+esc(firstName().charAt(0).toUpperCase())+'</span>';}
function planLabel(){var p=String(profile.plan_tier||profile.plan||'standard').toLowerCase().replace('_plus','+');if(profile.account_role==='developer')return'Developer';return p==='standard'?'Standard':p.replace(/\b\w/g,function(c){return c.toUpperCase();});}

function nav(){return document.getElementById('hm27-nav');}
function navOpen(open){var n=nav();if(!n)return;n.classList.toggle('open',!!open);n.setAttribute('aria-hidden',open?'false':'true');document.body.classList.toggle('hm-nav-open',!!open);}
window.hmToggleSidebar=function(){var n=nav();navOpen(!(n&&n.classList.contains('open')));};

function ensurePopovers(){
  if(!document.getElementById('hm27-profile-pop')){var p=document.createElement('aside');p.id='hm27-profile-pop';p.className='hm27-pop';document.body.appendChild(p);}
  if(!document.getElementById('hm27-notice-pop')){var n=document.createElement('aside');n.id='hm27-notice-pop';n.className='hm27-pop hm27-notice-pop';document.body.appendChild(n);}
}
function paintProfile(){ensurePopovers();var p=document.getElementById('hm27-profile-pop');if(!p||!user)return;p.innerHTML='<header><span><b>'+esc(profile.display_name||profile.full_name||firstName())+'</b><small>'+esc(user.email||'')+'</small></span><small>'+esc(planLabel())+'</small></header><nav>'+
'<a href="/property/account"><i class="fas fa-user-pen"></i><span><b>Edit profile & role</b><small>Profile, profession and preferences</small></span></a>'+
'<button class="hm27-menu-row" type="button" data-hm27="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share Watchdog with someone</small></span></button>'+
'<a href="/property/account"><i class="fas fa-credit-card"></i><span><b>Account & billing</b><small>Plan, subscription and billing</small></span></a>'+
'<a href="/property/home"><i class="fas fa-house"></i><span><b>Property Home</b><small>Single-property intelligence</small></span></a>'+
'</nav><button class="hm27-pop-signout" type="button" data-hm27="signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>';}
function unreadCount(){var read=getReadAt()?new Date(getReadAt()).getTime():0;return events.filter(function(x){return(new Date(x.occurred_at).getTime()||0)>read;}).length;}
function iconFor(e){var t=String(e.event_type||e.marker_id||'').toLowerCase(),s=String(e.severity||'').toLowerCase();if(/high|critical/.test(s))return'fa-triangle-exclamation';if(/tax|assessment/.test(t))return'fa-receipt';if(/market|value/.test(t))return'fa-chart-line';if(/permit/.test(t))return'fa-hammer';return'fa-house';}
function paintNotifications(){
  ensurePopovers();var p=document.getElementById('hm27-notice-pop');if(!p)return;
  var read=getReadAt()?new Date(getReadAt()).getTime():0,u=unreadCount();
  p.innerHTML='<header><span><b>Notifications</b><small>'+(u?u+' unread':'You’re caught up')+'</small></span><button class="hm27-read" type="button" data-hm27="read-all">Read all</button></header>'+
  '<div class="hm27-notice-list">'+(events.length?events.slice(0,24).map(function(e){var unread=(new Date(e.occurred_at).getTime()||0)>read;return'<a class="hm27-notice '+(unread?'unread':'')+'" href="/property/pulse"><i class="fas '+iconFor(e)+'"></i><span><b>'+esc(e.title||pretty(e.event_type||e.marker_id))+'</b><small>'+esc(property&&property.address||'Current property')+'</small><em>'+esc(when(e.occurred_at))+'</em></span>'+(unread?'<u></u>':'')+'</a>';}).join(''):'<div class="hm27-notice-empty"><i class="far fa-bell-slash"></i><b>No notifications yet</b><small>Watchdog property changes will appear here.</small></div>')+'</div>'+
  '<a class="hm27-notice-foot" href="/property/pulse">Open Change Intelligence <i class="fas fa-arrow-right"></i></a>';
  var badge=document.getElementById('hm27-notify-badge');if(badge){badge.textContent=Math.min(99,u);badge.hidden=!u;}
}
function togglePop(id){ensurePopovers();['hm27-profile-pop','hm27-notice-pop'].forEach(function(x){var p=document.getElementById(x);if(p)p.classList.toggle('open',x===id?!p.classList.contains('open'):false);});}
function closePops(){document.querySelectorAll('.hm27-pop.open').forEach(function(p){p.classList.remove('open');});}

function resolvePin(){var u=new URL(location.href),p=u.searchParams.get('pin');if(p)return p;var s=document.getElementById('hm-switch');return s&&s.value?s.value:'';}
function querySavedProperty(pin){
  var q=db.from('saved_properties').select('id,user_id,pams_pin,kind,address,town,county,zip,lat,lon').order('created_at',{ascending:false});
  if(user&&user.id)q=q.eq('user_id',user.id);if(pin)q=q.eq('pams_pin',pin);return q.limit(1).maybeSingle();
}
function loadCurrentProperty(){
  var pin=resolvePin();return querySavedProperty(pin).then(function(r){
    if(r&&r.error&&user&&user.id){var q=db.from('saved_properties').select('id,pams_pin,kind,address,town,county,zip,lat,lon').order('created_at',{ascending:false});if(pin)q=q.eq('pams_pin',pin);return q.limit(1).maybeSingle();}
    return r;
  }).then(function(r){property=r&&r.data||null;if(!property)return;var lat=valid(property.lat),lon=valid(property.lon);if(lat!=null&&lon!=null&&isNj(lat,lon))return;return db.from('property_lookups').select('lat,lon').eq('pams_pin',property.pams_pin).maybeSingle().then(function(x){var row=x&&x.data||{},a=valid(row.lat),b=valid(row.lon);if(a!=null&&b!=null&&isNj(a,b)){property.lat=a;property.lon=b;}});});
}
function loadEvents(){
  if(!property||!property.pams_pin){events=[];paintNotifications();return Promise.resolve();}
  return db.from('property_update_events').select('pams_pin,event_type,severity,title,occurred_at,marker_id').eq('pams_pin',property.pams_pin).order('occurred_at',{ascending:false}).limit(80).then(function(r){events=r&&Array.isArray(r.data)?r.data:[];paintNotifications();}).catch(function(){events=[];paintNotifications();});
}

function weatherCode(code){
  code=Number(code);if(code===0)return{label:'Clear',icon:'fa-sun'};if(code===1)return{label:'Mostly clear',icon:'fa-sun'};if(code===2)return{label:'Partly cloudy',icon:'fa-cloud-sun'};if(code===3)return{label:'Cloudy',icon:'fa-cloud'};if(code===45||code===48)return{label:'Fog',icon:'fa-smog'};if(code>=51&&code<=67)return{label:'Rain',icon:'fa-cloud-rain'};if(code>=71&&code<=77)return{label:'Snow',icon:'fa-snowflake'};if(code>=80&&code<=82)return{label:'Showers',icon:'fa-cloud-showers-heavy'};if(code>=95)return{label:'Thunderstorms',icon:'fa-cloud-bolt'};return{label:'Local conditions',icon:'fa-cloud-sun'};
}
function setWeather(temp,label,icon){var t=document.getElementById('hm27-weather-temp'),l=document.getElementById('hm27-weather-label'),i=document.getElementById('hm27-weather-icon');if(t)t.textContent=temp!=null?Math.round(temp)+'°F':'Weather';if(l)l.textContent=label||'Local conditions';if(i)i.className='fas '+(icon||'fa-cloud-sun');}
function fetchWithTimeout(url,ms){var ctl=typeof AbortController!=='undefined'?new AbortController():null,t=ctl?setTimeout(function(){ctl.abort();},ms||8000):null;return fetch(url,{signal:ctl?ctl.signal:undefined}).then(function(r){if(t)clearTimeout(t);if(!r.ok)throw new Error(String(r.status));return r.json();},function(e){if(t)clearTimeout(t);throw e;});}
function loadWeather(){
  if(!property)return Promise.resolve();var lat=valid(property.lat),lon=valid(property.lon);if(lat==null||lon==null||!isNj(lat,lon)){setWeather(null,'Local conditions','fa-cloud-sun');return Promise.resolve();}
  var token=++weatherToken;setWeather(null,'Loading conditions','fa-cloud-sun');
  var openMeteo='https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto';
  return fetchWithTimeout(openMeteo,8000).then(function(j){if(token!==weatherToken)return;var c=j&&j.current||{},temp=valid(c.temperature_2m);if(temp==null)throw new Error('no current temperature');var w=weatherCode(c.weather_code);setWeather(temp,w.label,w.icon);}).catch(function(){
    return fetchWithTimeout('https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4),8000).then(function(point){if(token!==weatherToken)return;var u=point&&point.properties&&point.properties.forecastHourly;if(!u)throw new Error('no forecast');return fetchWithTimeout(u,8000);}).then(function(j){if(token!==weatherToken)return;var p=j&&j.properties&&j.properties.periods&&j.properties.periods[0];if(!p)throw new Error('no period');var text=String(p.shortForecast||'Local conditions').toLowerCase(),icon=/thunder/.test(text)?'fa-cloud-bolt':/snow/.test(text)?'fa-snowflake':/rain|shower/.test(text)?'fa-cloud-rain':/cloud/.test(text)?'fa-cloud-sun':'fa-sun';setWeather(valid(p.temperature),p.shortForecast||'Local conditions',icon);}).catch(function(){setWeather(null,'Local conditions','fa-cloud-sun');});
  });
}

function shareInvite(){var code=user?'WD-'+String(user.id).replace(/-/g,'').slice(0,10).toUpperCase():'WATCHDOG',link=location.origin+'/property/?ref='+encodeURIComponent(code);if(navigator.share){navigator.share({title:'Watchdog Property Intelligence',text:'Take a look at Watchdog Property Intelligence.',url:link}).catch(function(){});}else if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){alert('Invite link copied.');});}}
function refreshContext(){return loadCurrentProperty().then(function(){return Promise.all([loadEvents(),loadWeather()]);});}

function bind(){
  var menu=document.getElementById('hm27-menu');if(menu)menu.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();closePops();navOpen(true);});
  var profileBtn=document.getElementById('hm27-profile');if(profileBtn)profileBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();togglePop('hm27-profile-pop');});
  var notify=document.getElementById('hm27-notify');if(notify)notify.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();paintNotifications();togglePop('hm27-notice-pop');});
  document.addEventListener('click',function(ev){
    var action=ev.target.closest&&ev.target.closest('[data-hm27]');if(action){var a=action.dataset.hm27;if(a==='nav-close')navOpen(false);else if(a==='read-all')setReadAt();else if(a==='invite')shareInvite();else if(a==='signout')db.auth.signOut().then(function(){location.href='/property/';});ev.preventDefault();return;}
    if(!ev.target.closest('.hm27-pop')&&!ev.target.closest('#hm27-profile')&&!ev.target.closest('#hm27-notify'))closePops();
  });
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){closePops();navOpen(false);}});
  document.addEventListener('change',function(ev){if(ev.target&&ev.target.id==='hm-switch'){setTimeout(refreshContext,120);}});
}

function boot(){
  paintDate();ensurePopovers();bind();
  db.auth.getSession().then(function(r){var s=r&&r.data&&r.data.session;if(!s||!s.user)return;user=s.user;return db.from('profiles').select('display_name,full_name,avatar_url,plan,plan_tier,account_role').eq('id',user.id).maybeSingle();}).then(function(r){if(r&&r.data)profile=r.data;paintAvatar();paintProfile();return refreshContext();}).catch(function(){paintNotifications();});
  weatherTimer=setInterval(function(){if(!document.hidden)loadWeather();},10*60*1000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

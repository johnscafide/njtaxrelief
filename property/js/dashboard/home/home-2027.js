/* Watchdog Property Home 2027 chrome.
   Uses the Dashboard v2 app shell while leaving the existing property
   intelligence engine and drill-down calculations intact. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_2027__) return;
window.__WATCHDOG_HOME_2027__=true;

var URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
if(!window.supabase) return;
var db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
var user=null,profile={},property=null,events=[],weatherToken=0,weatherTimer=null;
var READ_KEY='watchdogHomeNotificationsReadAt';

function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]});}
function valid(v){if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;}
function isNj(lat,lon){return lat>=38.8&&lat<=41.4&&lon>=-75.8&&lon<=-73.7;}
function pretty(v){return String(v||'Property update').replace(/[._-]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function when(v){var d=new Date(v);if(!Number.isFinite(d.getTime()))return'';return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function getReadAt(){try{return localStorage.getItem(READ_KEY)||'';}catch(_){return'';}}
function setReadAt(){try{localStorage.setItem(READ_KEY,new Date().toISOString());}catch(_){}paintNotifications(true);}

function paintDate(){var d=new Date(),date=document.getElementById('hm27-date-label'),day=document.getElementById('hm27-day-label');if(date)date.textContent=d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});if(day)day.textContent=d.toLocaleDateString('en-US',{weekday:'long'});}
function firstName(){var m=user&&user.user_metadata||{};var n=profile.display_name||profile.full_name||m.full_name||m.name||(user&&user.email||'').split('@')[0]||'there';return String(n).split(/\s+/)[0];}
function avatarUrl(){var m=user&&user.user_metadata||{};return profile.avatar_url||m.avatar_url||m.picture||'';}
function paintAvatar(){var host=document.getElementById('hm27-avatar');if(!host)return;var url=avatarUrl();host.innerHTML=url?'<img src="'+esc(url)+'" alt="">':'<span class="hm27-avatar-fallback">'+esc(firstName().charAt(0).toUpperCase())+'</span>';}
function planLabel(){var p=String(profile.plan_tier||profile.plan||'standard').toLowerCase().replace('_plus','+');if(profile.account_role==='developer')return'Developer';return p==='standard'?'Standard':p.replace(/\b\w/g,function(c){return c.toUpperCase();});}

function navIsOpen(){var n=document.getElementById('hm27-nav');return!!(n&&n.classList.contains('open'));}
function toggleNav(open){var n=document.getElementById('hm27-nav');if(!n)return;n.classList.toggle('open',!!open);n.setAttribute('aria-hidden',open?'false':'true');document.body.classList.toggle('hm-nav-open',!!open);}
window.hmToggleSidebar=function(){toggleNav(!navIsOpen());};

function ensurePopovers(){if(!document.getElementById('hm27-profile-pop')){var p=document.createElement('aside');p.id='hm27-profile-pop';p.className='hm27-pop';document.body.appendChild(p);}if(!document.getElementById('hm27-notice-pop')){var n=document.createElement('aside');n.id='hm27-notice-pop';n.className='hm27-pop';document.body.appendChild(n);}}
function paintProfile(){ensurePopovers();var p=document.getElementById('hm27-profile-pop');if(!p||!user)return;p.innerHTML='<header><span><b>'+esc(profile.display_name||profile.full_name||firstName())+'</b><small>'+esc(user.email||'')+'</small></span><small>'+esc(planLabel())+'</small></header><nav>'+
'<a href="/property/account"><i class="fas fa-user-pen"></i><span><b>Edit profile & role</b><small>Profile, profession and preferences</small></span></a>'+
'<a href="/property/dashboard"><i class="fas fa-table-columns"></i><span><b>Dashboard</b><small>Your complete property portfolio</small></span></a>'+
'<a href="/property/home"><i class="fas fa-house"></i><span><b>Property Home</b><small>Single-property intelligence</small></span></a>'+
'<button class="hm27-menu-row" type="button" data-hm27="invite"><i class="fas fa-user-plus"></i><span><b>Invite others</b><small>Share Watchdog with someone</small></span></button>'+
'<button class="hm27-menu-row" type="button" data-hm27="signout"><i class="fas fa-arrow-right-from-bracket"></i><span><b>Sign out</b><small>End this Watchdog session</small></span></button></nav>';}
function unreadCount(){var read=getReadAt()?new Date(getReadAt()).getTime():0;return events.filter(function(x){return(new Date(x.occurred_at).getTime()||0)>read;}).length;}
function iconFor(e){var t=String(e.event_type||e.marker_id||'').toLowerCase(),s=String(e.severity||'').toLowerCase();if(/high|critical/.test(s))return'fa-triangle-exclamation';if(/tax|assessment/.test(t))return'fa-receipt';if(/market|value/.test(t))return'fa-chart-line';if(/permit/.test(t))return'fa-hammer';return'fa-house';}
function paintNotifications(){ensurePopovers();var p=document.getElementById('hm27-notice-pop');if(!p)return;var read=getReadAt()?new Date(getReadAt()).getTime():0,u=unreadCount();p.innerHTML='<header><span><b>Property notifications</b><small>'+(u?u+' unread':'You’re caught up')+'</small></span><button class="hm27-read" type="button" data-hm27="read-all">Read all</button></header><div class="hm27-notice-list">'+(events.length?events.slice(0,20).map(function(e){return'<a class="hm27-notice" href="/property/pulse"><i class="fas '+iconFor(e)+'"></i><span><b>'+esc(e.title||pretty(e.event_type||e.marker_id))+'</b><small>'+esc(property&&property.address||'Current property')+'</small></span><em>'+esc(when(e.occurred_at))+'</em></a>';}).join(''):'<div style="padding:28px 14px;text-align:center;color:#8291a7">No recent property notifications.</div>')+'</div>';var badge=document.getElementById('hm27-notify-badge');if(badge){badge.textContent=Math.min(99,u);badge.hidden=!u;}}
function togglePop(id){ensurePopovers();['hm27-profile-pop','hm27-notice-pop'].forEach(function(x){var p=document.getElementById(x);if(p)p.classList.toggle('open',x===id?!p.classList.contains('open'):false);});}
function closePops(){document.querySelectorAll('.hm27-pop.open').forEach(function(p){p.classList.remove('open');});}

function resolvePin(){var u=new URL(location.href),p=u.searchParams.get('pin');if(p)return p;var s=document.getElementById('hm-switch');return s&&s.value?s.value:'';}
function loadCurrentProperty(){var pin=resolvePin();var q=db.from('saved_properties').select('id,pams_pin,kind,address,town,county,zip,lat,lon').order('created_at',{ascending:false});if(pin)q=q.eq('pams_pin',pin);return q.limit(1).maybeSingle().then(function(r){property=r&&r.data||null;if(!property)return;var lat=valid(property.lat),lon=valid(property.lon);if(lat!=null&&lon!=null&&isNj(lat,lon))return;return db.from('property_lookups').select('lat,lon').eq('pams_pin',property.pams_pin).maybeSingle().then(function(x){var row=x&&x.data||{},a=valid(row.lat),b=valid(row.lon);if(a!=null&&b!=null&&isNj(a,b)){property.lat=a;property.lon=b;}});});}
function loadEvents(){if(!property||!property.pams_pin){events=[];paintNotifications();return Promise.resolve();}return db.from('property_update_events').select('event_type,severity,title,occurred_at,marker_id').eq('pams_pin',property.pams_pin).order('occurred_at',{ascending:false}).limit(40).then(function(r){events=r&&Array.isArray(r.data)?r.data:[];paintNotifications();}).catch(function(){events=[];paintNotifications();});}

function fetchJson(url,ms){var ctl=typeof AbortController!=='undefined'?new AbortController():null,t=ctl?setTimeout(function(){ctl.abort();},ms||8000):null;return fetch(url,{signal:ctl?ctl.signal:undefined,headers:{Accept:'application/geo+json'}}).then(function(r){if(t)clearTimeout(t);if(!r.ok)throw new Error(String(r.status));return r.json();},function(err){if(t)clearTimeout(t);throw err;});}
function weatherIcon(text){var t=String(text||'').toLowerCase();if(/thunder/.test(t))return'fa-cloud-bolt';if(/snow/.test(t))return'fa-snowflake';if(/rain|shower/.test(t))return'fa-cloud-rain';if(/cloud/.test(t))return'fa-cloud-sun';if(/clear|sun/.test(t))return'fa-sun';return'fa-cloud-sun';}
function setWeather(temp,label,forecast){var t=document.getElementById('hm27-weather-temp'),l=document.getElementById('hm27-weather-label'),i=document.getElementById('hm27-weather-icon');if(t)t.textContent=temp!=null?Math.round(temp)+'°F':'Weather';if(l)l.textContent=label||'Local conditions';if(i)i.className='fas '+weatherIcon(forecast||label);}
function loadWeather(){if(!property)return Promise.resolve();var lat=valid(property.lat),lon=valid(property.lon);if(lat==null||lon==null||!isNj(lat,lon)){setWeather(null,property.town||'New Jersey','');return Promise.resolve();}var token=++weatherToken;setWeather(null,property.town||'Local conditions','');return fetchJson('https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4),8000).then(function(point){if(token!==weatherToken)return;var u=point&&point.properties&&point.properties.forecastHourly;if(!u)throw new Error('no forecast');return fetchJson(u,8000);}).then(function(j){if(token!==weatherToken)return;var p=j&&j.properties&&j.properties.periods&&j.properties.periods[0];if(!p)throw new Error('empty');setWeather(p.temperature,property.town||'Local conditions',p.shortForecast);}).catch(function(){var u='https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto';return fetch(u).then(function(r){if(!r.ok)throw new Error('weather');return r.json();}).then(function(j){if(token!==weatherToken)return;var c=j.current||{};setWeather(c.temperature_2m,property.town||'Local conditions','');}).catch(function(){setWeather(null,property.town||'Local conditions','');});});}

function shareInvite(){var code=user?'WD-'+String(user.id).replace(/-/g,'').slice(0,10).toUpperCase():'WATCHDOG',link=location.origin+'/property/?ref='+encodeURIComponent(code);if(navigator.share){navigator.share({title:'Watchdog Property Intelligence',text:'Take a look at Watchdog Property Intelligence.',url:link}).catch(function(){});}else if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){alert('Invite link copied.');});}}

function bind(){document.addEventListener('click',function(ev){var menu=ev.target.closest&&ev.target.closest('#hm27-menu');if(menu){ev.preventDefault();toggleNav(true);closePops();return;}var profileBtn=ev.target.closest&&ev.target.closest('#hm27-profile');if(profileBtn){ev.preventDefault();ev.stopPropagation();togglePop('hm27-profile-pop');return;}var notify=ev.target.closest&&ev.target.closest('#hm27-notify');if(notify){ev.preventDefault();ev.stopPropagation();togglePop('hm27-notice-pop');return;}var action=ev.target.closest&&ev.target.closest('[data-hm27]');if(action){var a=action.dataset.hm27;if(a==='nav-close')toggleNav(false);else if(a==='read-all')setReadAt();else if(a==='invite')shareInvite();else if(a==='signout')db.auth.signOut().then(function(){location.href='/property/';});ev.preventDefault();return;}if(!ev.target.closest('.hm27-pop')&&!ev.target.closest('#hm27-profile')&&!ev.target.closest('#hm27-notify'))closePops();},true);
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){closePops();toggleNav(false);}});
  document.addEventListener('change',function(ev){if(ev.target&&ev.target.id==='hm-switch'){setTimeout(function(){loadCurrentProperty().then(function(){return Promise.all([loadEvents(),loadWeather()]);});},50);}});
}

function boot(){paintDate();ensurePopovers();bind();db.auth.getSession().then(function(r){var s=r&&r.data&&r.data.session;if(!s||!s.user)return;user=s.user;return db.from('profiles').select('display_name,full_name,avatar_url,plan,plan_tier,account_role').eq('id',user.id).maybeSingle();}).then(function(r){if(r&&r.data)profile=r.data;paintAvatar();paintProfile();return loadCurrentProperty();}).then(function(){return Promise.all([loadEvents(),loadWeather()]);}).catch(function(){});weatherTimer=setInterval(function(){if(!document.hidden)loadWeather();},20*60*1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

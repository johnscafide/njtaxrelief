/* Watchdog Dashboard refinements · greeting, NJ map, weather, resizing, data cards */
(function () {
  'use strict';

  if (window.__WATCHDOG_EXACT_ENHANCEMENTS__) return;
  window.__WATCHDOG_EXACT_ENHANCEMENTS__ = true;

  var SUPABASE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var PREF_KEY = 'watchdog_exact_enhancements_v1';
  var LOCAL_KEY = 'watchdogExactEnhancements';
  var root = document.getElementById('wd4-root');
  if (!root || !window.supabase) return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }
  });

  var enhancedMap = null;
  var enhancedMapEl = null;
  var weatherRequest = 0;
  var saveTimer = null;
  var queued = false;
  var user = null;
  var dataReady = false;
  var weatherKey = '';
  var model = { properties: [], scores: [], weather: null, weatherTarget: null };
  var prefs = { sizes: {}, hidden: [], order: [] };

  var NJ_BOUNDS = [[38.84,-75.62],[41.36,-73.88]];
  var COUNTY_CENTERS = {
    ATLANTIC:[39.47,-74.63], BERGEN:[40.96,-74.07], BURLINGTON:[39.88,-74.67], CAMDEN:[39.80,-74.99],
    'CAPE MAY':[39.10,-74.82], CUMBERLAND:[39.37,-75.13], ESSEX:[40.79,-74.25], GLOUCESTER:[39.72,-75.14],
    HUDSON:[40.73,-74.08], HUNTERDON:[40.57,-74.92], MERCER:[40.28,-74.70], MIDDLESEX:[40.44,-74.40],
    MONMOUTH:[40.28,-74.15], MORRIS:[40.86,-74.58], OCEAN:[39.88,-74.25], PASSAIC:[41.03,-74.30],
    SALEM:[39.57,-75.35], SOMERSET:[40.57,-74.62], SUSSEX:[41.14,-74.69], UNION:[40.66,-74.31], WARREN:[40.85,-75.01]
  };

  var DEFAULT_SIZES = {
    map:{x:12,y:4}, score:{x:4,y:2}, value:{x:4,y:2}, tax:{x:4,y:2}, opportunities:{x:4,y:2}, changes:{x:4,y:2}, monitored:{x:4,y:2},
    scoretrend:{x:5,y:4}, taxvalue:{x:5,y:4}, municipality:{x:5,y:4}, weather:{x:4,y:4}, activity:{x:5,y:4},
    'assessment-extra':{x:4,y:2}, 'rate-extra':{x:4,y:2}, 'freshness-extra':{x:4,y:2}, properties:{x:12,y:4}, 'county-extra':{x:6,y:3}, marketing:{x:6,y:3}, 'sponsor-varano':{x:6,y:3},
    'summary-total':{x:4,y:1}, 'summary-opportunity':{x:4,y:1}, 'summary-monitor':{x:4,y:1}, 'summary-risk':{x:4,y:1}, 'summary-gap':{x:4,y:1}, 'summary-verified':{x:4,y:1}
  };
  var RESIZABLE = new Set(['map','score','value','tax','opportunities','changes','monitored','scoretrend','taxvalue','municipality','weather','activity','assessment-extra','rate-extra','freshness-extra','properties','county-extra','marketing','sponsor-varano']);
  var EXTRA = [
    ['assessment-extra','Total Assessment'],['rate-extra','Avg Effective Rate'],['freshness-extra','Data Freshness'],['properties','Property Portfolio'],['county-extra','County Exposure'],['marketing','Marketing Studio'],['sponsor-varano','Mortgage Partner']
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]; });
  }
  function valid(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value); return Number.isFinite(n) ? n : null;
  }
  function num(value) { var n = valid(value); return n == null ? 0 : n; }
  function sum(list) { return list.reduce(function (a,b) { return a + num(b); },0); }
  function avg(list) { var a=list.map(valid).filter(function(v){return v!=null;}); return a.length ? sum(a)/a.length : 0; }
  function money(value) {
    var n=num(value),a=Math.abs(n); if(a>=1000000000)return'$'+(n/1000000000).toFixed(2).replace(/\.00$/,'')+'B';
    if(a>=1000000)return'$'+(n/1000000).toFixed(a>=10000000?1:2).replace(/\.00$/,'').replace(/\.0$/,'')+'M';
    return'$'+Math.round(n).toLocaleString();
  }
  function pct(value,digits){return num(value).toFixed(digits==null?2:digits).replace(/\.00$/,'').replace(/\.0$/,'')+'%';}
  function unique(list){return Array.from(new Set(list.filter(Boolean)));}
  function isNjCoord(lat,lon){return lat>=38.8&&lat<=41.4&&lon>=-75.8&&lon<=-73.7;}
  function scoreMap(){var out={};model.scores.forEach(function(r){if(r.pams_pin&&valid(r.watchdog_score)!=null)out[r.pams_pin]=num(r.watchdog_score);});return out;}
  function currentCounty(){var s=document.getElementById('wd4-county');return s&&s.value?s.value:'ALL';}
  function filteredProperties(){var county=currentCounty();return county==='ALL'?model.properties.slice():model.properties.filter(function(p){return String(p.county||'').toUpperCase()===county;});}
  function timeAgo(value){var t=new Date(value).getTime();if(!Number.isFinite(t))return'Waiting';var d=Math.max(0,Date.now()-t),h=d/3600000;if(h<1)return Math.max(1,Math.round(d/60000))+'m ago';if(h<48)return Math.round(h)+'h ago';return Math.round(h/24)+'d ago';}

  function readLocal(){try{var x=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');if(x&&typeof x==='object')prefs=mergePrefs(prefs,x);}catch(_){}}
  function mergePrefs(base,next){var out={sizes:Object.assign({},base.sizes||{}),hidden:Array.isArray(base.hidden)?base.hidden.slice():[],order:Array.isArray(base.order)?base.order.slice():[]};if(next&&next.sizes)Object.keys(next.sizes).forEach(function(k){var s=next.sizes[k];if(s&&valid(s.x)!=null&&valid(s.y)!=null)out.sizes[k]={x:Math.round(s.x),y:Math.round(s.y)};});if(next&&Array.isArray(next.hidden))out.hidden=next.hidden.slice();if(next&&Array.isArray(next.order))out.order=next.order.slice();return out;}
  function readRemote(){if(!user)return Promise.resolve();return client.from('dashboard_layout_preferences').select('layout').eq('user_id',user.id).maybeSingle().then(function(res){var all=res&&res.data&&res.data.layout||{},saved=all[PREF_KEY];if(saved)prefs=mergePrefs(prefs,saved);}).catch(function(){});}
  function savePrefs(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(prefs));}catch(_){}clearTimeout(saveTimer);saveTimer=setTimeout(function(){if(!user)return;client.from('dashboard_layout_preferences').select('layout').eq('user_id',user.id).maybeSingle().then(function(res){var all=res&&res.data&&res.data.layout&&typeof res.data.layout==='object'?res.data.layout:{};all[PREF_KEY]={sizes:prefs.sizes,hidden:prefs.hidden,order:prefs.order,updated_at:new Date().toISOString()};return client.from('dashboard_layout_preferences').upsert({user_id:user.id,layout:all,updated_at:new Date().toISOString()},{onConflict:'user_id'});}).catch(function(){});},850);}

  function fetchData(){
    return client.from('saved_properties').select('id,pams_pin,kind,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,updated_at,created_at,lat,lon,verified').order('created_at',{ascending:false}).then(function(res){
      model.properties=res&&Array.isArray(res.data)?res.data:[];var pins=unique(model.properties.map(function(p){return p.pams_pin;}));if(!pins.length)return[];
      return Promise.allSettled([
        client.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,peer_median,town,county,computed_at').in('pams_pin',pins),
        client.from('property_lookups').select('pams_pin,lat,lon').in('pams_pin',pins)
      ]);
    }).then(function(parts){
      if(!Array.isArray(parts))return;model.scores=parts[0]&&parts[0].status==='fulfilled'&&parts[0].value&&!parts[0].value.error&&Array.isArray(parts[0].value.data)?parts[0].value.data:[];
      var lookups=parts[1]&&parts[1].status==='fulfilled'&&parts[1].value&&!parts[1].value.error&&Array.isArray(parts[1].value.data)?parts[1].value.data:[],coords={};
      lookups.forEach(function(r){var lat=valid(r.lat),lon=valid(r.lon);if(r.pams_pin&&lat!=null&&lon!=null&&isNjCoord(lat,lon))coords[r.pams_pin]=[lat,lon];});
      model.properties.forEach(function(p){var lat=valid(p.lat),lon=valid(p.lon);if((lat==null||lon==null||!isNjCoord(lat,lon))&&coords[p.pams_pin]){p.lat=coords[p.pams_pin][0];p.lon=coords[p.pams_pin][1];}});
      dataReady=true;
    }).catch(function(){dataReady=true;});
  }

  function firstName(){var m=user&&user.user_metadata||{},name=m.full_name||m.name||user&&user.email||'there';return String(name).split(/\s+/)[0];}
  function greeting(){
    var now=new Date(),key='wd5Greeting:'+now.toISOString().slice(0,10),saved='';try{saved=sessionStorage.getItem(key)||'';}catch(_){}
    if(saved)return saved;var hour=now.getHours(),period=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
    var options=[period,period,period,'Welcome back','Good to see you','Hi there'];var pick=options[Math.floor(Math.random()*options.length)];try{sessionStorage.setItem(key,pick);}catch(_){}return pick;
  }
  function patchGreeting(){var h=document.querySelector('.wd4-welcome-copy h1');if(!h)return;var text=greeting()+', '+firstName();if(h.getAttribute('data-wd5-greeting')!==text){h.setAttribute('data-wd5-greeting',text);h.innerHTML=esc(text)+' <span>👋</span>';}}

  function selectedWeatherTarget(){
    var props=filteredProperties().filter(function(p){var lat=valid(p.lat),lon=valid(p.lon);return lat!=null&&lon!=null&&isNjCoord(lat,lon);});
    var target=props.find(function(p){return p.kind==='home';})||props[0];if(target)return{lat:num(target.lat),lon:num(target.lon),label:target.town||target.address||'Saved property',pin:target.pams_pin||''};
    var county=currentCounty(),center=COUNTY_CENTERS[county]||[40.2171,-74.7429];return{lat:center[0],lon:center[1],label:county==='ALL'?'New Jersey':county.replace(/\b\w/g,function(c){return c.toUpperCase();}).toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();}),pin:'fallback:'+county};
  }
  function fetchJson(url,headers){var c=typeof AbortController!=='undefined'?new AbortController():null,t=c?setTimeout(function(){c.abort();},8000):null;return fetch(url,{headers:headers||{},signal:c?c.signal:undefined}).then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();}).finally(function(){if(t)clearTimeout(t);});}
  function weatherIcon(text){var t=String(text||'').toLowerCase();if(t.indexOf('thunder')>=0)return'fa-cloud-bolt';if(t.indexOf('snow')>=0)return'fa-snowflake';if(t.indexOf('rain')>=0||t.indexOf('shower')>=0)return'fa-cloud-rain';if(t.indexOf('cloud')>=0)return'fa-cloud-sun';if(t.indexOf('clear')>=0||t.indexOf('sun')>=0)return'fa-sun';return'fa-cloud-sun';}
  function codeText(code){code=Number(code);if(code===0)return'Clear';if([1,2].indexOf(code)>=0)return'Partly Cloudy';if(code===3)return'Cloudy';if([45,48].indexOf(code)>=0)return'Fog';if((code>=51&&code<=67)||(code>=80&&code<=82))return'Rain';if(code>=71&&code<=77)return'Snow';if(code>=95)return'Thunderstorms';return'Local Conditions';}
  function fetchNws(target,token){return fetchJson('https://api.weather.gov/points/'+target.lat.toFixed(4)+','+target.lon.toFixed(4),{Accept:'application/geo+json'}).then(function(point){if(token!==weatherRequest)throw new Error('stale');var p=point&&point.properties||{};return Promise.all([fetchJson(p.forecastHourly,{Accept:'application/geo+json'}),fetchJson(p.forecast,{Accept:'application/geo+json'})]);}).then(function(parts){var hours=parts[0]&&parts[0].properties&&parts[0].properties.periods||[],days=parts[1]&&parts[1].properties&&parts[1].properties.periods||[];if(!hours.length&&!days.length)throw new Error('empty');return{current:hours[0]||days[0],daily:days.filter(function(d){return d.isDaytime!==false;}).slice(0,5),source:'National Weather Service'};});}
  function fetchOpenMeteo(target,token){var url='https://api.open-meteo.com/v1/forecast?latitude='+target.lat.toFixed(4)+'&longitude='+target.lon.toFixed(4)+'&current=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';return fetchJson(url).then(function(j){if(token!==weatherRequest)throw new Error('stale');var c=j.current||{},d=j.daily||{},daily=[];(d.time||[]).slice(0,5).forEach(function(day,i){daily.push({startTime:day+'T12:00:00',temperature:Math.round((d.temperature_2m_max||[])[i]||0),temperatureLow:Math.round((d.temperature_2m_min||[])[i]||0),temperatureUnit:'F',shortForecast:codeText((d.weather_code||[])[i])});});return{current:{temperature:Math.round(c.temperature_2m||0),temperatureUnit:'F',shortForecast:codeText(c.weather_code),relativeHumidity:{value:c.relative_humidity_2m},probabilityOfPrecipitation:{value:c.precipitation_probability},windSpeed:Math.round(c.wind_speed_10m||0)+' mph'},daily:daily,source:'Open-Meteo'};});}
  function loadWeather(){var target=selectedWeatherTarget(),key=target.pin+':'+target.lat.toFixed(3)+':'+target.lon.toFixed(3);if(weatherKey===key&&model.weather)return Promise.resolve();weatherKey=key;model.weatherTarget=target;var token=++weatherRequest;return fetchNws(target,token).catch(function(){return fetchOpenMeteo(target,token);}).then(function(w){if(token!==weatherRequest)return;model.weather=w;queueEnhance();}).catch(function(){model.weather=null;queueEnhance();});}
  function patchWeather(){
    var w=model.weather,t=model.weatherTarget;if(!w||!w.current||!t)return;var c=w.current,top=document.querySelector('.wd4-weather-chip');
    if(top&&top.getAttribute('data-wd5-weather')!==weatherKey){top.setAttribute('data-wd5-weather',weatherKey);top.innerHTML='<i class="fas '+weatherIcon(c.shortForecast)+' wd4-weather-icon"></i><div><strong>'+esc(c.temperature)+'°'+esc(c.temperatureUnit||'F')+'</strong><span>'+esc(c.shortForecast||'Local conditions')+'</span></div><i class="fas fa-chevron-down"></i>';}
    var card=document.querySelector('[data-card-id="weather"]');if(!card||card.getAttribute('data-wd5-weather')===weatherKey)return;card.setAttribute('data-wd5-weather',weatherKey);
    var forecast=(w.daily||[]).slice(0,4);card.innerHTML='<button class="wd4-card-menu" type="button" data-drag-handle="weather" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><div class="wd4-chart-head"><span class="wd4-card-title">Local Conditions <i class="fas fa-circle-info"></i></span></div><div class="wd4-weather-location">'+esc(t.label)+'</div><div class="wd4-weather-main"><i class="fas '+weatherIcon(c.shortForecast)+'"></i><div class="wd4-weather-temp"><strong>'+esc(c.temperature)+'°'+esc(c.temperatureUnit||'F')+'</strong><span>'+esc(c.shortForecast||'Local conditions')+'</span></div></div><div class="wd4-weather-meta"><div><span>Humidity</span><b>'+esc(c.relativeHumidity&&c.relativeHumidity.value!=null?Math.round(c.relativeHumidity.value)+'%':'—')+'</b></div><div><span>Wind</span><b>'+esc(c.windSpeed||'—')+'</b></div><div><span>Rain Chance</span><b>'+esc(c.probabilityOfPrecipitation&&c.probabilityOfPrecipitation.value!=null?Math.round(c.probabilityOfPrecipitation.value)+'%':'—')+'</b></div></div><div class="wd4-forecast">'+forecast.map(function(f){return'<div><span>'+esc(new Date(f.startTime).toLocaleDateString('en-US',{weekday:'short'}).toUpperCase())+'</span><i class="fas '+weatherIcon(f.shortForecast)+'"></i><b>'+esc(f.temperature)+'°'+(f.temperatureLow!=null?' / '+esc(f.temperatureLow)+'°':'')+'</b></div>';}).join('')+'</div>';
  }

  function mapCategory(p){if(p.has_appeal_case)return'good';var s=scoreMap()[p.pams_pin];if(s==null)return'neutral';if(s<45)return'risk';if(s<65)return'monitor';return'neutral';}
  function mountNjMap(){
    var host=document.querySelector('[data-card-id="map"]');if(!host||!window.L)return;var old=host.querySelector('#wd5-map');if(old&&old===enhancedMapEl)return;
    if(enhancedMap){try{enhancedMap.remove();}catch(_){}enhancedMap=null;enhancedMapEl=null;}if(old)old.remove();
    var el=document.createElement('div');el.id='wd5-map';el.className='wd5-map';host.insertBefore(el,host.firstChild);enhancedMapEl=el;
    enhancedMap=L.map(el,{zoomControl:false,attributionControl:true,scrollWheelZoom:true,minZoom:7,maxZoom:18,maxBounds:[[38.45,-76.05],[41.75,-73.35]],maxBoundsViscosity:.65});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(enhancedMap);L.control.zoom({position:'topright'}).addTo(enhancedMap);
    var props=filteredProperties(),bounds=[];props.forEach(function(p){var lat=valid(p.lat),lon=valid(p.lon);if(lat==null||lon==null||!isNjCoord(lat,lon))return;var cls=mapCategory(p),icon=L.divIcon({className:'',html:'<div class="wd4-map-marker '+cls+'"></div>',iconSize:[17,17],iconAnchor:[8,8]});var marker=L.marker([lat,lon],{icon:icon}).addTo(enhancedMap);var score=scoreMap()[p.pams_pin];marker.bindTooltip('<b>'+esc(p.address||'Property')+'</b><br>'+esc(p.town||'')+(score!=null?'<br>Watchdog Score '+Math.round(score):''));bounds.push([lat,lon]);});
    var county=currentCounty();if(county!=='ALL'&&bounds.length)enhancedMap.fitBounds(bounds,{padding:[38,38],maxZoom:11});else enhancedMap.fitBounds(NJ_BOUNDS,{padding:[16,16]});setTimeout(function(){if(enhancedMap)enhancedMap.invalidateSize();},80);
  }

  function statsFor(props){var assessed=sum(props.map(function(p){return p.assessed;})),rates=props.map(function(p){return valid(p.effective_rate);}).filter(function(v){return v!=null&&v>0;}),latest=props.map(function(p){return p.updated_at;}).filter(Boolean).sort().pop();return{assessed:assessed,rate:rates.length?avg(rates):0,latest:latest};}
  function extraKpi(id,label,value,small,icon){return'<section class="wd4-card wd5-extra-kpi" data-card-id="'+id+'"><button class="wd4-card-menu" type="button" data-drag-handle="'+id+'" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><span class="wd5-kpi-icon"><i class="fas '+icon+'"></i></span><span class="wd5-kpi-label">'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(small)+'</small></section>';}
  function propertyCard(props){var sm=scoreMap(),rows=props.slice().sort(function(a,b){return num(b.watchdog_value)-num(a.watchdog_value);});return'<section class="wd4-card wd5-properties" data-card-id="properties"><button class="wd4-card-menu" type="button" data-drag-handle="properties" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><div class="wd5-card-head"><h3>Property Portfolio</h3><a href="/property/home">Open watchlist</a></div><div class="wd5-properties-wrap"><table class="wd5-properties-table"><thead><tr><th style="width:30%">Property</th><th style="width:16%">Municipality</th><th style="width:10%">Score</th><th style="width:15%">Assessment</th><th style="width:14%">Annual Tax</th><th>Watchdog Value</th></tr></thead><tbody>'+rows.map(function(p){var s=sm[p.pams_pin],cls=s==null?'':s>=65?'good':s<45?'risk':'watch';return'<tr><td title="'+esc(p.address||'')+'">'+esc(p.address||'Property')+'</td><td title="'+esc(p.town||'')+'">'+esc(p.town||'—')+'</td><td>'+(s==null?'—':'<span class="wd5-score-pill '+cls+'">'+Math.round(s)+'</span>')+'</td><td>'+esc(p.assessed?money(p.assessed):'—')+'</td><td>'+esc(p.last_year_tax?money(p.last_year_tax):'—')+'</td><td>'+esc(p.watchdog_value?money(p.watchdog_value):'—')+'</td></tr>';}).join('')+'</tbody></table></div></section>';}
  function countyCard(props){var g={};props.forEach(function(p){var k=String(p.county||'Unknown').trim()||'Unknown';if(!g[k])g[k]={count:0,tax:0};g[k].count+=1;g[k].tax+=num(p.last_year_tax);});var rows=Object.keys(g).map(function(k){return{label:k,count:g[k].count,tax:g[k].tax};}).sort(function(a,b){return b.tax-a.tax;}),max=Math.max.apply(null,rows.map(function(r){return r.tax;}))||1;return'<section class="wd4-card wd5-county" data-card-id="county-extra"><button class="wd4-card-menu" type="button" data-drag-handle="county-extra" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><div class="wd5-card-head"><h3>County Tax Exposure</h3></div><div class="wd5-county-list">'+rows.map(function(r){return'<div class="wd5-county-row"><span>'+esc(r.label)+'</span><i class="wd5-county-track"><i style="width:'+Math.max(4,r.tax/max*100).toFixed(1)+'%"></i></i><b>'+esc(money(r.tax))+'</b></div>';}).join('')+'</div></section>';}
  function marketingCard(){return'<section class="wd4-card wd5-marketing" data-card-id="marketing"><button class="wd4-card-menu" type="button" data-drag-handle="marketing" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><a class="wd5-marketing-link" href="/property/marketing-studio"><div class="wd5-marketing-copy"><small>WATCHDOG MARKETING</small><h3>Marketing Studio</h3><p>Turn property intelligence into polished campaigns, reports and client-ready content.</p><span class="wd5-marketing-cta">Open Studio <i class="fas fa-arrow-right"></i></span></div><div class="wd5-marketing-art" aria-hidden="true"><i></i><i></i><i></i></div></a></section>';}
  function sponsorCard(){return'<section class="wd4-card wd5-sponsor" data-card-id="sponsor-varano"><button class="wd4-card-menu" type="button" data-drag-handle="sponsor-varano" aria-label="Move widget"><i class="fas fa-ellipsis-vertical"></i></button><a class="wd5-sponsor-link" href="https://johnvarano.com/" target="_blank" rel="noopener sponsored"><div class="wd5-sponsor-photo" style="background-image:url(\'https://www.hmamortgage.com/uploads/sites/20516/public/John-Varano-1.png\')"></div><div class="wd5-sponsor-copy"><span class="wd5-sponsored-label"><i></i>Sponsored mortgage partner</span><h3>John Varano</h3><div class="wd5-sponsor-role">Branch Manager | Senior Loan Officer</div><div class="wd5-sponsor-company">Greentree Mortgage · an HMA Mortgage Partner</div><div class="wd5-sponsor-nmls">NMLS #142739</div><span class="wd5-sponsor-cta">Explore mortgage options <i class="fas fa-arrow-up-right-from-square"></i></span></div></a></section>';}

  function ensureExtras(){if(!dataReady)return;var grid=document.getElementById('wd4-grid');if(!grid)return;var props=filteredProperties(),s=statsFor(props),firstSummary=grid.querySelector('[data-card-id^="summary-"]');var html={
    'assessment-extra':extraKpi('assessment-extra','Total Assessment',money(s.assessed),props.filter(function(p){return num(p.assessed)>0;}).length+' properties with assessment data','fa-landmark'),
    'rate-extra':extraKpi('rate-extra','Avg Effective Rate',s.rate?pct(s.rate,2):'—','average recorded property tax rate','fa-percent'),
    'freshness-extra':extraKpi('freshness-extra','Data Freshness',s.latest?timeAgo(s.latest):'—','most recent saved-property update','fa-arrows-rotate'),
    properties:propertyCard(props),'county-extra':countyCard(props),marketing:marketingCard(),'sponsor-varano':sponsorCard()
  };
    EXTRA.forEach(function(pair){var id=pair[0];if(prefs.hidden.indexOf(id)>=0)return;if(grid.querySelector('[data-card-id="'+id+'"]'))return;var wrap=document.createElement('div');wrap.innerHTML=html[id];var card=wrap.firstElementChild;if(firstSummary)grid.insertBefore(card,firstSummary);else grid.appendChild(card);});
    if(prefs.order.length){prefs.order.forEach(function(id){var c=grid.querySelector('[data-card-id="'+CSS.escape(id)+'"]');if(c)grid.appendChild(c);});}
  }

  function columns(){var w=window.innerWidth;return w>1400?24:w>1000?12:w>720?6:1;}
  function minSize(id){if(id==='map')return{x:8,y:3};if(id==='properties')return{x:6,y:3};if(['scoretrend','taxvalue','municipality','weather','activity','county-extra','marketing','sponsor-varano'].indexOf(id)>=0)return{x:4,y:3};return{x:3,y:2};}
  function sizeFor(id){return prefs.sizes[id]||DEFAULT_SIZES[id]||{x:4,y:2};}
  function applySize(card,id){var s=sizeFor(id),cols=columns();card.style.setProperty('--wd5-x',Math.max(1,Math.min(cols,Math.round(s.x))));card.style.setProperty('--wd5-y',Math.max(1,Math.round(s.y)));}
  function ensureResize(){var grid=document.getElementById('wd4-grid');if(!grid)return;grid.querySelectorAll(':scope > [data-card-id]').forEach(function(card){var id=card.getAttribute('data-card-id');applySize(card,id);if(!RESIZABLE.has(id)||card.querySelector(':scope > .wd5-resize-handle'))return;var b=document.createElement('button');b.type='button';b.className='wd5-resize-handle';b.setAttribute('aria-label','Resize widget');b.setAttribute('data-wd5-resize',id);b.innerHTML='<i class="fas fa-up-right-and-down-left-from-center"></i>';card.appendChild(b);bindResize(b,card,id);});bindExtraDragHandles(grid);}
  function bindResize(handle,card,id){if(handle.__wd5)return;handle.__wd5=true;handle.addEventListener('pointerdown',function(e){if(window.innerWidth<=720)return;e.preventDefault();e.stopPropagation();var grid=document.getElementById('wd4-grid'),cols=columns(),gap=parseFloat(getComputedStyle(grid).gap)||10,row=parseFloat(getComputedStyle(grid).gridAutoRows)||76,col=(grid.clientWidth-gap*(cols-1))/cols,startX=e.clientX,startY=e.clientY,start=sizeFor(id),min=minSize(id);document.body.classList.add('wd5-resizing');handle.setPointerCapture(e.pointerId);
      function move(ev){var x=Math.max(min.x,Math.min(cols,Math.round(start.x+(ev.clientX-startX)/(col+gap)))),y=Math.max(min.y,Math.min(8,Math.round(start.y+(ev.clientY-startY)/(row+gap))));prefs.sizes[id]={x:x,y:y};applySize(card,id);if(id==='map'&&enhancedMap)setTimeout(function(){enhancedMap.invalidateSize();},0);}
      function done(){document.body.classList.remove('wd5-resizing');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',done);handle.removeEventListener('pointercancel',done);savePrefs();}
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',done);handle.addEventListener('pointercancel',done);
    });}
  function bindExtraDragHandles(grid){grid.querySelectorAll('[data-drag-handle]').forEach(function(h){if(h.__wd5)return;h.__wd5=true;h.addEventListener('pointerdown',function(){var c=h.closest('[data-card-id]');if(c)c.setAttribute('draggable','true');});h.addEventListener('pointerup',function(){var c=h.closest('[data-card-id]');if(c&&!c.classList.contains('wd4-dragging'))c.setAttribute('draggable','false');});});if(!grid.__wd5Drag){grid.__wd5Drag=true;grid.addEventListener('dragend',function(){setTimeout(function(){prefs.order=Array.from(grid.querySelectorAll(':scope > [data-card-id]')).map(function(c){return c.getAttribute('data-card-id');});savePrefs();},20);});}}

  function patchWidgetMenu(){var pop=document.getElementById('wd4-widget-pop');if(!pop)return;EXTRA.forEach(function(pair){var id=pair[0];if(pop.querySelector('[data-wd5-widget="'+id+'"]'))return;var row=document.createElement('div');row.className='wd5-widget-option';row.setAttribute('data-wd5-widget',id);var hidden=prefs.hidden.indexOf(id)>=0;row.innerHTML='<span>'+esc(pair[1])+'</span><button type="button">'+(hidden?'Add':'Hide')+'</button>';row.querySelector('button').addEventListener('click',function(){var i=prefs.hidden.indexOf(id);if(i>=0)prefs.hidden.splice(i,1);else prefs.hidden.push(id);savePrefs();var card=document.querySelector('[data-card-id="'+CSS.escape(id)+'"]');if(card)card.remove();ensureExtras();ensureResize();patchWidgetMenu();row.querySelector('button').textContent=prefs.hidden.indexOf(id)>=0?'Add':'Hide';});pop.appendChild(row);});var p=pop.querySelector('p');if(p)p.textContent='Show, hide, drag and resize your dashboard. Use the lower-right corner of a card to change its x/y footprint.';}

  function enhance(){if(!document.getElementById('wd4-grid'))return;patchGreeting();ensureExtras();patchWeather();mountNjMap();ensureResize();patchWidgetMenu();}
  function queueEnhance(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;enhance();});}
  function observe(){var obs=new MutationObserver(queueEnhance);obs.observe(root,{childList:true,subtree:true});window.addEventListener('resize',function(){document.querySelectorAll('#wd4-grid > [data-card-id]').forEach(function(c){applySize(c,c.getAttribute('data-card-id'));});if(enhancedMap)setTimeout(function(){enhancedMap.invalidateSize();},80);});document.addEventListener('change',function(e){if(e.target&&e.target.id==='wd4-county'){weatherKey='';model.weather=null;setTimeout(function(){queueEnhance();loadWeather();},40);}});}

  function start(){readLocal();client.auth.getSession().then(function(res){var session=res&&res.data&&res.data.session;if(!session||!session.user)return;user=session.user;return Promise.all([readRemote(),fetchData()]).then(function(){queueEnhance();return loadWeather();}).then(queueEnhance);}).catch(function(){});observe();queueEnhance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

export {};

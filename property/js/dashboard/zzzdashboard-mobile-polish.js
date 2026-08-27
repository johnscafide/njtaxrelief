/* Watchdog Dashboard mobile polish: explicit Add Property affordance and device-location header weather. */
(function(){
  'use strict';
  if(window.__watchdogDashboardMobilePolish)return;
  window.__watchdogDashboardMobilePolish=true;

  var mobileQuery=window.matchMedia?window.matchMedia('(max-width: 768px)'):null;
  var weatherStarted=false;
  var currentWeather=null;
  var settleTimer=null;

  function isMobile(){return mobileQuery?mobileQuery.matches:window.innerWidth<=768;}
  function esc(value){return String(value==null?'':value).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function weatherIcon(text){
    var t=String(text||'').toLowerCase();
    if(t.indexOf('thunder')>=0)return'fa-cloud-bolt';
    if(t.indexOf('snow')>=0)return'fa-snowflake';
    if(t.indexOf('rain')>=0||t.indexOf('shower')>=0)return'fa-cloud-rain';
    if(t.indexOf('cloud')>=0)return'fa-cloud-sun';
    if(t.indexOf('clear')>=0||t.indexOf('sun')>=0)return'fa-sun';
    return'fa-cloud-sun';
  }
  function codeText(code){
    code=Number(code);
    if(code===0)return'Clear';
    if(code===1||code===2)return'Partly Cloudy';
    if(code===3)return'Cloudy';
    if(code===45||code===48)return'Fog';
    if((code>=51&&code<=67)||(code>=80&&code<=82))return'Rain';
    if(code>=71&&code<=77)return'Snow';
    if(code>=95)return'Thunderstorms';
    return'Local conditions';
  }
  function fetchJson(url,headers){
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},7000):null;
    return fetch(url,{headers:headers||{},signal:controller?controller.signal:undefined}).then(function(response){
      if(!response.ok)throw new Error('weather '+response.status);
      return response.json();
    }).finally(function(){if(timer)clearTimeout(timer);});
  }
  function nwsWeather(lat,lon){
    return fetchJson('https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4),{Accept:'application/geo+json'}).then(function(point){
      var props=point&&point.properties||{};
      if(!props.forecastHourly)throw new Error('No hourly forecast');
      return fetchJson(props.forecastHourly,{Accept:'application/geo+json'});
    }).then(function(hourly){
      var periods=hourly&&hourly.properties&&hourly.properties.periods||[];
      if(!periods.length)throw new Error('No current forecast');
      var now=periods[0];
      return{temperature:Math.round(Number(now.temperature)||0),unit:String(now.temperatureUnit||'F'),condition:String(now.shortForecast||'Local conditions')};
    });
  }
  function fallbackWeather(lat,lon){
    var url='https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto';
    return fetchJson(url).then(function(data){
      var now=data&&data.current||{};
      return{temperature:Math.round(Number(now.temperature_2m)||0),unit:'F',condition:codeText(now.weather_code)};
    });
  }
  function loadWeather(lat,lon){return nwsWeather(lat,lon).catch(function(){return fallbackWeather(lat,lon);});}

  function ensureAddProperty(){
    var button=document.querySelector('.wd7-add-property');
    if(!button)return;
    button.setAttribute('aria-label','Add property');
    button.setAttribute('title','Add property');
    var icon=button.querySelector('i');
    if(icon&&icon.className!=='fas fa-plus')icon.className='fas fa-plus';
  }
  function paintWeather(){
    if(!currentWeather)return;
    var chip=document.querySelector('.wd4-weather-chip');
    if(!chip)return;
    var key=[currentWeather.temperature,currentWeather.unit,currentWeather.condition].join('|');
    if(chip.dataset.wdGeoWeatherKey===key)return;
    chip.dataset.wdGeoWeatherKey=key;
    chip.dataset.wdWeatherSource='device-location';
    chip.innerHTML='<i class="fas '+weatherIcon(currentWeather.condition)+' wd4-weather-icon" aria-hidden="true"></i><div><strong>'+esc(currentWeather.temperature)+'°'+esc(currentWeather.unit)+'</strong><span>'+esc(currentWeather.condition)+'</span></div>';
    chip.setAttribute('aria-label','Current location weather: '+currentWeather.temperature+' degrees '+currentWeather.unit+', '+currentWeather.condition);
    chip.setAttribute('title','Current location · '+currentWeather.temperature+'°'+currentWeather.unit+' · '+currentWeather.condition);
  }
  function settle(){
    if(!isMobile())return;
    ensureAddProperty();
    paintWeather();
  }
  function queueSettle(){clearTimeout(settleTimer);settleTimer=setTimeout(settle,40);}

  function startCurrentLocationWeather(){
    if(weatherStarted||!isMobile())return;
    weatherStarted=true;
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(function(position){
      var lat=Number(position&&position.coords&&position.coords.latitude);
      var lon=Number(position&&position.coords&&position.coords.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
      loadWeather(lat,lon).then(function(weather){currentWeather=weather;settle();}).catch(function(){/* Keep the saved-property weather already supplied by Dashboard. */});
    },function(){/* Permission denied/unavailable: keep the saved-property weather fallback. */},{enableHighAccuracy:false,timeout:6500,maximumAge:600000});
  }

  function boot(){
    var root=document.getElementById('wd4-root');
    settle();
    startCurrentLocationWeather();
    if(root&&'MutationObserver'in window)new MutationObserver(queueSettle).observe(root,{childList:true,subtree:true});
    window.addEventListener('resize',function(){settle();startCurrentLocationWeather();},{passive:true});
    setTimeout(function(){settle();startCurrentLocationWeather();},350);
    setTimeout(settle,1300);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

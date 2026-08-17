(function(){
'use strict';
var PROD_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var PROD_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
var TTL=300000,cache=new Map(),clientRef=null;
function uniq(a){return Array.from(new Set((a||[]).map(function(x){return String(x||'').trim();}).filter(Boolean)));}
function sb(){
  if(clientRef)return clientRef;
  try{var a=window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client();if(a){clientRef=a;return a;}}catch(_e){}
  try{var d=window.NJDashboard&&window.NJDashboard.client&&window.NJDashboard.client();if(d){clientRef=d;return d;}}catch(_e){}
  if(!window.supabase||!window.supabase.createClient)return null;
  var cfg=window.WatchdogIntelligenceConfig||{},url=String(cfg.supabaseUrl||PROD_URL),key=String(cfg.publishableKey||PROD_KEY);
  clientRef=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:String(cfg.storageKey||'sb-uvkvaxljhhngydvlrzom-auth-token')}});
  return clientRef;
}
function cacheKey(pins,packs){return pins.slice().sort().join(',')+'|'+packs.slice().sort().join(',');}
async function get(options){
  options=options||{};
  var pins=uniq(options.pams_pins||options.pins).slice(0,25),packs=uniq(options.packs&&options.packs.length?options.packs:['identity','assessment_tax','sale_market']);
  if(!pins.length)return null;
  var key=cacheKey(pins,packs),old=cache.get(key),now=Date.now();
  if(!options.force&&old&&now-old.at<TTL)return old.data;
  var c=sb();if(!c)return null;
  try{
    var res=await c.functions.invoke('intelligence-semantic-context',{body:{pams_pins:pins,packs:packs}});
    if(res.error)throw res.error;
    cache.set(key,{at:now,data:res.data});
    window.dispatchEvent(new CustomEvent('watchdog:semantic-context',{detail:{pins:pins,packs:packs,data:res.data}}));
    return res.data;
  }catch(error){console.warn('Watchdog Semantic Context unavailable:',error&&error.message||error);return null;}
}
function snapshot(data,pin){var rows=data&&Array.isArray(data.snapshots)?data.snapshots:[];if(!pin)return rows[0]||null;return rows.find(function(x){return String(x.pams_pin)===String(pin);})||null;}
function marker(snap,id){if(!snap||!Array.isArray(snap.markers))return null;return snap.markers.find(function(x){return x.id===id;})||null;}
function value(snap,id,fallback){var m=marker(snap,id);return m&&m.state==='available'?m.value:(arguments.length>2?fallback:null);}
function available(snap){return snap&&Array.isArray(snap.markers)?snap.markers.filter(function(m){return m.state==='available';}):[];}
function missing(snap){return snap&&Array.isArray(snap.markers)?snap.markers.filter(function(m){return m.state!=='available';}):[];}
function clear(){cache.clear();}
window.WatchdogSemanticContext={get:get,snapshot:snapshot,marker:marker,value:value,available:available,missing:missing,clear:clear,packs:['identity','assessment_tax','sale_market','appeal_uniformity','permits_closing','environment_risk','municipal_pressure','agent_opportunity']};
})();

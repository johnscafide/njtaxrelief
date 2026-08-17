(function(){
'use strict';
var PROD_URL='https://uvkvaxljhhngydvlrzom.supabase.co',PROD_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',clientRef=null;
function sb(){
  if(clientRef)return clientRef;
  try{var a=window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client();if(a){clientRef=a;return a;}}catch(_e){}
  try{var d=window.NJDashboard&&window.NJDashboard.client&&window.NJDashboard.client();if(d){clientRef=d;return d;}}catch(_e){}
  if(!window.supabase||!window.supabase.createClient)return null;
  var cfg=window.WatchdogIntelligenceConfig||{},url=String(cfg.supabaseUrl||PROD_URL),key=String(cfg.publishableKey||PROD_KEY);
  clientRef=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:String(cfg.storageKey||'sb-uvkvaxljhhngydvlrzom-auth-token')}});
  return clientRef;
}
async function run(options){
  options=options||{};var c=sb();if(!c)return null;
  var body={scenario_type:String(options.scenario_type||'property_tax_share'),pams_pin:String(options.pams_pin||options.pin||''),years:Number(options.years||1),assumptions:options.assumptions||{}};
  if(!body.pams_pin)return null;
  try{
    var res=await c.functions.invoke('intelligence-scenario-preview',{body:body});if(res.error)throw res.error;
    window.dispatchEvent(new CustomEvent('watchdog:scenario',{detail:{request:body,data:res.data}}));return res.data;
  }catch(error){console.warn('Watchdog Scenario unavailable:',error&&error.message||error);return null;}
}
async function fromPrompt(pin,prompt,options){
  options=options||{};var c=sb();if(!c)return null;
  var body={pams_pin:String(pin||''),prompt:String(prompt||'')};
  if(options.years!=null)body.years=Number(options.years);
  if(!body.pams_pin||!body.prompt.trim())return null;
  try{
    var res=await c.functions.invoke('intelligence-scenario-from-prompt',{body:body});
    var data=res.data||null;
    if(res.error&&!data)throw res.error;
    window.dispatchEvent(new CustomEvent('watchdog:scenario-prompt',{detail:{request:body,data:data,error:res.error||null}}));
    return data;
  }catch(error){console.warn('Watchdog Scenario prompt unavailable:',error&&error.message||error);return null;}
}
function propertyTax(pin,assumptions,years){return run({scenario_type:'property_tax_share',pams_pin:pin,assumptions:assumptions||{},years:years||1});}
window.WatchdogScenario={run:run,propertyTax:propertyTax,fromPrompt:fromPrompt,formula_version:'property-tax-share-v1',prompt_parser_version:'property-tax-scenario-parser-v1'};
})();

(function(){
'use strict';
var form=document.getElementById('wd-anchor-form');
if(!form)return;
var PREFILL='wd_anchor_2025_prefill',ESTIMATE='wd_anchor_2025_estimate_id',APP='wd_anchor_2025_application_id';
function q(s,r){return(r||document).querySelector(s)}
function clean(v,max){return String(v==null?'':v).trim().slice(0,max||500)}
function read(key){try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch(_){return null}}
function setField(name,val){var el=q('[name="'+name+'"]',form);if(!el||clean(el.value)||!clean(val))return;el.value=clean(val,300);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
function setChoice(path,val){var group=q('[data-choice="'+path+'"]',form);if(!group||q('.is-selected',group))return;var button=q('[data-value="'+val+'"]',group);if(button)button.click();}
function apply(){var p=read(PREFILL);if(!p)return;setField('applicant.first',p.first_name);setField('mailing.address',p.street||p.address);setField('mailing.city',p.city);setField('mailing.state',p.state||'NJ');setField('mailing.zip',p.zip);if(p.tenure==='own')setChoice('residency_status','homeowner');else if(p.tenure==='rent')setChoice('residency_status','renter');var prop=p.property||{};setField('property.block',prop.block);setField('property.lot',prop.lot);setField('property.qualifier',prop.qualifier);}
async function link(){
 var estimate='',application='';try{estimate=sessionStorage.getItem(ESTIMATE)||'';application=sessionStorage.getItem(APP)||''}catch(_){}
 if(!estimate||!application||!window.NJPTRSupabaseRuntime)return false;
 try{var db=window.NJPTRSupabaseRuntime.createClient(),auth=await db.auth.getUser(),user=auth&&auth.data&&auth.data.user;if(!user)return false;var r=await db.from('anchor_estimates').update({application_id:application}).eq('id',estimate).select('id').maybeSingle();if(r.error||!r.data)return false;try{sessionStorage.removeItem(ESTIMATE)}catch(_){}return true;}catch(_){return false;}
}
[150,600,1400,2600].forEach(function(delay){setTimeout(apply,delay)});
setTimeout(function(){try{sessionStorage.removeItem(PREFILL)}catch(_){}},3600);
var attempts=0;function tryLink(){attempts+=1;link().then(function(done){if(!done&&attempts<60)setTimeout(tryLink,1000)});}setTimeout(tryLink,600);
})();

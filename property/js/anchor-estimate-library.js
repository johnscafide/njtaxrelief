(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient();
var root=document.getElementById('wd-estimate-library');
var list=document.getElementById('wd-estimate-library-list');
if(!root||!list)return;
var PREFILL='wd_anchor_2025_prefill',ESTIMATE='wd_anchor_2025_estimate_id';
function clean(v){return String(v==null?'':v).trim();}
function money(v){var n=Number(v);return Number.isFinite(n)?'$'+Math.round(n).toLocaleString():'$0';}
function date(v){try{return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(v));}catch(_){return'';}}
function parseAddress(address){var p=clean(address).split(',').map(function(x){return x.trim();}).filter(Boolean),o={street:'',city:'',state:'NJ',zip:''};if(p.length>=3){o.street=p[0];o.city=p[1];var m=p.slice(2).join(' ').match(/\bNJ\s+(\d{5}(?:-\d{4})?)\b/i);if(m)o.zip=m[1];}else o.street=clean(address);return o;}
function prefill(row){var p=parseAddress(row.property_address);return{source:row.estimate_source||'watchdog_saved_estimate',estimate_id:row.id,estimated_amount:row.estimated_amount||0,first_name:'',tenure:row.tenure,primary_residence:row.primary_residence===true,address:row.property_address,street:p.street,city:row.property_town||p.city,state:'NJ',zip:row.property_zip||p.zip,property:{pams_pin:row.property_pams_pin||'',block:row.property_block||'',lot:row.property_lot||'',qualifier:row.property_qualifier||''}};}
function start(row){try{sessionStorage.setItem(PREFILL,JSON.stringify(prefill(row)));sessionStorage.setItem(ESTIMATE,row.id);}catch(_){}window.location.href=row.application_id?'/anchor/application/2025/?application='+encodeURIComponent(row.application_id):'/anchor/application/2025/';}
function render(rows){
 root.hidden=false;
 if(!rows.length){root.hidden=true;list.innerHTML='';return;}
 list.innerHTML='';
 rows.forEach(function(row){
   var card=document.createElement('article');card.className='wd-estimate-card';card.dataset.id=row.id;
   var amount=money(row.estimated_amount),status=row.qualifies?'Likely eligible estimate':'Review eligibility',app=row.application_id?'Application linked':'Application not started';
   card.innerHTML='<div class="wd-estimate-card-main"><span class="wd-estimate-program">2025 ANCHOR</span><strong>'+amount+' estimated benefit</strong><p></p><div class="wd-estimate-meta"><span>'+status+'</span><span>'+app+'</span><span>Saved '+date(row.updated_at||row.estimated_at)+'</span></div></div><div class="wd-estimate-card-actions"><button type="button" class="wd-btn primary" data-estimate-action="start">'+(row.application_id?'Continue application':'Start application')+'</button><button type="button" class="wd-btn secondary" data-estimate-action="delete">Delete estimate</button></div>';
   card.querySelector('p').textContent=row.property_address||'New Jersey residence';
   card.addEventListener('click',function(e){var b=e.target.closest('[data-estimate-action]');if(!b)return;if(b.dataset.estimateAction==='start')start(row);else if(b.dataset.estimateAction==='delete')remove(row,card);});
   list.appendChild(card);
 });
}
async function remove(row,card){
 if(!window.confirm('Delete this saved ANCHOR estimate from your Watchdog account? Your encrypted application, if any, will not be deleted.'))return;
 var r=await db.from('anchor_estimates').delete().eq('id',row.id);if(r.error)return;card.remove();if(!list.children.length)root.hidden=true;
}
async function load(){
 try{
   var auth=await db.auth.getUser(),user=auth&&auth.data&&auth.data.user;if(!user){root.hidden=true;return;}
   var res=await db.from('anchor_estimates').select('id,tax_year,program,estimate_source,tenure,income_band,age_65_plus,primary_residence,property_taxes_paid,qualifies,estimated_amount,property_address,property_pams_pin,property_town,property_county,property_zip,property_block,property_lot,property_qualifier,application_id,estimated_at,updated_at').order('updated_at',{ascending:false}).limit(10);
   if(res.error)throw res.error;render(res.data||[]);
 }catch(_){root.hidden=true;}
}
db.auth.onAuthStateChange(function(){setTimeout(load,0);});load();
})();

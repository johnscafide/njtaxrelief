(function(){
'use strict';
var appCount=document.getElementById('ac-anchor-app-count'),estimateCount=document.getElementById('ac-anchor-estimate-count'),status=document.getElementById('ac-anchor-summary-status');
if(!appCount||!estimateCount||!window.NJPTRSupabaseRuntime)return;
var db;try{db=window.NJPTRSupabaseRuntime.createClient();}catch(_){return;}
function copy(id){var el=document.getElementById(id);return el?String(el.textContent||'').trim():'';}
function show(a,e){appCount.textContent=String(a);estimateCount.textContent=String(e);if(status)status.textContent=(a||e)?copy('ac-anchor-summary-has-saved'):copy('ac-anchor-summary-empty');}
async function load(){try{var session=await db.auth.getSession(),user=session&&session.data&&session.data.session&&session.data.session.user;if(!user){show(0,0);return;}var results=await Promise.all([db.from('anchor_applications').select('id',{count:'exact',head:true}).eq('user_id',user.id),db.from('anchor_estimates').select('id',{count:'exact',head:true}).eq('user_id',user.id)]);show(results[0].count||0,results[1].count||0);}catch(_){if(status)status.textContent=copy('ac-anchor-summary-fallback');}}
load();
})();
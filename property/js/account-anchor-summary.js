(function(){
'use strict';
var appCount=document.getElementById('ac-anchor-app-count'),estimateCount=document.getElementById('ac-anchor-estimate-count'),status=document.getElementById('ac-anchor-summary-status');
if(!appCount||!estimateCount||!window.NJPTRSupabaseRuntime)return;
var db;try{db=window.NJPTRSupabaseRuntime.createClient();}catch(_){return;}
// content-architecture: dynamic — this status changes from live, user-scoped application and estimate counts.
function show(a,e){appCount.textContent=String(a);estimateCount.textContent=String(e);if(status)status.textContent=(a||e)?'Open your library to review saved applications, PDFs and estimates.':'No saved applications or estimates yet.'}
async function load(){try{var session=await db.auth.getSession(),user=session&&session.data&&session.data.session&&session.data.session.user;if(!user){show(0,0);return}var results=await Promise.all([db.from('anchor_applications').select('id',{count:'exact',head:true}).eq('user_id',user.id),db.from('anchor_estimates').select('id',{count:'exact',head:true}).eq('user_id',user.id)]);show(results[0].count||0,results[1].count||0)}catch(_){if(status)status.textContent='Open your application library to view saved ANCHOR and PAS-1 records.'}}
load();
})();
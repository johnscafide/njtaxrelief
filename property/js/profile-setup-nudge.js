(function(){
'use strict';
var host=String(location.hostname||'').toLowerCase(),path=String(location.pathname||'').replace(/\/+$/,'');
if((host!=='watchdogindex.com'&&host!=='www.watchdogindex.com')||path!==''||!window.NJPTRSupabaseRuntime)return;
var db;try{db=window.NJPTRSupabaseRuntime.createClient()}catch(_){return}
function loadCss(){if(document.querySelector('link[data-profile-setup-nudge]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/profile-setup-nudge.css';link.dataset.profileSetupNudge='1';document.head.appendChild(link)}
function remove(){var old=document.getElementById('wd-profile-nudge');if(old)old.remove()}
async function mount(){if(document.getElementById('wd-profile-nudge'))return;try{var response=await fetch('/property/partials/profile-setup-nudge.html',{credentials:'same-origin'});if(!response.ok)return;var holder=document.createElement('div');holder.innerHTML=await response.text();var node=holder.firstElementChild;if(!node)return;var hero=document.querySelector('.pl-hero');if(hero&&hero.parentNode)hero.insertAdjacentElement('afterend',node);else document.body.insertBefore(node,document.body.firstChild)}catch(_){}}
async function refresh(){remove();try{var session=await db.auth.getSession(),user=session&&session.data&&session.data.session&&session.data.session.user;if(!user)return;var result=await db.rpc('get_my_watchdog_onboarding_state');if(result.error)return;var state=Array.isArray(result.data)?result.data[0]:result.data;if(!state||state.completed)return;mount()}catch(_){}}
function init(){loadCss();refresh();if(db.auth&&typeof db.auth.onAuthStateChange==='function')db.auth.onAuthStateChange(function(){setTimeout(refresh,0)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
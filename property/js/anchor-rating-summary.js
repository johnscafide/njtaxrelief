(function(){
'use strict';
if(window.__watchdogAnchorRatingSummary)return;window.__watchdogAnchorRatingSummary=true;
var db=null,busy=false,loaded=false;
function installStyle(){if(document.querySelector('link[data-anchor-rating-summary-style]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/anchor-rating-summary.css';link.dataset.anchorRatingSummaryStyle='1';(document.head||document.documentElement).appendChild(link)}
function client(){if(db)return db;if(!window.NJPTRSupabaseRuntime||typeof window.NJPTRSupabaseRuntime.createClient!=='function')return null;try{db=window.NJPTRSupabaseRuntime.createClient();return db}catch(_){return null}}
function hosts(){return Array.prototype.slice.call(document.querySelectorAll('[data-anchor-rating-summary]'))}
function stars(value){var rounded=Math.max(0,Math.min(5,Math.round(Number(value)||0)));return '★★★★★'.split('').map(function(star,index){return '<span class="'+(index<rounded?'is-on':'')+'">'+star+'</span>'}).join('')}
// content-architecture: dynamic — aggregate rating, star fill and verified-review count are live data returned by the public aggregate RPC.
function render(row){var count=Number(row&&row.rating_count||0),avg=Number(row&&row.average_rating||0);hosts().forEach(function(host){if(count<1||!Number.isFinite(avg)||avg<=0){host.hidden=true;return}host.hidden=false;host.innerHTML='<span class="wd-anchor-rating-stars" aria-hidden="true">'+stars(avg)+'</span><strong>'+avg.toFixed(1)+'</strong><span>out of 5 · '+count.toLocaleString()+' verified application review'+(count===1?'':'s')+'</span>';host.setAttribute('aria-label',avg.toFixed(1)+' out of 5 from '+count+' verified application review'+(count===1?'':'s'))})}
async function load(){if(busy||loaded||!hosts().length)return;var c=client();if(!c)return;busy=true;try{var r=await c.rpc('get_public_anchor_application_rating_v1');if(r.error)throw r.error;var row=Array.isArray(r.data)?r.data[0]:r.data;loaded=true;render(row||{})}catch(_){hosts().forEach(function(host){host.hidden=true})}finally{busy=false}}
function scan(){if(hosts().length)load()}
installStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
if(typeof MutationObserver!=='undefined'&&document.documentElement)new MutationObserver(function(){scan()}).observe(document.documentElement,{childList:true,subtree:true});
})();
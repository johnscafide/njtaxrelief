(function(){
'use strict';
if(window.__WATCHDOG_ANCHOR_APPLICATIONS_MENU__)return;
window.__WATCHDOG_ANCHOR_APPLICATIONS_MENU__=true;

var APP_URL='/property/anchor/applications/';
var APP_URL_CLEAN='/anchor/applications/';
function cleanHost(){var h=String(location.hostname||'').toLowerCase();return h==='watchdogindex.com'||h==='www.watchdogindex.com'}
function href(){return cleanHost()?APP_URL_CLEAN:APP_URL}
// content-architecture: dynamic — this style shim is attached only when an async legacy/current menu shell is present; permanent page presentation remains in the normal shell stylesheets.
function addStyle(){if(document.getElementById('wd-anchor-menu-style'))return;var s=document.createElement('style');s.id='wd-anchor-menu-style';s.textContent='.wd-anchor-apps-top{display:inline-flex!important;align-items:center;justify-content:center;width:42px;height:42px;border:1px solid rgba(16,41,75,.12);border-radius:12px;background:#fff;color:#10294b;text-decoration:none;flex:0 0 auto}.wd-anchor-apps-top:hover{background:#f5f8fb}.wd-anchor-apps-top i{font-size:16px}.wd-anchor-apps-link i{color:#087f82}@media(max-width:760px){.wd-anchor-apps-top{width:40px;height:40px}}';document.head.appendChild(s)}
// content-architecture: dynamic — the same link must be inserted into whichever shared navigation shell is rendered after auth/shell initialization.
function insertNav(nav){if(!nav||nav.querySelector('[data-wd-anchor-apps-nav]'))return;var a=document.createElement('a');a.href=href();a.dataset.wdAnchorAppsNav='1';a.className='wd-anchor-apps-link';a.innerHTML='<i class="fas fa-file-circle-check"></i><span>ANCHOR Applications</span>';var home=Array.from(nav.querySelectorAll('a')).find(function(x){return /property home|home \/ watchlist|watchlist/i.test(x.textContent||'')});if(home&&home.nextSibling)nav.insertBefore(a,home.nextSibling);else nav.appendChild(a)}
// content-architecture: dynamic — profile-menu markup is rendered by multiple async shell variants, so this state-aware insertion runs only after the active profile host exists.
function insertProfile(nav){if(!nav||nav.querySelector('[data-wd-anchor-apps-profile]'))return;var a=document.createElement('a');a.href=href();a.dataset.wdAnchorAppsProfile='1';a.className='wd-anchor-apps-link';a.innerHTML='<i class="fas fa-file-circle-check"></i><span><b>ANCHOR / PAS-1 applications</b><small>Saved applications and ANCHOR estimates</small></span>';var home=Array.from(nav.querySelectorAll('a')).find(function(x){return /property home/i.test(x.textContent||'')});if(home)nav.insertBefore(a,home);else nav.appendChild(a)}
function insertTopIcon(){if(document.querySelector('[data-wd-anchor-apps-top]'))return;var profile=document.getElementById('wdx-user')||document.getElementById('wd-profile-trigger')||document.querySelector('[aria-label="Profile"],[aria-label="Account"],[aria-label="Watchdog account"]');if(!profile||!profile.parentNode)return;var a=document.createElement('a');a.href=href();a.dataset.wdAnchorAppsTop='1';a.className='wd-anchor-apps-top';a.setAttribute('aria-label','ANCHOR and PAS-1 applications');a.title='ANCHOR / PAS-1 applications';a.innerHTML='<i class="far fa-file-lines" aria-hidden="true"></i>';profile.parentNode.insertBefore(a,profile)}
function sync(){addStyle();document.querySelectorAll('.wd4-nav-links,.hm27-nav-links,.wd-universal-nav-links').forEach(insertNav);document.querySelectorAll('#wd6-profile nav,#hm27-profile-pop nav,.wd-universal-profile>nav,#wd-profile-content nav').forEach(insertProfile);insertTopIcon()}
var queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;sync()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
document.addEventListener('watchdog:universal-menu-ready',schedule);
document.addEventListener('watchdog:public-menu-open',schedule);
if(typeof MutationObserver!=='undefined'&&document.documentElement)new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
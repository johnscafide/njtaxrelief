(function(){
'use strict';
var form=document.getElementById('wd-anchor-form'),complete=document.querySelector('.wd-step[data-step="complete"]');
if(!form||!complete||!window.NJPTRSupabaseRuntime)return;
var db;try{db=window.NJPTRSupabaseRuntime.createClient()}catch(_){return}
var APP_KEY='wd_anchor_2025_application_id',panel=null,busy=false;
function q(s,r){return(r||document).querySelector(s)}
function loadCss(){if(q('link[data-anchor-profile-save]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/anchor-application-profile-save.css';link.dataset.anchorProfileSave='1';document.head.appendChild(link)}
function appId(){var id='';try{id=String(sessionStorage.getItem(APP_KEY)||'')}catch(_){}return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:''}
function field(name){var el=q('[name="'+name+'"]',form);return el?String(el.value||'').trim():''}
function payload(){return{p_application_id:appId(),p_first_name:field('applicant.first')||null,p_middle_name:field('applicant.middle')||null,p_last_name:field('applicant.last')||null,p_address:field('mailing.address')||null,p_city:field('mailing.city')||null,p_state:field('mailing.state')||null,p_zip:field('mailing.zip')||null,p_municipality_code:field('mailing.municipality_code')||null}}
function copy(key){var el=panel&&q('[data-profile-save-copy="'+key+'"]',panel);return el?el.textContent.trim():''}
function status(key,type){var el=panel&&q('#wd-anchor-profile-save-status',panel);if(!el)return;el.textContent=copy(key);el.className=type==='success'?'is-success':type==='error'?'is-error':''}
async function save(){if(busy)return;var id=appId(),button=q('#wd-anchor-profile-save-button',panel);if(!id){status('missing','error');return}busy=true;button.disabled=true;status('saving');try{var result=await db.rpc('set_my_reusable_profile_v1',payload());if(result.error)throw result.error;status('saved','success');button.textContent=copy('saved_button')}catch(error){status('failed','error');button.disabled=false}finally{busy=false}}
async function mount(){if(panel)return panel;try{var response=await fetch('/property/partials/anchor-application-profile-save.html',{credentials:'same-origin'});if(!response.ok)return null;var host=document.createElement('div');host.innerHTML=await response.text();panel=host.firstElementChild;if(!panel)return null;var support=q('.wd-support-card',complete),growth=q('#wd-anchor-growth',complete);if(growth)growth.insertAdjacentElement('beforebegin',panel);else if(support)complete.insertBefore(panel,support);else complete.appendChild(panel);q('#wd-anchor-profile-save-button',panel).addEventListener('click',save);return panel}catch(_){return null}}
function sync(){if(complete.classList.contains('is-active'))mount()}
function init(){loadCss();new MutationObserver(sync).observe(complete,{attributes:true,attributeFilter:['class']});sync()}
init();
})();
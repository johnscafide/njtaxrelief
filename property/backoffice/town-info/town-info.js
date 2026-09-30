(function(){
'use strict';
/* Town Info Reviews: the owner approves or rejects Town Needs submissions.
   Every call goes through /api/watchdog-backoffice-town-needs, which checks on the server that the
   signed-in account is a Watchdog developer and a Backoffice operator. Page copy lives in index.html;
   this file only fills in submission data. */
var API='/api/watchdog-backoffice-town-needs',NEEDS_URL='/property/data/municipal-requirements/town-needs.json',REFRESH_MS=60000,timer=null,busy=false,lastLoaded=0,labels={};
var $=function(s,r){return (r||document).querySelector(s)};
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n}
function url(u){u=String(u||'');return /^https:\/\//i.test(u)?u:''}
function date(v){if(!v)return'';var d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function size(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
function label(k){return labels[k]||k}
function toast(m){var e=$('#ti-toast');if(!e)return;e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){e.classList.remove('show')},2600)}
async function token(){try{if(window.njptrAccessReady)await Promise.resolve(window.njptrAccessReady);if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return'';var r=await window.NJPTRAccess.client().auth.getSession();return r&&r.data&&r.data.session&&r.data.session.access_token||''}catch(_){return''}}
async function api(action,payload){var t=await token();if(!t)throw new Error('Sign in to Watchdog first.');var r=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify(Object.assign({action:action},payload||{}))}),j={};try{j=await r.json()}catch(_){j={}}if(!r.ok)throw new Error(j.error||'Town info request failed.');return j}
function template(id){return $('#'+id).content.firstElementChild.cloneNode(true)}
function link(href,text,detail){var a=el('a','ti-source',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(detail)a.appendChild(el('small','',detail));return a}
function card(s){
 var c=template('ti-card-template');c.dataset.id=s.id;
 $('.ti-town',c).textContent=s.municipality_name;$('.ti-code',c).textContent=s.municipality_code;
 $('.ti-who',c).textContent=[s.submitter_name,s.submitter_email,s.submitter_role].filter(Boolean).join(' · ')+(s.submitter_name||s.submitter_email||s.submitter_role?' · ':'')+date(s.created_at);
 var needs=$('.ti-needs',c);(s.need_keys||[]).forEach(function(k){needs.appendChild(el('li','',label(k)))});
 var answer=$('.ti-answer',c);if(s.answer)answer.textContent=s.answer;else{answer.hidden=true;$('.ti-no-answer',c).hidden=false}
 var src=$('.ti-sources',c);
 if(url(s.view_url))src.appendChild(link(url(s.view_url),'Open document',(s.file_name||'file')+' · '+size(s.file_size)));
 else if(s.file_path)src.appendChild(el('span','ti-source muted','Document not available'));
 if(url(s.source_url))src.appendChild(link(url(s.source_url),'Open link',url(s.source_url).replace(/^https:\/\//,'').slice(0,80)));
 return c;
}
function historyRow(s){
 var r=template('ti-history-template'),ev=url(s.evidence_url);
 $('.ti-h-title',r).textContent=s.municipality_name+' · '+(s.status==='approved'?'Approved':s.status==='published'?'Published':'Rejected');
 $('.ti-h-detail',r).textContent=(s.need_keys||[]).map(label).join(', ')+(s.review_note?' · '+s.review_note:'');
 $('.ti-h-date',r).textContent=date(s.reviewed_at);
 var a=$('.ti-h-source',r);if(ev){a.href=ev}else{a.remove()}
 return r;
}
function paint(d){
 var pending=Array.isArray(d.pending)?d.pending:[],recent=Array.isArray(d.recent)?d.recent:[];
 $('#ti-count').textContent=pending.length.toLocaleString();
 $('#ti-list').replaceChildren.apply($('#ti-list'),pending.length?pending.map(card):[template('ti-empty-queue')]);
 $('#ti-history').replaceChildren.apply($('#ti-history'),recent.length?recent.map(historyRow):[template('ti-empty-history')]);
}
function fail(e){var node=template('ti-error');$('.ti-error-text',node).textContent=e.message;$('#ti-list').replaceChildren(node);$('#ti-history').replaceChildren();toast(e.message)}
function schedule(){clearTimeout(timer);timer=setTimeout(load,REFRESH_MS)}
async function load(){if(busy)return;busy=true;var b=$('#ti-refresh');if(b)b.disabled=true;try{paint(await api('list'));lastLoaded=Date.now();schedule()}catch(e){fail(e)}finally{busy=false;if(b)b.disabled=false}}
async function review(btn){
 if(busy)return;var c=btn.closest('.ti-card'),status=btn.dataset.review,note=String($('[data-note]',c).value||'').trim();
 if(status==='approved'&&!confirm('Approve this? If there is a file, it becomes the public source agents can open once this town is published. Make sure it has no personal information.'))return;
 if(status==='rejected'&&!confirm('Reject this submission? Its file will be deleted.'))return;
 busy=true;c.querySelectorAll('button').forEach(function(x){x.disabled=true});
 try{await api('review',{id:c.dataset.id,status:status,note:note});toast(status==='approved'?'Approved. It goes out with the next town update.':'Rejected.');busy=false;await load()}
 catch(e){toast(e.message);busy=false;c.querySelectorAll('button').forEach(function(x){x.disabled=false})}
}
function install(){
 fetch(NEEDS_URL).then(function(r){return r.ok?r.json():{}}).then(function(j){Object.keys(j.needs||{}).forEach(function(k){labels[k]=j.needs[k].label})}).catch(function(){}).then(load);
 var r=$('#ti-refresh');if(r)r.addEventListener('click',load);
 document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-review]');if(b)review(b)});
 document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-lastLoaded>REFRESH_MS)load()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

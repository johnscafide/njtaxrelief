(function(){
'use strict';
var API='/api/watchdog-backoffice-reviews';
var REFRESH_MS=60000;
var refreshTimer=null;
var busy=false;
var lastLoadedAt=0;
var lastData=null;
var $=function(s,r){return (r||document).querySelector(s)};

function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function stars(value){var n=Math.max(1,Math.min(5,Number(value)||0));return '★★★★★'.slice(0,n)}
function date(value){if(!value)return '—';var d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function toast(message){var el=$('#br-toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('show')},2600)}

async function token(){
  try{
    if(window.njptrAccessReady)await Promise.resolve(window.njptrAccessReady);
    if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return'';
    var result=await window.NJPTRAccess.client().auth.getSession();
    return result&&result.data&&result.data.session&&result.data.session.access_token||'';
  }catch(_){return''}
}

async function api(action,payload){
  var accessToken=await token();
  if(!accessToken)throw new Error('Developer sign-in is required.');
  var body=Object.assign({action:action},payload||{});
  var response=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify(body)});
  var data={};try{data=await response.json()}catch(_){data={}}
  if(!response.ok)throw new Error(data.error||'Review moderation request failed.');
  return data;
}

function empty(message,detail){return '<div class="br-empty"><b>'+esc(message)+'</b><span>'+esc(detail||'')+'</span></div>'}
function pendingCard(review){return '<article class="br-review" data-review-id="'+esc(review.id)+'"><div class="br-review-main"><div class="br-review-top"><span class="br-stars" aria-label="'+esc(review.rating)+' out of 5 stars">'+stars(review.rating)+'</span><span class="br-rating">'+esc(review.rating)+'/5</span><span class="br-date">Submitted '+esc(date(review.submitted_at))+'</span></div><blockquote>“'+esc(review.comment)+'”</blockquote></div><div class="br-review-actions"><button type="button" class="br-btn br-btn-primary" data-review-action="approve" data-review-id="'+esc(review.id)+'">Approve & publish</button></div></article>'}
function approvedCard(review){return '<article class="br-review" data-review-id="'+esc(review.id)+'"><div class="br-review-main"><div class="br-review-top"><span class="br-stars" aria-label="'+esc(review.rating)+' out of 5 stars">'+stars(review.rating)+'</span><span class="br-rating">'+esc(review.rating)+'/5</span><span class="br-date">Approved '+esc(date(review.approved_at))+'</span></div><blockquote>“'+esc(review.comment)+'”</blockquote></div><div class="br-review-actions"><span class="br-published">Published</span><button type="button" class="br-btn br-btn-quiet" data-review-action="unpublish" data-review-id="'+esc(review.id)+'">Unpublish</button></div></article>'}

function outreachLabel(status){return({prepared:'Prepared',sent:'Sent',opened:'Opened',clicked:'Clicked',rated:'Rated',written_review:'Written review'})[status]||'Prepared'}
function outreachCard(row){
  var signal=row.review_submitted_at?'Rated '+date(row.review_submitted_at):row.first_clicked_at?'Clicked '+date(row.first_clicked_at):row.first_opened_at?'Opened '+date(row.first_opened_at):row.sent_at?'Sent '+date(row.sent_at):'Prepared '+date(row.prepared_at);
  var detail=[];
  if(Number(row.open_count||0)>0)detail.push(Number(row.open_count)+' open'+(Number(row.open_count)===1?'':'s'));
  if(Number(row.click_count||0)>0)detail.push(Number(row.click_count)+' click'+(Number(row.click_count)===1?'':'s'));
  if(row.last_click_rating)detail.push('last star '+row.last_click_rating+'/5');
  if(row.written_review)detail.push('written review');
  return '<article class="br-outreach-row"><div class="br-outreach-person"><b>'+esc(row.email||'Unknown account')+'</b><span>'+esc(row.name||row.campaign_key||'Review outreach')+'</span></div><div class="br-outreach-signal"><span class="br-status br-status-'+esc(row.status)+'">'+esc(outreachLabel(row.status))+'</span><small>'+esc(signal)+'</small></div><div class="br-outreach-detail">'+esc(detail.join(' · ')||'No engagement yet')+'</div></article>';
}

function paintOutreach(data){
  var rows=Array.isArray(data.outreach)?data.outreach:[];
  var summary=data.outreach_summary||{};
  ['prepared','sent','opened','clicked','rated','written'].forEach(function(key){var el=$('#br-funnel-'+key);if(el)el.textContent=Number(summary[key]||0).toLocaleString()});
  var list=$('#br-outreach-list');if(list)list.innerHTML=rows.length?rows.map(outreachCard).join(''):empty('No review outreach yet.','Tracked review-request emails will appear here.');
  var unsent=rows.filter(function(row){return !row.sent_at}).map(function(row){return row.id});
  var mark=$('#br-mark-sent');if(mark){mark.hidden=!unsent.length;mark.dataset.ids=unsent.join(',');mark.textContent=unsent.length===1?'Mark prepared email sent':'Mark '+unsent.length+' prepared emails sent';}
}

function paint(data){
  lastData=data;
  var pending=Array.isArray(data.pending)?data.pending:[];
  var approved=Array.isArray(data.approved)?data.approved:[];
  var pendingCount=Number(data.pending_count||pending.length)||0;
  $('#br-stat-pending').textContent=pendingCount.toLocaleString();
  $('#br-stat-approved').textContent=approved.length.toLocaleString();
  $('#br-pending-count').textContent=pendingCount.toLocaleString();
  $('#br-approved-count').textContent=approved.length.toLocaleString();
  var badge=$('#br-nav-badge');if(badge){badge.textContent=pendingCount.toLocaleString();badge.hidden=pendingCount<1;}
  $('#br-pending-list').innerHTML=pending.length?pending.map(pendingCard).join(''):empty('Nothing waiting for approval.','New written reviews will appear here automatically.');
  $('#br-approved-list').innerHTML=approved.length?approved.map(approvedCard).join(''):empty('No published written reviews yet.','Approve a pending comment to make it eligible for the public testimonial section.');
  paintOutreach(data);
}

function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(load,REFRESH_MS)}
async function load(){
  if(busy)return;busy=true;
  var button=$('#br-refresh');if(button)button.disabled=true;
  try{var data=await api('list');paint(data);lastLoadedAt=Date.now();schedule();}
  catch(error){$('#br-pending-list').innerHTML=empty('Could not load reviews.',error.message);$('#br-approved-list').innerHTML=empty('Review service unavailable.','Refresh after confirming your developer session.');var outreach=$('#br-outreach-list');if(outreach)outreach.innerHTML=empty('Could not load outreach analytics.',error.message);toast(error.message)}
  finally{busy=false;if(button)button.disabled=false;}
}

async function moderate(action,id,button){
  if(!id||busy)return;busy=true;if(button)button.disabled=true;
  try{await api(action,{review_id:id});toast(action==='approve'?'Review approved and published.':'Review removed from public display.');busy=false;await load();}
  catch(error){toast(error.message);busy=false;if(button)button.disabled=false;}
}

async function markSent(button){
  if(busy||!button)return;var ids=String(button.dataset.ids||'').split(',').filter(Boolean);if(!ids.length)return;
  busy=true;button.disabled=true;
  try{var data=await api('mark_outreach_sent',{outreach_ids:ids});if(lastData){lastData.outreach=data.outreach;lastData.outreach_summary=data.outreach_summary;paint(lastData)}toast('Review outreach marked sent.');}
  catch(error){toast(error.message)}
  finally{busy=false;button.disabled=false;}
}

function install(){
  var refresh=$('#br-refresh');if(refresh)refresh.addEventListener('click',load);
  var mark=$('#br-mark-sent');if(mark)mark.addEventListener('click',function(){markSent(mark)});
  document.addEventListener('click',function(event){var button=event.target&&event.target.closest&&event.target.closest('[data-review-action]');if(!button)return;event.preventDefault();moderate(button.getAttribute('data-review-action'),button.getAttribute('data-review-id'),button)});
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-lastLoadedAt>REFRESH_MS)load()});
  load();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

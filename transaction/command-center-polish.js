(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_COMMAND_CENTER_POLISH__)return;
window.__WATCHDOG_TRANSACTION_COMMAND_CENTER_POLISH__=true;

function numberFromWidth(node){
  if(!node)return null;
  var raw=String(node.style&&node.style.width||'').trim();
  var n=parseFloat(raw);
  return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;
}

function polishList(){
  var list=document.getElementById('tx-list');
  if(!list)return;
  list.querySelectorAll('.tx-list-card:not([data-command-polished])').forEach(function(card){
    var addressNode=card.querySelector('.tx-list-address');
    if(!addressNode)return;
    var address=String(addressNode.textContent||'').trim()||'Property';
    var stateNode=card.querySelector('.tx-mini-state');
    var state=stateNode?String(stateNode.className||'').replace('tx-mini-state','').trim().split(/\s+/)[0]:'';
    var score=numberFromWidth(card.querySelector('.tx-list-progress i'));
    var active=card.classList.contains('active');
    var scoreText=(score===0&&!active)?'—':String(score==null?'—':score);

    // content-architecture: dynamic — this compact row is derived from live transaction address, readiness and state.
    card.innerHTML=''
      +'<div class="tx-file-row">'
      +  '<span class="tx-file-icon" aria-hidden="true"><i class="fas fa-briefcase"></i></span>'
      +  '<span class="tx-file-address" title="'+address.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'">'+address.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>'
      +  '<span class="tx-file-score" '+(scoreText==='—'?'data-empty="true"':'')+' aria-label="Readiness score '+(scoreText==='—'?'not yet calculated':scoreText)+'">'+scoreText+'</span>'
      +'</div>';
    if(state)card.classList.add('state-'+state);
    card.dataset.commandPolished='true';
  });
}

function ensureReviewStamp(){
  var alert=document.getElementById('tx-intel-alert');
  if(!alert)return null;
  var copyWrap=alert.querySelector(':scope > div');
  if(!copyWrap)return null;
  var stamp=document.getElementById('tx-review-checked');
  if(!stamp){
    stamp=document.createElement('span');
    stamp.id='tx-review-checked';
    stamp.className='tx-review-checked';
    copyWrap.appendChild(stamp);
  }
  return stamp;
}

function syncReviewStamp(){
  var stamp=ensureReviewStamp();
  var title=document.getElementById('tx-intel-title');
  if(!stamp||!title)return;
  var text=String(title.textContent||'');
  var match=text.match(/checked\s+(.+)$/i);
  var value=match?'Last checked '+match[1]:'Not checked yet';
  if(stamp.textContent!==value)stamp.textContent=value;
}

function relabelPortfolio(){
  var aside=document.querySelector('.tx-portfolio');
  if(!aside)return;
  var eyebrow=aside.querySelector('.tx-portfolio-head .tx-eyebrow');
  var heading=aside.querySelector('.tx-portfolio-head h3');
  if(eyebrow&&eyebrow.textContent!=='TRANSACTION FILES')eyebrow.textContent='TRANSACTION FILES';
  if(heading&&heading.textContent!=='Deal folders')heading.textContent='Deal folders';
}

function run(){
  relabelPortfolio();
  polishList();
  syncReviewStamp();
}

var scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(function(){scheduled=false;run()});
}

var observer=new MutationObserver(function(mutations){
  for(var i=0;i<mutations.length;i++){
    var target=mutations[i].target;
    if(target&&target.nodeType===1&&(
      target.id==='tx-list'||target.id==='tx-intel-title'||
      (target.closest&&target.closest('#tx-list,#tx-intel-alert'))
    )){schedule();return;}
  }
});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',function(){
    run();
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  },{once:true});
}else{
  run();
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
}
})();

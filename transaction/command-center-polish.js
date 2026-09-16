(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_COMMAND_CENTER_POLISH_V2__)return;
window.__WATCHDOG_TRANSACTION_COMMAND_CENTER_POLISH_V2__=true;

var running=false;
var scheduled=false;

function clean(v){return String(v==null?'':v).trim()}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function numberFromWidth(node){
  if(!node)return null;
  var raw=String(node.style&&node.style.width||'').trim();
  var n=parseFloat(raw);
  return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;
}
function truncate(v,n){var s=clean(v).replace(/\s+/g,' ');return s.length>n?s.slice(0,n-1).trim()+'…':s}

function polishList(){
  var list=document.getElementById('tx-list');
  if(!list)return;
  list.querySelectorAll('.tx-list-card:not([data-command-polished])').forEach(function(card){
    var addressNode=card.querySelector('.tx-list-address');
    if(!addressNode)return;
    var address=clean(addressNode.textContent)||'Property';
    var stateNode=card.querySelector('.tx-mini-state');
    var state='';
    if(stateNode){
      ['ready','review','attention','blocked'].some(function(name){if(stateNode.classList.contains(name)){state=name;return true}return false});
    }
    var score=numberFromWidth(card.querySelector('.tx-list-progress i'));
    var active=card.classList.contains('active');
    var scoreText=(score===0&&!active)?'—':String(score==null?'—':score);
    card.innerHTML=''
      +'<div class="tx-file-row">'
      +  '<span class="tx-file-icon" aria-hidden="true"><i class="fas fa-folder"></i></span>'
      +  '<span class="tx-file-address" title="'+esc(address)+'">'+esc(address)+'</span>'
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
  var text=clean(title.textContent);
  var match=text.match(/checked\s+(.+)$/i);
  var value=match?'Last checked '+match[1]:'Not checked yet';
  if(stamp.textContent!==value)stamp.textContent=value;
}

function ensureReviewToolbar(){
  var app=document.getElementById('tx-app');
  var button=document.getElementById('tx-run-review');
  var stamp=ensureReviewStamp();
  if(!app||!button||!stamp)return;
  var toolbar=document.getElementById('tx-review-toolbar');
  if(!toolbar){
    toolbar=document.createElement('div');
    toolbar.id='tx-review-toolbar';
    toolbar.className='tx-review-toolbar';
    var kpis=app.querySelector('.tx-kpis');
    app.insertBefore(toolbar,kpis||app.firstChild);
  }
  if(button.parentNode!==toolbar)toolbar.appendChild(button);
  if(stamp.parentNode!==toolbar)toolbar.appendChild(stamp);
  if(/run review/i.test(button.textContent||''))button.innerHTML='<i class="fas fa-rotate"></i> Refresh review';
}

function ensureHomeIcon(){
  var title=document.querySelector('.tx-property-title');
  if(!title||title.querySelector('.tx-approved-home'))return;
  var icon=document.createElement('span');
  icon.className='tx-approved-home';
  icon.setAttribute('aria-hidden','true');
  icon.innerHTML='<i class="fas fa-house"></i>';
  title.insertBefore(icon,title.firstChild);
}

function parseMeta(){
  var text=clean(document.getElementById('tx-detail-meta')&&document.getElementById('tx-detail-meta').textContent);
  var municipality='—',county='—';
  var mm=text.match(/Municipality:\s*([^·]+)/i);
  var cm=text.match(/([^·]+County)/i);
  if(mm)municipality=clean(mm[1]);
  else if(text)municipality=clean(text.split('·')[0]);
  if(cm)county=clean(cm[1]);
  return {text:text,municipality:municipality,county:county};
}

function ensurePropertyMetrics(){
  var head=document.querySelector('.tx-detail-head');
  if(!head)return null;
  ensureHomeIcon();
  var box=head.querySelector('.tx-approved-metrics');
  if(!box){
    box=document.createElement('div');
    box.className='tx-approved-metrics';
    box.innerHTML=''
      +'<div class="tx-approved-metric"><span>Readiness score</span><b data-approved-value="readiness">—</b></div>'
      +'<div class="tx-approved-metric"><span>Status</span><b data-approved-value="status">—</b></div>'
      +'<div class="tx-approved-metric"><span>Municipality</span><b data-approved-value="municipality">—</b></div>'
      +'<div class="tx-approved-metric"><span>Last checked</span><b data-approved-value="checked">—</b></div>';
    head.appendChild(box);
  }
  return box;
}

function syncPropertyMetrics(){
  var box=ensurePropertyMetrics();
  if(!box)return;
  var score=clean(document.getElementById('tx-readiness-score')&&document.getElementById('tx-readiness-score').textContent)||'—';
  var status=clean(document.getElementById('tx-readiness-label')&&document.getElementById('tx-readiness-label').textContent)||'Review';
  var meta=parseMeta();
  var stamp=clean(document.getElementById('tx-review-checked')&&document.getElementById('tx-review-checked').textContent).replace(/^Last checked\s*/i,'')||'—';
  var vals={readiness:score==='—'?'—':score+' / 100',status:status,municipality:meta.municipality,checked:stamp};
  Object.keys(vals).forEach(function(key){var n=box.querySelector('[data-approved-value="'+key+'"]');if(n&&n.textContent!==vals[key])n.textContent=vals[key]});
}

var GROUPS=[
  {key:'tax',title:'Property Tax',icon:'fa-file-invoice-dollar',patterns:[/property tax/i,/tax sale/i,/delinquen/i]},
  {key:'deed',title:'Deed / Recording',icon:'fa-file-signature',patterns:[/ownership/i,/vesting/i,/deed/i,/judgment/i,/recorded lien/i,/lis pendens/i,/title filing/i]},
  {key:'municipal-lien',title:'Municipal Lien / Clearance',icon:'fa-building-columns',patterns:[/municipal lien/i,/clearance/i]},
  {key:'cco',title:'Certificate of Occupancy / Resale',icon:'fa-shield-house',patterns:[/certificate of occupancy/i,/resale/i,/permit.*certificate/i,/permits.*certificates/i]},
  {key:'fire',title:'Smoke / CO / Fire',icon:'fa-fire-flame-curved',patterns:[/smoke/i,/fire cert/i]},
  {key:'utilities',title:'Water / Sewer',icon:'fa-droplet',patterns:[/water/i,/sewer/i,/electric/i,/solar/i,/utility/i]},
  {key:'violations',title:'Open Violations',icon:'fa-building-shield',patterns:[/violation/i,/code \/ violations/i]},
  {key:'municipal-services',title:'Municipal Services',icon:'fa-trash-can',patterns:[/municipal services/i,/move-in/i,/trash/i,/recycling/i]},
  {key:'environment',title:'Environmental / Deed Controls',icon:'fa-leaf',patterns:[/environment/i,/deed control/i,/flood/i,/remediation/i]}
];

function cardTitle(card){
  var n=card.querySelector('strong');
  return clean(n&&n.textContent);
}
function matchesGroup(card,group){
  var t=cardTitle(card);
  return group.patterns.some(function(re){return re.test(t)});
}
function groupMembers(group,all){return all.filter(function(card){return matchesGroup(card,group)})}

function meaningfulLines(card){
  var lines=[];
  card.querySelectorAll('.tx-evidence-row').forEach(function(row){
    if(lines.length>=2)return;
    var label=clean(row.querySelector('span')&&row.querySelector('span').textContent);
    var value=clean(row.querySelector('b')&&row.querySelector('b').textContent);
    if(label||value)lines.push(truncate([label,value].filter(Boolean).join(' '),62));
  });
  if(lines.length<2){
    card.querySelectorAll('.tx-evidence-list li').forEach(function(li){if(lines.length<2){var t=truncate(li.textContent,62);if(t)lines.push(t)}});
  }
  if(lines.length<2){
    var empty=card.querySelector('.tx-evidence-empty b');
    var emptySub=card.querySelector('.tx-evidence-empty span');
    if(empty){var a=truncate(empty.textContent,62);if(a)lines.push(a)}
    if(lines.length<2&&emptySub){var b=truncate(emptySub.textContent,62);if(b)lines.push(b)}
  }
  if(lines.length<2){
    var sourceCopy=card.querySelector('.tx-source-copy');
    if(sourceCopy){var c=truncate(sourceCopy.textContent,70);if(c)lines.push(c)}
  }
  if(lines.length<2){
    var record=card.querySelector('.tx-record');
    if(record){var d=truncate(record.textContent,62);if(d)lines.push(d)}
  }
  return lines.slice(0,2);
}

function groupStatus(members){
  if(members.some(function(c){return c.classList.contains('attention')}))return 'issue';
  if(members.some(function(c){return c.classList.contains('review')||c.classList.contains('search')||c.classList.contains('missing')}))return 'caution';
  return '';
}
function groupSummary(members){
  var lines=[];
  members.forEach(function(card){
    if(lines.length>=2)return;
    meaningfulLines(card).forEach(function(line){if(lines.length<2&&line&&!lines.includes(line))lines.push(line)});
  });
  if(!lines.length){
    var prov=members[0]&&members[0].querySelector('.tx-source-provenance span');
    if(prov)lines.push(truncate(prov.textContent,62));
  }
  if(!lines.length)lines.push('Open evidence details');
  return lines.slice(0,2);
}

function collectGroupMembers(key){
  var grid=document.querySelector('#tx-source-sweep .tx-source-grid');
  if(!grid)return[];
  var all=Array.from(grid.querySelectorAll(':scope > .tx-source-card'));
  var group=GROUPS.find(function(g){return g.key===key});
  if(!group)return[];
  var members=groupMembers(group,all);
  if(key==='deed'){
    all.forEach(function(card){
      var claimed=GROUPS.some(function(g){return g.key!=='deed'&&matchesGroup(card,g)});
      var title=cardTitle(card);
      if(!claimed&&!/closing review/i.test(title)&&!members.includes(card))members.push(card);
    });
  }
  return members;
}

function buildEvidenceGrid(){
  var sweep=document.getElementById('tx-source-sweep');
  var original=sweep&&sweep.querySelector('.tx-source-grid');
  if(!sweep||!original)return;
  var all=Array.from(original.querySelectorAll(':scope > .tx-source-card'));
  if(!all.length)return;
  var approved=sweep.querySelector('.tx-approved-evidence-grid');
  if(!approved){approved=document.createElement('div');approved.className='tx-approved-evidence-grid';original.parentNode.insertBefore(approved,original)}
  var html=GROUPS.map(function(group){
    var members=groupMembers(group,all);
    if(group.key==='deed'){
      all.forEach(function(card){
        var claimed=GROUPS.some(function(g){return g.key!=='deed'&&matchesGroup(card,g)});
        var title=cardTitle(card);
        if(!claimed&&!/closing review/i.test(title)&&!members.includes(card))members.push(card);
      });
    }
    var state=groupStatus(members),lines=groupSummary(members);
    var stateText=state==='issue'?'Issue':state==='caution'?'Review':'';
    return '<article class="tx-approved-evidence-card '+(state==='issue'?'issue':'')+'" data-evidence-group="'+group.key+'" tabindex="0" role="button" aria-label="Open '+esc(group.title)+' evidence">'
      +'<span class="tx-approved-evidence-icon" aria-hidden="true"><i class="fas '+group.icon+'"></i></span>'
      +'<div class="tx-approved-evidence-main"><div class="tx-approved-evidence-titleline"><strong>'+esc(group.title)+'</strong>'+(stateText?'<span class="tx-approved-evidence-state '+state+'">'+stateText+'</span>':'')+'</div>'
      +'<div class="tx-approved-evidence-summary">'+lines.map(function(line){return'<span>'+esc(line)+'</span>'}).join('')+'</div></div>'
      +'<span class="tx-approved-evidence-arrow" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>'
      +'</article>';
  }).join('');
  if(approved.innerHTML!==html)approved.innerHTML=html;
}

function openEvidenceGroup(key){
  var group=GROUPS.find(function(g){return g.key===key});
  var members=collectGroupMembers(key);
  if(!group||!members.length)return;
  var layer=document.getElementById('tx-modal-layer');
  var modal=document.getElementById('tx-modal');
  var content=document.getElementById('tx-modal-content');
  if(!layer||!modal||!content)return;
  var address=clean(document.getElementById('tx-detail-address')&&document.getElementById('tx-detail-address').textContent);
  content.innerHTML='<div class="tx-deep-dive"><div class="tx-deep-dive-head"><h2>'+esc(group.title)+'</h2><p>'+esc(address)+'</p></div><div class="tx-deep-dive-stack"></div></div>';
  var stack=content.querySelector('.tx-deep-dive-stack');
  members.forEach(function(card){var clone=card.cloneNode(true);clone.removeAttribute('style');stack.appendChild(clone)});
  modal.classList.add('tx-approved-modal');
  layer.hidden=false;
  document.body.classList.add('tx-modal-open');
}

function closeApprovedModal(){
  var layer=document.getElementById('tx-modal-layer');
  var modal=document.getElementById('tx-modal');
  if(layer&&!layer.hidden)layer.hidden=true;
  if(modal)modal.classList.remove('tx-approved-modal');
  document.body.classList.remove('tx-modal-open');
}

function arrangeEvidence(){
  var tabs=document.querySelector('.tx-tabs');
  var sweep=document.getElementById('tx-source-sweep');
  if(!tabs||!sweep)return;
  if(tabs.nextElementSibling!==sweep)tabs.parentNode.insertBefore(sweep,tabs.nextSibling);
  var overview=tabs.querySelector('[data-tx-tab="overview"]');
  if(overview&&/overview/i.test(overview.textContent||''))overview.innerHTML='<i class="fas fa-grid-2"></i> Evidence';
  sweep.hidden=!!(overview&&overview.getAttribute('aria-selected')!=='true');
  buildEvidenceGrid();
}

function polishOverview(){
  var grid=document.querySelector('[data-tx-panel="overview"] .tx-overview-grid');
  if(!grid)return;
  grid.querySelectorAll('.tx-card').forEach(function(card){
    var h=card.querySelector('h3');
    var t=clean(h&&h.textContent);
    if(/evidence coverage/i.test(t))card.classList.add('tx-hide-card');
    if(/what needs attention now/i.test(t))h.textContent='What needs attention';
    var link=card.querySelector('.tx-link-btn');
    if(link&&/open checklist/i.test(link.textContent||''))link.innerHTML='View all <i class="fas fa-arrow-right"></i>';
  });
  var details=document.getElementById('tx-approved-transaction-details');
  if(!details){
    details=document.createElement('article');
    details.id='tx-approved-transaction-details';
    details.className='tx-approved-transaction-details';
    grid.appendChild(details);
  }
  var address=clean(document.getElementById('tx-detail-address')&&document.getElementById('tx-detail-address').textContent)||'—';
  var score=clean(document.getElementById('tx-readiness-score')&&document.getElementById('tx-readiness-score').textContent)||'—';
  var status=clean(document.getElementById('tx-readiness-label')&&document.getElementById('tx-readiness-label').textContent)||'—';
  var meta=parseMeta();
  var parcel=clean(document.querySelector('.tx-source-sweep-meta')&&document.querySelector('.tx-source-sweep-meta').textContent)||'—';
  var checked=clean(document.getElementById('tx-review-checked')&&document.getElementById('tx-review-checked').textContent).replace(/^Last checked\s*/i,'')||'—';
  var rows=[['Address',address],['Status',status],['Readiness',score==='—'?'—':score+' / 100'],['Municipality',meta.municipality],['County',meta.county],['Parcel',parcel],['Last checked',checked]];
  var html='<h3>Transaction details</h3><div class="tx-approved-detail-grid">'+rows.map(function(r){return'<div class="tx-approved-detail-pair"><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>'}).join('')+'</div>';
  if(details.innerHTML!==html)details.innerHTML=html;
}

function simplifyPagebar(){
  var bar=document.querySelector('.wdx-pagebar');
  if(!bar)return;
  var h=bar.querySelector('h1');
  if(h&&h.textContent!=='Transaction Command Center')h.textContent='Transaction Command Center';
}

function run(){
  if(running)return;
  running=true;
  try{
    simplifyPagebar();
    polishList();
    syncReviewStamp();
    ensureReviewToolbar();
    syncPropertyMetrics();
    arrangeEvidence();
    polishOverview();
  }finally{running=false}
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(function(){scheduled=false;run()});
}

document.addEventListener('click',function(event){
  var card=event.target.closest&&event.target.closest('[data-evidence-group]');
  if(card){event.preventDefault();openEvidenceGroup(card.getAttribute('data-evidence-group'));return}
  var tab=event.target.closest&&event.target.closest('.tx-tabs [data-tx-tab]');
  if(tab)setTimeout(function(){arrangeEvidence();polishOverview()},0);
  var close=event.target.closest&&event.target.closest('[data-tx-action="close-modal"]');
  if(close&&document.getElementById('tx-modal')&&document.getElementById('tx-modal').classList.contains('tx-approved-modal'))setTimeout(closeApprovedModal,0);
});

document.addEventListener('keydown',function(event){
  var card=event.target.closest&&event.target.closest('[data-evidence-group]');
  if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openEvidenceGroup(card.getAttribute('data-evidence-group'))}
  if(event.key==='Escape'&&document.getElementById('tx-modal')&&document.getElementById('tx-modal').classList.contains('tx-approved-modal'))closeApprovedModal();
});

var observer=new MutationObserver(function(mutations){
  if(running)return;
  for(var i=0;i<mutations.length;i++){
    var target=mutations[i].target;
    if(!target)continue;
    var el=target.nodeType===1?target:target.parentElement;
    if(!el)continue;
    if(el.closest&&el.closest('#tx-list,#tx-source-sweep,#tx-detail,#tx-intel-title,#tx-review-toolbar')){schedule();return}
  }
});

function start(){
  run();
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-selected','class','style']});
  setTimeout(run,250);
  setTimeout(run,900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

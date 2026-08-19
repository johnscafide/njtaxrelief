/* Watchdog Intelligence density runtime.
   Supporting pages stay compact and action-first; full evidence is progressive disclosure. */
(function(){
'use strict';
if(window.__WATCHDOG_INTELLIGENCE_DENSITY__)return;
window.__WATCHDOG_INTELLIGENCE_DENSITY__=true;

var analystExpanded=false,timer=0;
function text(node){return String(node&&node.textContent||'').replace(/\s+/g,' ').trim()}
function short(value,max){value=String(value||'').replace(/\s+/g,' ').trim();if(!value)return'';var first=value.match(/^(.+?[.!?])(?:\s|$)/);var out=first?first[1]:value;if(out.length>(max||150))out=out.slice(0,(max||150)-1).trimEnd()+'…';return out}
function ensureCss(){var href='/property/css/watchdog-intelligence-density.css';if(document.querySelector('link[href="'+href+'"]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
function supportingSurface(){var path=location.pathname.replace(/\/+$/,'');if(/\/property\/(?:intelligence|daily-intelligence|data-center|scan)$/.test(path))return false;return true}
function compactContext(root){
  if(!root||!supportingSurface()||root.classList.contains('wdcx-agent_control'))return;
  root.classList.add('wdcx-compact');
  var items=Array.prototype.slice.call(root.querySelectorAll('.wdcx-item'));
  items.forEach(function(item,i){item.classList.toggle('wd-density-extra',i>0)});
  var more=root.querySelector('.wdcx-more');
  if(more){var existing=text(more),extra=/\+(\d+)/.exec(existing),total=items.length+(extra?Number(extra[1]):0);more.textContent=total>1?'Review all '+total+' current suggestions':'Inspect this suggestion'}
}
function reason(card){return short(text(card&&card.querySelector('p')),135)}
function makeAnalystSummary(panel){
  if(!panel||!supportingSurface())return;
  panel.classList.add('wdai-compact');
  var old=panel.querySelector('.wdai-compact-summary');if(old)old.remove();
  var money=panel.querySelector('.wdai-card.money'),motivation=panel.querySelector('.wdai-card.motivation'),evidence=panel.querySelector('.wdai-card.evidence'),grid=panel.querySelector('.wdai-grid'),next=panel.querySelector('.wdai-next');
  if(!grid||!next)return;
  var reasons=[reason(motivation),reason(money),reason(evidence)].filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i}).slice(0,3);
  var action=short(text(next.querySelector('h3')),180)||'Open the evidence before deciding what to do next.';
  var headline=reasons[0]||'No high-urgency governed finding is present right now.';
  var summary=document.createElement('section');summary.className='wdai-compact-summary';
  summary.innerHTML='<div class="wd-density-copy"><span>WATCHDOG DECISION BRIEF</span><h3>'+escapeHtml(headline)+'</h3>'+(reasons.length?'<ul class="wd-density-reasons">'+reasons.map(function(r){return'<li><i class="fas fa-circle-check"></i><span>'+escapeHtml(r)+'</span></li>'}).join('')+'</ul>':'')+'<div class="wd-density-action"><b>Next:</b> '+escapeHtml(action)+'</div></div><button type="button" class="wd-density-toggle" aria-expanded="'+(analystExpanded?'true':'false')+'">'+(analystExpanded?'Collapse reasoning':'Inspect reasoning')+'</button>';
  grid.parentNode.insertBefore(summary,grid);
  setAnalystExpanded(panel,analystExpanded);
  var button=summary.querySelector('.wd-density-toggle');if(button)button.addEventListener('click',function(){analystExpanded=!analystExpanded;setAnalystExpanded(panel,analystExpanded);button.setAttribute('aria-expanded',analystExpanded?'true':'false');button.textContent=analystExpanded?'Collapse reasoning':'Inspect reasoning'})
}
function setAnalystExpanded(panel,expanded){
  var grid=panel.querySelector('.wdai-grid'),next=panel.querySelector('.wdai-next');panel.classList.toggle('wd-density-expanded',!!expanded);if(grid)grid.hidden=!expanded;if(next)next.hidden=!expanded
}
function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function apply(){
  ensureCss();
  compactContext(document.getElementById('wdcx-root'));
  var analyst=document.querySelector('#hm-body .ai.wdai,[data-watchdog-analyst-intel].wdai');if(analyst)makeAnalystSummary(analyst)
}
function observe(){var target=document.getElementById('wd4-root')||document.getElementById('hm-body')||document.querySelector('main')||document.body;if(!target)return;new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(apply,90)}).observe(target,{childList:true,subtree:true})}
function boot(){apply();observe();window.addEventListener('watchdog:context-suggestions',function(){setTimeout(apply,20)});window.addEventListener('watchdog:context-refresh',function(){setTimeout(apply,120)})}
window.WatchdogIntelligenceDensity={apply:apply,compactContext:compactContext,compactAnalyst:makeAnalystSummary,contract:'watchdog-intelligence-density-v1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

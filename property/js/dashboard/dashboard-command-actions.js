(function(){
'use strict';
if(window.__WATCHDOG_DASHBOARD_COMMAND_ACTIONS__)return;
window.__WATCHDOG_DASHBOARD_COMMAND_ACTIONS__=true;

var ACTION_API='/api/dashboard-intelligence-action';
var db=null;
var state={user:null,props:[],scores:[],observations:[],findings:[],events:[],outcomes:[],loaded:false};
var refreshTimer=null;

function q(s,r){return(r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function num(v){v=Number(v);return Number.isFinite(v)?v:0}
function arr(v){return Array.isArray(v)?v:[]}
function text(v){if(v==null)return'';if(typeof v==='string')return v;if(Array.isArray(v))return v.map(text).filter(Boolean).join(' · ');if(typeof v==='object')return Object.values(v).map(text).filter(Boolean).join(' · ');return String(v)}
function pretty(v){return String(v||'review').replace(/[_-]/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()})}
function when(v){var t=new Date(v).getTime();if(!Number.isFinite(t))return'unknown';var h=Math.floor((Date.now()-t)/36e5);return h<1?'just now':h<24?h+'h ago':Math.floor(h/24)+'d ago'}
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient()}catch(_){ }return db}
function settled(x){return x&&x.status==='fulfilled'&&x.value&&!x.value.error&&Array.isArray(x.value.data)?x.value.data:[]}
function materialEvent(v){return /high|critical|urgent|warning|review/i.test(v&&v.severity||'')||Math.abs(num(v&&v.delta_numeric))>0}
function safeUrl(v){try{var u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return''}}
function ftitle(f){return f&&f.property_address||f&&f.pams_pin||pretty(f&&f.opportunity_type)}
function byScore(a,b){return num(b&&b.score)-num(a&&a.score)}

function css(){
  if(q('#wdq-command-actions-css'))return;
  var s=document.createElement('style');s.id='wdq-command-actions-css';s.textContent=`
#wd-paid-v2 .wdp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))!important}
#wd-paid-v2 .wdp-kpi[data-wdq-action]{cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease;position:relative;padding-bottom:35px}
#wd-paid-v2 .wdp-kpi[data-wdq-action]:hover{border-color:#c6d5eb;box-shadow:0 8px 22px rgba(20,33,61,.07);transform:translateY(-1px)}
#wd-paid-v2 .wdp-kpi[data-wdq-action]:focus{outline:3px solid rgba(47,109,246,.18);outline-offset:2px}
#wd-paid-v2 .wdp-kpi[data-wdq-action]:after{content:'Open review  →';position:absolute;left:18px;bottom:13px;color:#3568ca;font:800 10px/1 Inter,sans-serif;letter-spacing:.02em}
.wdq-score-stage{margin:0 0 14px;display:block}
.wdq-score-label{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;color:#6f7e91;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.085em;text-transform:uppercase}
.wdq-score-label span:last-child{font-weight:600;letter-spacing:0;text-transform:none;color:#8793a3}
html.wd-paid-v3 #wdp-score-stage .wd4-card[data-card-id="score"]{display:block!important;width:100%!important;min-height:190px!important;height:auto!important;max-height:none!important;margin:0!important;grid-column:auto!important}
#wdp-score-stage .wd-score-spotlight-cta{font-size:10px!important}
.wdq-row-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.wdq-row-actions button{min-height:29px!important;padding:0 8px!important;border-radius:7px!important;background:#f2f5f9!important;border:1px solid #e0e6ee!important;color:#324866!important;font:750 10px Inter,sans-serif!important}
.wdq-row-actions button.primary{background:#17305f!important;color:#fff!important;border-color:#17305f!important}
.wdq-row-actions button.done{background:#eef7f3!important;color:#11715a!important;border-color:#d5ece4!important}
.wdq-review-state{display:inline-flex;align-items:center;gap:4px;margin-left:7px;padding:3px 6px;border-radius:999px;background:#eef7f3;color:#11715a;font:800 9px Inter,sans-serif;vertical-align:middle}
.wdq-drawer-wrap{position:fixed;inset:0;z-index:1400;pointer-events:none}
.wdq-drawer-wrap.open{pointer-events:auto}
.wdq-back{position:absolute;inset:0;border:0;background:rgba(8,18,35,.42);opacity:0;transition:opacity .18s ease}
.wdq-drawer-wrap.open .wdq-back{opacity:1}
.wdq-drawer{position:absolute;right:0;top:0;bottom:0;width:min(760px,96vw);background:#fff;box-shadow:-24px 0 58px rgba(8,18,35,.18);transform:translateX(102%);transition:transform .22s ease;display:flex;flex-direction:column}
.wdq-drawer-wrap.open .wdq-drawer{transform:none}
.wdq-drawer>header{height:68px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 18px;border-bottom:1px solid #e5eaf0}
.wdq-drawer>header span{display:block;color:#3568ca;font:800 9px Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase}
.wdq-drawer>header h2{margin:4px 0 0;color:#14213d;font:800 19px/1.1 Inter,sans-serif;letter-spacing:-.02em}
.wdq-drawer>header button{width:38px;height:38px;border:0;border-radius:9px;background:#f3f6fa;color:#263a5d;cursor:pointer}
.wdq-drawer-body{padding:18px;overflow:auto;flex:1;background:#f8fafc}
.wdq-section{margin-bottom:14px;padding:15px;border:1px solid #e0e6ee;border-radius:13px;background:#fff}
.wdq-section h3{margin:0 0 9px;color:#1c2d49;font:800 13px/1.2 Inter,sans-serif}
.wdq-section p{margin:0;color:#6d7b8e;font:500 12px/1.5 Inter,sans-serif}
.wdq-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.wdq-metric{padding:12px;border-radius:10px;background:#f4f7fb}
.wdq-metric b{display:block;color:#172542;font:800 22px/1 Inter,sans-serif;font-variant-numeric:tabular-nums}
.wdq-metric span{display:block;margin-top:5px;color:#758296;font:650 10px/1.25 Inter,sans-serif}
.wdq-band{display:grid;grid-template-columns:150px minmax(0,1fr) 38px;align-items:center;gap:9px;padding:7px 0}
.wdq-band span{color:#506078;font:650 11px Inter,sans-serif}
.wdq-band i{height:8px;border-radius:999px;background:#e8edf3;overflow:hidden;display:block}
.wdq-band i b{display:block;height:100%;border-radius:999px;background:#2f6df6}
.wdq-band strong{text-align:right;color:#273957;font:800 11px Inter,sans-serif}
.wdq-list{display:grid;gap:7px}
.wdq-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 0;border-top:1px solid #edf1f5}
.wdq-item:first-child{border-top:0;padding-top:0}
.wdq-item:last-child{padding-bottom:0}
.wdq-item b{display:block;color:#243550;font:750 12px/1.3 Inter,sans-serif}
.wdq-item small{display:block;margin-top:3px;color:#7a8798;font:500 10.5px/1.4 Inter,sans-serif}
.wdq-value{padding:5px 7px;border-radius:7px;background:#eef4ff;color:#315aab;font:800 11px Inter,sans-serif;white-space:nowrap}
.wdq-value.down{background:#fff0f2;color:#a33c4d}.wdq-value.up{background:#eef7f3;color:#11715a}
.wdq-detail-title{font:800 18px/1.2 Inter,sans-serif;color:#172542;margin:0 0 5px}.wdq-detail-sub{color:#6f7d90;font:600 11px/1.4 Inter,sans-serif;margin-bottom:13px}
.wdq-evidence{margin:0;padding-left:18px;color:#465872;font:500 11.5px/1.48 Inter,sans-serif}.wdq-evidence li+li{margin-top:6px}
.wdq-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.wdq-actions button,.wdq-actions a{min-height:36px;padding:0 11px;border-radius:8px;border:1px solid #dce3ec;background:#fff;color:#2d4266;font:800 11px Inter,sans-serif;text-decoration:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.wdq-actions .primary{background:#17305f;color:#fff;border-color:#17305f}.wdq-actions .danger{color:#9b3c4c;background:#fff5f6;border-color:#f1dadd}
.wdq-empty{padding:18px;border:1px dashed #d9e0e8;border-radius:11px;background:#fafbfd;color:#738095;font:600 11.5px/1.5 Inter,sans-serif}
.wdq-toast{position:fixed;right:18px;bottom:18px;z-index:1500;max-width:min(380px,calc(100vw - 36px));padding:11px 13px;border-radius:10px;background:#172542;color:#fff;box-shadow:0 12px 34px rgba(8,18,35,.22);font:700 11px/1.4 Inter,sans-serif}
@media(max-width:900px){#wd-paid-v2 .wdp-kpis{grid-template-columns:1fr!important}.wdq-drawer{width:100vw}.wdq-metrics{grid-template-columns:1fr}.wdq-band{grid-template-columns:115px minmax(0,1fr) 34px}.wdq-score-stage{margin-left:0;margin-right:0}}
`;
  document.head.appendChild(s)
}

async function load(){
  var c=client();if(!c)return false;
  var se=await c.auth.getSession();state.user=se&&se.data&&se.data.session&&se.data.session.user;if(!state.user)return false;
  var p=await c.from('saved_properties').select('pams_pin,address,town,county,kind,created_at').eq('user_id',state.user.id).limit(2500);
  state.props=!p.error&&Array.isArray(p.data)?p.data:[];
  var pins=Array.from(new Set(state.props.map(function(x){return x.pams_pin}).filter(Boolean)));
  var parts=await Promise.allSettled([
    pins.length?c.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,computed_at').in('pams_pin',pins):Promise.resolve({data:[]}),
    pins.length?c.from('score_observations').select('pams_pin,marker_id,score,observed_at').in('pams_pin',pins).in('marker_id',['watchdog.score','watchdog.watchdog_score']).order('observed_at',{ascending:true}).limit(4000):Promise.resolve({data:[]}),
    c.from('intelligence_findings').select('id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,recommended_actions,narrative,created_at').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(1000),
    c.from('property_update_events').select('pams_pin,event_type,severity,title,summary,marker_id,delta_numeric,source_url,occurred_at,read_at').eq('user_id',state.user.id).order('occurred_at',{ascending:false}).limit(1500),
    api({action:'state'}).then(function(x){return{data:arr(x&&x.outcomes)}}).catch(function(){return{data:[]}})
  ]);
  state.scores=settled(parts[0]);state.observations=settled(parts[1]);state.findings=settled(parts[2]);state.events=settled(parts[3]);state.outcomes=settled(parts[4]);state.loaded=true;return true
}

async function token(){var c=client(),s=c&&await c.auth.getSession();return s&&s.data&&s.data.session&&s.data.session.access_token||''}
async function api(body){var t=await token();if(!t)throw new Error('Sign in required.');var r=await fetch(ACTION_API,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body||{})});var d=await r.json().catch(function(){return{}});if(!r.ok){var er=new Error(d&&d.error||'Dashboard action failed.');er.status=r.status;throw er}return d}

function latestOutcome(findingId,typeSet){
  var rows=state.outcomes.filter(function(x){return x.finding_id===findingId&&typeSet.indexOf(x.event_type)>=0}).sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at)});return rows[0]||null
}
function flags(f){
  var dismissed=!!latestOutcome(f.id,['dismissed']);
  var reviewed=!!latestOutcome(f.id,['reviewed']);
  var assignment=latestOutcome(f.id,['assigned','unassigned']);
  var watched=!!latestOutcome(f.id,['watch_started']);
  return{dismissed:dismissed,reviewed:reviewed,assigned:assignment&&assignment.event_type==='assigned',watched:watched}
}
function pushOutcome(findingId,eventType,extra){state.outcomes.unshift(Object.assign({finding_id:findingId,event_type:eventType,occurred_at:new Date().toISOString()},extra||{}))}

function stripAverage(){
  var host=q('#wd-paid-v2');if(!host)return;
  qa('.wdp-kpi',host).forEach(function(k){var label=q('.wdp-kpi-top span',k);if(label&&/average watchdog score/i.test(label.textContent||''))k.remove()});
  qa('.wdp-kpi',host).forEach(function(k){var label=(q('.wdp-kpi-top span',k)||{}).textContent||'',action='';if(/material changes/i.test(label))action='changes';else if(/top review priority/i.test(label))action='priority';else if(/properties monitored/i.test(label))action='watchlist';if(action){k.dataset.wdqAction=action;k.setAttribute('role','button');k.tabIndex=0}})
}
function promoteScore(){
  var host=q('#wd-paid-v2');if(!host)return;var head=q('.wdp-head',host);if(!head)return;
  var stage=q('#wdp-score-stage',host);if(!stage){stage=document.createElement('div');stage.id='wdp-score-stage';stage.className='wdq-score-stage';stage.innerHTML='<div class="wdq-score-label"><span>Portfolio health</span><span>Canonical ROBUST Watchdog Score</span></div>';head.insertAdjacentElement('afterend',stage)}
  var card=document.querySelector('.wd4-card[data-card-id="score"]');if(card&&!stage.contains(card)){card.classList.remove('wdp-hide');stage.appendChild(card)}
  if(card){card.classList.remove('wdp-hide');card.dataset.wdqAction='score';var cta=q('.wd-score-spotlight-cta',card);if(cta)cta.innerHTML='Open portfolio score review <i class="fas fa-arrow-right" aria-hidden="true"></i>'}
}
function enhanceToday(){
  if(!state.loaded)return;var card=q('.wdp-card[data-wdp-id="p-today"]');if(!card)return;
  qa('.wdp-row',card).forEach(function(row){
    var title=(q('b',row)||{}).textContent||'';var f=state.findings.find(function(x){return ftitle(x).trim()===title.trim()&&num(x.score)>=70});if(!f)return;
    var fl=flags(f);row.style.display=fl.dismissed?'none':'';row.dataset.findingId=f.id;
    var titleEl=q('b',row);if(titleEl){var old=q('.wdq-review-state',titleEl.parentNode);if(old)old.remove();if(fl.reviewed){var st=document.createElement('span');st.className='wdq-review-state';st.innerHTML='<i class="fas fa-check"></i> Reviewed';titleEl.insertAdjacentElement('afterend',st)}}
    var left=row.firstElementChild;if(!left)return;var actions=q('.wdq-row-actions',left);if(!actions){actions=document.createElement('div');actions.className='wdq-row-actions';left.appendChild(actions)}
    actions.innerHTML='<button class="primary" data-wdq-row="review">Review</button><button data-wdq-row="assign" class="'+(fl.assigned?'done':'')+'">'+(fl.assigned?'Assigned':'Assign to me')+'</button><button data-wdq-row="watch" class="'+(fl.watched?'done':'')+'">'+(fl.watched?'Watching':'Watch')+'</button><button data-wdq-row="intel">Intelligence</button><button data-wdq-row="dismiss">Dismiss</button>';
  });
  var visible=qa('.wdp-row',card).filter(function(r){return r.style.display!=='none'});var empty=q('.wdq-today-empty',card);if(!visible.length&&!empty){empty=document.createElement('div');empty.className='wdq-empty wdq-today-empty';empty.textContent='Your current high-priority queue is clear. Dismissed findings remain in outcome history rather than being deleted.';q('.wdp-card-body',card).appendChild(empty)}else if(visible.length&&empty)empty.remove()
}
function sync(){stripAverage();promoteScore();enhanceToday()}

function toast(msg){var t=q('.wdq-toast');if(t)t.remove();t=document.createElement('div');t.className='wdq-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},3200)}
function drawer(){var w=q('#wdq-drawer-wrap');if(w)return w;w=document.createElement('div');w.id='wdq-drawer-wrap';w.className='wdq-drawer-wrap';w.innerHTML='<button class="wdq-back" data-wdq-close aria-label="Close review"></button><aside class="wdq-drawer" aria-label="Dashboard review drawer"><header><div><span id="wdq-drawer-kicker">WATCHDOG REVIEW</span><h2 id="wdq-drawer-title">Review</h2></div><button data-wdq-close aria-label="Close"><i class="fas fa-xmark"></i></button></header><div class="wdq-drawer-body" id="wdq-drawer-body"></div></aside>';document.body.appendChild(w);w.addEventListener('click',function(ev){if(ev.target.closest('[data-wdq-close]'))closeDrawer()});return w}
function openDrawer(kicker,title,body){var w=drawer();q('#wdq-drawer-kicker',w).textContent=kicker||'WATCHDOG REVIEW';q('#wdq-drawer-title',w).textContent=title||'Review';q('#wdq-drawer-body',w).innerHTML=body||'';requestAnimationFrame(function(){w.classList.add('open')})}
function closeDrawer(){var w=q('#wdq-drawer-wrap');if(w)w.classList.remove('open')}
function propMap(){var m={};state.props.forEach(function(p){if(p.pams_pin&&!m[p.pams_pin])m[p.pams_pin]=p});return m}
function latestScores(){var m={};state.scores.forEach(function(s){var v=Number(s.watchdog_score),t=new Date(s.computed_at).getTime();if(!Number.isFinite(v)||!s.pams_pin)return;if(!m[s.pams_pin]||t>m[s.pams_pin].t)m[s.pams_pin]={pin:s.pams_pin,score:v,t:t}});return Object.values(m)}
function item(label,sub,value,cls){return'<div class="wdq-item"><div><b>'+esc(label)+'</b><small>'+esc(sub||'')+'</small></div><span class="wdq-value '+(cls||'')+'">'+esc(value)+'</span></div>'}
function scoreBody(){
  var props=propMap(),rows=latestScores(),sorted=rows.slice().sort(function(a,b){return b.score-a.score}),count=rows.length;
  var bands=[{label:'Strong · 80–100',min:80,max:101},{label:'Favorable · 65–79',min:65,max:80},{label:'Mixed · 50–64',min:50,max:65},{label:'Pressured · 35–49',min:35,max:50},{label:'Highly pressured · 0–34',min:0,max:35}];
  var dist=bands.map(function(b){var c=rows.filter(function(r){return r.score>=b.min&&r.score<b.max}).length,p=count?Math.round(c/count*100):0;return'<div class="wdq-band"><span>'+esc(b.label)+'</span><i><b style="width:'+p+'%"></b></i><strong>'+c+'</strong></div>'}).join('');
  var high=sorted.slice(0,5).map(function(r){var p=props[r.pin]||{};return item(p.address||r.pin,(p.town||'')+(p.county?' · '+p.county:''),Math.round(r.score),'')}).join('');
  var low=sorted.slice().reverse().slice(0,5).map(function(r){var p=props[r.pin]||{};return item(p.address||r.pin,(p.town||'')+(p.county?' · '+p.county:''),Math.round(r.score),'')}).join('');
  var grouped={};state.observations.forEach(function(o){if(!o.pams_pin||!Number.isFinite(Number(o.score)))return;(grouped[o.pams_pin]||(grouped[o.pams_pin]=[])).push(o)});var moves=Object.keys(grouped).map(function(pin){var a=grouped[pin].slice().sort(function(x,y){return new Date(x.observed_at)-new Date(y.observed_at)});if(a.length<2)return null;var first=Number(a[0].score),last=Number(a[a.length-1].score);return{pin:pin,delta:last-first,from:first,to:last,at:a[a.length-1].observed_at}}).filter(Boolean).sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta)}).slice(0,6);
  var moveHtml=moves.map(function(m){var p=props[m.pin]||{},cls=m.delta>0?'up':m.delta<0?'down':'';return item(p.address||m.pin,Math.round(m.from)+' → '+Math.round(m.to)+' · '+when(m.at),(m.delta>0?'+':'')+Math.round(m.delta),cls)}).join('');
  var scoredPins=new Set(rows.map(function(r){return r.pin})),unscored=state.props.filter(function(p){return p.pams_pin&&!scoredPins.has(p.pams_pin)}).slice(0,8);var unHtml=unscored.map(function(p){return item(p.address||p.pams_pin,(p.town||'')+(p.county?' · '+p.county:''),'Unscored','')}).join('');
  return '<section class="wdq-section"><h3>Score distribution</h3><p>The colored Watchdog Score remains the primary portfolio score. This review opens the properties behind it instead of creating a second score.</p><div style="margin-top:10px">'+(count?dist:'<div class="wdq-empty">No current property scores are available in the dashboard score cache.</div>')+'</div><div class="wdq-actions"><a href="/property/robust/"><i class="fas fa-shield-dog"></i> How ROBUST works</a></div></section>'+
  '<section class="wdq-section"><div class="wdq-metrics"><div class="wdq-metric"><b>'+count+'</b><span>scored saved properties</span></div><div class="wdq-metric"><b>'+state.props.length+'</b><span>saved properties in scope</span></div><div class="wdq-metric"><b>'+moves.length+'</b><span>properties with recorded movement</span></div></div></section>'+
  '<section class="wdq-section"><h3>Highest scores</h3><div class="wdq-list">'+(high||'<div class="wdq-empty">No ranked scores yet.</div>')+'</div></section>'+
  '<section class="wdq-section"><h3>Lowest scores</h3><div class="wdq-list">'+(low||'<div class="wdq-empty">No ranked scores yet.</div>')+'</div></section>'+
  '<section class="wdq-section"><h3>Largest recorded score movement</h3><div class="wdq-list">'+(moveHtml||'<div class="wdq-empty">Score history needs at least two observations on a property before movement can be shown.</div>')+'</div></section>'+
  '<section class="wdq-section"><h3>Unscored saved properties</h3><div class="wdq-list">'+(unHtml||'<div class="wdq-empty">Every saved property with a PAMS PIN currently has a score in this view.</div>')+'</div></section>'
}
function changesBody(){var props=propMap(),rows=state.events.filter(materialEvent).slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at)}).slice(0,60);var html=rows.map(function(v){var p=props[v.pams_pin]||{},label=v.title||pretty(v.event_type),sub=(p.address||v.pams_pin||'Property')+' · '+when(v.occurred_at)+(v.summary?' · '+text(v.summary).slice(0,120):''),value=v.severity||'change';return'<div class="wdq-item"><div><b>'+esc(label)+'</b><small>'+esc(sub)+'</small></div><div><span class="wdq-value">'+esc(value)+'</span>'+(v.pams_pin?'<div class="wdq-actions" style="margin-top:6px;justify-content:flex-end"><button data-wdq-intel-pin="'+esc(v.pams_pin)+'" data-wdq-intel-label="'+esc(p.address||v.pams_pin)+'">Intelligence</button></div>':'')+'</div></div>'}).join('');return'<section class="wdq-section"><h3>Material changes · last 30 days and recent queue</h3><p>This is a filtered review of source-linked changes already visible to your account. A public-record change is not a prediction of seller intent or financial outcome.</p></section><section class="wdq-section"><div class="wdq-list">'+(html||'<div class="wdq-empty">No material change is currently waiting for review.</div>')+'</div></section>'}
function evidenceList(value,max){var a=arr(value).slice(0,max||8);if(!a.length)return'<div class="wdq-empty">None recorded.</div>';return'<ul class="wdq-evidence">'+a.map(function(x){var label=typeof x==='string'?x:(x.explanation||x.signal_id||x.source_key||text(x));var url=safeUrl(x&&x.source_url);return'<li>'+esc(label)+(url?' <a href="'+esc(url)+'" target="_blank" rel="noopener">source</a>':'')+'</li>'}).join('')+'</ul>'}
function detailBody(f){if(!f)return'<div class="wdq-empty">No ranked finding is currently available.</div>';var fl=flags(f),why=text(f.why_now)||f.narrative||'Governed finding ready for review.';return'<section class="wdq-section"><h3 class="wdq-detail-title">'+esc(ftitle(f))+'</h3><div class="wdq-detail-sub">'+esc(pretty(f.opportunity_type))+' · created '+esc(when(f.created_at))+'</div><div class="wdq-metrics"><div class="wdq-metric"><b>'+Math.round(num(f.score))+'</b><span>review priority score</span></div><div class="wdq-metric"><b>'+Math.round(num(f.confidence))+'%</b><span>confidence</span></div><div class="wdq-metric"><b>'+Math.round(num(f.evidence_coverage))+'%</b><span>evidence coverage</span></div></div><p style="margin-top:12px">'+esc(why)+'</p><div class="wdq-actions"><button class="primary" data-wdq-detail="review" data-finding-id="'+esc(f.id)+'">'+(fl.reviewed?'Reviewed':'Mark reviewed')+'</button><button data-wdq-detail="assign" data-finding-id="'+esc(f.id)+'">'+(fl.assigned?'Assigned to me':'Assign to me')+'</button><button data-wdq-detail="watch" data-finding-id="'+esc(f.id)+'">'+(fl.watched?'Watching':'Watch property')+'</button><button data-wdq-detail="intel" data-finding-id="'+esc(f.id)+'">Ask Intelligence</button><button class="danger" data-wdq-detail="dismiss" data-finding-id="'+esc(f.id)+'">Dismiss from queue</button></div></section><section class="wdq-section"><h3>Evidence</h3>'+evidenceList(f.evidence,10)+'</section><section class="wdq-section"><h3>Missing evidence</h3>'+evidenceList(f.missing_evidence,8)+'</section><section class="wdq-section"><h3>Recommended next actions</h3>'+evidenceList(f.recommended_actions,8)+'</section><section class="wdq-section"><p>Scores prioritize governed evidence for professional review. They are not valuations, legal conclusions, seller predictions, or guaranteed outcomes.</p></section>'}
function openScore(){openDrawer('WATCHDOG SCORE','Portfolio score review',scoreBody())}
function openChanges(){openDrawer('CHANGE INTELLIGENCE','Material changes',changesBody())}
function openPriority(){var f=state.findings.filter(function(x){return !flags(x).dismissed}).slice().sort(byScore)[0];openDrawer('REVIEW PRIORITY','Top review priority',detailBody(f))}
function openFinding(f){openDrawer('GOVERNED FINDING','Finding review',detailBody(f))}
function openIntel(pin,label){var u=new URL('/property/intelligence/',location.origin);if(pin)u.searchParams.set('pams_pin',pin);if(label)u.searchParams.set('prompt','Review the evidence, changes, and next professional actions for '+label+'.');window.open(u.pathname+u.search,'_blank','noopener')}

async function act(f,action,button){if(!f)return;var apiAction=action==='assign'?'assigned':action==='dismiss'?'dismissed':action==='review'?'reviewed':action==='watch'?'watch':action;try{if(button)button.disabled=true;var result=await api({finding_id:f.id,action:apiAction});var event=result.event_type||({assigned:'assigned',dismissed:'dismissed',reviewed:'reviewed',watch:'watch_started'}[apiAction]);pushOutcome(f.id,event,{metadata:apiAction==='assigned'?{assigned_to_user_id:state.user&&state.user.id}:{}});toast(apiAction==='dismissed'?'Finding dismissed from the active queue.':apiAction==='assigned'?'Assigned to you.':apiAction==='reviewed'?'Marked reviewed.':apiAction==='watch'?'Property added to your Watchdog watchlist.':'Updated.');sync();var w=q('#wdq-drawer-wrap.open');if(w&&q('[data-finding-id="'+f.id+'"]',w))openFinding(f)}catch(error){toast(error&&error.message||'Could not complete that action.')}finally{if(button)button.disabled=false}}

function click(ev){
  var scoreLink=ev.target.closest&&ev.target.closest('.wd-score-spotlight-link');if(scoreLink){ev.preventDefault();ev.stopImmediatePropagation();openScore();return}
  var k=ev.target.closest&&ev.target.closest('.wdp-kpi[data-wdq-action]');if(k){var a=k.dataset.wdqAction;if(a==='changes')openChanges();else if(a==='priority')openPriority();else if(a==='watchlist')location.assign('/property/watchlist/');return}
  var score=ev.target.closest&&ev.target.closest('#wdp-score-stage .wd4-card[data-card-id="score"]');if(score&&!ev.target.closest('.wd4-card-menu')){ev.preventDefault();openScore();return}
  var rb=ev.target.closest&&ev.target.closest('[data-wdq-row]');if(rb){ev.preventDefault();ev.stopPropagation();var row=rb.closest('.wdp-row'),f=state.findings.find(function(x){return x.id===row.dataset.findingId});var a2=rb.dataset.wdqRow;if(a2==='review'){act(f,'review',rb);openFinding(f)}else if(a2==='assign')act(f,'assign',rb);else if(a2==='watch')act(f,'watch',rb);else if(a2==='dismiss')act(f,'dismiss',rb);else if(a2==='intel')openIntel(f&&f.pams_pin,ftitle(f));return}
  var dbtn=ev.target.closest&&ev.target.closest('[data-wdq-detail]');if(dbtn){var f2=state.findings.find(function(x){return x.id===dbtn.dataset.findingId}),a3=dbtn.dataset.wdqDetail;if(a3==='intel')openIntel(f2&&f2.pams_pin,ftitle(f2));else act(f2,a3,dbtn);return}
  var ib=ev.target.closest&&ev.target.closest('[data-wdq-intel-pin]');if(ib){openIntel(ib.dataset.wdqIntelPin,ib.dataset.wdqIntelLabel);return}
}
function key(ev){if(ev.key==='Escape')closeDrawer();var k=ev.target.closest&&ev.target.closest('.wdp-kpi[data-wdq-action]');if(k&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();k.click()}}
function observe(){var root=q('#wd4-root');if(!root)return;new MutationObserver(function(){clearTimeout(refreshTimer);refreshTimer=setTimeout(sync,100)}).observe(root,{childList:true,subtree:true})}
async function boot(){css();if(!await load())return;sync();observe();document.addEventListener('click',click,true);document.addEventListener('keydown',key);setInterval(function(){load().then(sync).catch(function(){})},5*60*1000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1050)},{once:true});else setTimeout(boot,1050);
})();

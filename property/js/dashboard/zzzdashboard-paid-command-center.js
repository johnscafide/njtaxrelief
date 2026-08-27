(function(){
'use strict';
if(window.__wdPaidV3)return;window.__wdPaidV3=1;
var MAX=10,KEY='paid_command_center_v2',VISIT='wd_paid_last_visit',R={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5},db=null;
var cards=[
['today','Watchdog Today','What needs attention first','fa-bolt'],
['since','Since your last visit','Meaningful changes only','fa-clock-rotate-left'],
['top','Top opportunities','Highest-priority governed findings','fa-ranking-star'],
['inbox','Material change inbox','Important updates without noise','fa-inbox'],
['appeal','Assessment & appeal radar','Assessment review findings','fa-scale-balanced'],
['lists','Monitored list changes','New, dropped and changed matches','fa-satellite-dish'],
['evidence','Evidence strength','Confidence, coverage and gaps','fa-shield-halved'],
['closing','Closing review radar','Closing evidence worth review','fa-file-circle-check'],
['fresh','Data freshness','Coverage and recency health','fa-database'],
['blast','Change blast radius','One update affecting many properties','fa-diagram-project']
];
var legacy=[['map','Property map'],['score','Watchdog Score'],['value','Total property value'],['tax','Annual tax load'],['opportunities','Appeals / opportunities'],['changes','Change activity'],['monitored','Properties monitored'],['scoretrend','Score trend'],['taxvalue','Tax vs value'],['municipality','By municipality'],['weather','Local conditions'],['activity','Recent activity']];
var S={u:null,plan:'standard',active:cards.map(function(x){return'p-'+x[0]}),props:[],find:[],events:[],lists:[],diffs:[],scores:[],last:null};
function q(s,r){return(r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function e(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function n(v){v=Number(v);return Number.isFinite(v)?v:0}
function arr(v){return Array.isArray(v)?v:[]}
function txt(v){if(v==null)return'';if(typeof v==='string')return v;if(Array.isArray(v))return v.map(txt).filter(Boolean).join(' · ');if(typeof v==='object')return Object.values(v).map(txt).filter(Boolean).join(' · ');return String(v)}
function when(v){var t=new Date(v).getTime();if(!Number.isFinite(t))return'unknown';var h=Math.floor((Date.now()-t)/36e5);return h<1?'just now':h<24?h+'h ago':Math.floor(h/24)+'d ago'}
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient()}catch(_){ }return db}
function valid(id){return cards.some(function(x){return'p-'+x[0]===id})||legacy.some(function(x){return x[0]===id})}
function normalize(v){v=String(v||'standard').toLowerCase().replace(/\+/g,'_plus');return R[v]!=null?v:'standard'}
function css(){
  if(q('#wd-paid-v3-css'))return;
  var s=document.createElement('style');s.id='wd-paid-v3-css';s.textContent=`
html.wd-paid-v3 .wd4-card.wdp-hide{display:none!important}
html.wd-paid-v3.wdp-no-legacy .wd4-canvas{display:none!important}
html.wd-paid-v3:not(.wdp-no-legacy) .wd4-grid{display:grid!important;grid-template-columns:repeat(12,minmax(0,1fr))!important;gap:14px!important;align-items:stretch!important}
html.wd-paid-v3:not(.wdp-no-legacy) .wd4-card[data-card-id]:not(.wdp-hide){grid-column:span 6!important;min-height:260px!important;height:auto!important;max-height:none!important;margin:0!important}
html.wd-paid-v3:not(.wdp-no-legacy) .wd4-card[data-card-id="map"]:not(.wdp-hide){grid-column:span 12!important;min-height:380px!important}
.wdp{margin:0 24px 20px;padding:0;background:transparent;color:#172542;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
.wdp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin:0 0 14px;padding:0 2px}
.wdp-eyebrow,.wdp-card header span,.wdp-settings header span{font:800 10px/1.2 Inter,sans-serif;letter-spacing:.095em;color:#3568ca}
.wdp-head h2{margin:5px 0 5px;font:800 24px/1.08 Inter,sans-serif;letter-spacing:-.025em;color:#15223d}
.wdp-head p{margin:0;color:#6d7b8e;font:500 13px/1.45 Inter,sans-serif}
.wdp-actions{display:flex;gap:8px;flex:none}
.wdp button,.wdp-actions a{border:0;border-radius:9px;min-height:40px;padding:0 13px;background:#17305f;color:#fff;font:800 12px Inter,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.wdp button.alt{background:#fff;color:#263a5d;border:1px solid #d8e0ea}
.wdp-kpis{display:grid;grid-template-columns:1.35fr repeat(3,minmax(0,1fr));gap:12px;margin-bottom:14px}
.wdp-kpi{min-width:0;min-height:128px;padding:17px 18px;border:1px solid #dde5ee;border-radius:14px;background:#fff;box-shadow:0 2px 7px rgba(20,33,61,.025);display:flex;flex-direction:column;justify-content:space-between}
.wdp-kpi.primary{border-color:#c9d9f4;background:#f8fbff}
.wdp-kpi-top{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#718096;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.075em;text-transform:uppercase}
.wdp-kpi-top i{color:#3568ca;font-size:14px}
.wdp-kpi-value{margin-top:10px;color:#14213d;font:800 30px/1 Inter,sans-serif;letter-spacing:-.04em}
.wdp-kpi.primary .wdp-kpi-value{font-size:42px}
.wdp-kpi-value small{font:800 13px/1 Inter,sans-serif;color:#7d8999;letter-spacing:0}
.wdp-kpi-sub{margin-top:7px;color:#718096;font:600 11px/1.35 Inter,sans-serif}
.wdp-kpi-bar{height:6px;margin-top:12px;border-radius:999px;background:#edf1f5;overflow:hidden}
.wdp-kpi-bar i{display:block;height:100%;background:#2f6df6;border-radius:999px}
.wdp-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;align-items:stretch}
.wdp-card{grid-column:span 6;min-width:0;min-height:286px;border:1px solid #e0e6ee;border-radius:14px;background:#fff;padding:15px 16px;box-shadow:0 2px 7px rgba(20,33,61,.025);display:flex;flex-direction:column}
.wdp-card[data-wdp-id="p-today"]{grid-column:span 12;min-height:224px}
.wdp-card header{display:flex;gap:10px;align-items:center;margin-bottom:10px;min-height:38px}
.wdp-card header>i{width:34px;height:34px;border-radius:9px;background:#eef4ff;color:#3468d4;display:grid;place-items:center;flex:none}
.wdp-card h3{margin:2px 0 0;color:#172542;font:800 15px/1.2 Inter,sans-serif;letter-spacing:-.012em}
.wdp-card .x{margin-left:auto;width:30px;min-height:30px;padding:0;background:transparent;color:#8a97a9}
.wdp-card-body{flex:1;min-height:0}
.wdp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 0;border-top:1px solid #edf1f5;align-items:start}
.wdp-row:first-child{border-top:0}
.wdp-row b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#22324e;font:750 12px Inter,sans-serif}
.wdp-row small{display:block;margin-top:3px;color:#718096;font:500 11px/1.35 Inter,sans-serif}
.wdp-score{align-self:start;border-radius:8px;padding:5px 7px;background:#eef7f3;color:#11715a;font:800 11px Inter,sans-serif}
.wdp-score.warn{background:#fff4df;color:#8b5a00}
.wdp-empty{padding:18px 4px;color:#718096;font:600 12px/1.45 Inter,sans-serif}
.wdp-health{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.wdp-health div{padding:12px;border-radius:10px;background:#f6f8fb}
.wdp-health strong{display:block;color:#172542;font:800 18px Inter,sans-serif}
.wdp-health span{display:block;margin-top:4px;color:#718096;font:600 10px/1.3 Inter,sans-serif}
.wdp-meter{height:7px;margin-top:7px;border-radius:9px;background:#edf1f5;overflow:hidden}
.wdp-meter i{display:block;height:100%;background:#2f6df6}
.wdp-foot{margin-top:auto;padding-top:10px;color:#8491a3;font:500 10.5px/1.4 Inter,sans-serif}
.wdp-portfolio-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 24px 10px;padding:0 2px;color:#718096;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.wdp-portfolio-label b{color:#283b5e;font-size:12px;letter-spacing:0;text-transform:none}
.wdp-edge{position:fixed;right:0;top:44%;z-index:820;border:0;border-radius:12px 0 0 12px;padding:13px 9px;background:#10264c;color:#fff;box-shadow:0 8px 24px rgba(16,38,76,.25);cursor:pointer}
.wdp-edge span{writing-mode:vertical-rl;transform:rotate(180deg);font:800 10px Inter,sans-serif;letter-spacing:.06em;margin-top:6px}
.wdp-drawer,.wdp-settings-wrap{position:fixed;inset:0;z-index:1200;pointer-events:none}
.wdp-drawer.open,.wdp-settings-wrap.open{pointer-events:auto}
.wdp-back{position:absolute;inset:0;border:0;background:rgba(9,19,38,.38);opacity:0;transition:.2s}
.open>.wdp-back{opacity:1}
.wdp-panel{position:absolute;right:0;top:0;bottom:0;width:min(860px,94vw);background:#fff;transform:translateX(102%);transition:.25s ease;box-shadow:-24px 0 55px rgba(9,19,38,.18);display:flex;flex-direction:column}
.open>.wdp-panel{transform:none}
.wdp-panel>header{height:62px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #e3e8ef}
.wdp-panel>header b{display:block;color:#152540;font:800 14px Inter,sans-serif}
.wdp-panel>header span{display:block;color:#3468d4;font:800 9px Inter,sans-serif;letter-spacing:.09em}
.wdp-panel>header button,.wdp-panel>header a{border:0;background:#f3f6fa;color:#263a5d;width:36px;height:36px;border-radius:9px;display:inline-grid;place-items:center;cursor:pointer}
.wdp-panel iframe{border:0;width:100%;flex:1;background:#f7f9fc}
.wdp-settings{position:absolute;right:0;top:0;bottom:0;width:min(430px,94vw);background:#fff;transform:translateX(102%);transition:.25s ease;box-shadow:-24px 0 55px rgba(9,19,38,.18);padding:20px;overflow:auto}
.open>.wdp-settings{transform:none}
.wdp-settings header{display:flex;justify-content:space-between;gap:10px}
.wdp-settings h2{margin:3px 0 5px;color:#14213d;font:800 21px Inter,sans-serif}
.wdp-settings p{margin:0;color:#718096;font:500 12px/1.4 Inter,sans-serif}
.wdp-settings header button{border:0;background:#f3f6fa;width:36px;height:36px;border-radius:9px}
.wdp-count{margin:16px 0 10px;padding:10px 12px;border-radius:10px;background:#eef4ff;color:#315aab;font:800 12px Inter,sans-serif}
.wdp-set-title{margin:18px 0 6px;color:#78869a;font:800 10px Inter,sans-serif;letter-spacing:.08em}
.wdp-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #edf1f5;color:#263a5d;font:700 12px Inter,sans-serif}
.wdp-toggle small{display:block;color:#8491a3;font:500 10px Inter,sans-serif;margin-top:2px}
.wdp-toggle input{width:18px;height:18px}
.wdp-reset{margin-top:16px;width:100%;border:1px solid #dbe2eb!important;background:#fff!important;color:#2d4266!important}
.wdp-limit{color:#9a5c00}
@media(max-width:1080px){.wdp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.wdp{margin:0 12px 14px}.wdp-head{align-items:stretch;flex-direction:column}.wdp-actions{width:100%}.wdp-actions button{flex:1}.wdp-card,.wdp-card[data-wdp-id="p-today"]{grid-column:span 12;min-height:0}.wdp-panel{width:100vw}.wdp-edge{top:auto;bottom:74px}html.wd-paid-v3:not(.wdp-no-legacy) .wd4-card[data-card-id]:not(.wdp-hide){grid-column:span 12!important}}
@media(max-width:620px){.wdp-kpis{grid-template-columns:1fr}.wdp-kpi{min-height:108px}.wdp-kpi.primary .wdp-kpi-value{font-size:38px}.wdp-head h2{font-size:20px}}
`;document.head.appendChild(s)
}
async function load(){
  var c=client();if(!c)return false;
  var se=await c.auth.getSession();S.u=se&&se.data&&se.data.session&&se.data.session.user;if(!S.u)return false;
  try{S.last=localStorage.getItem(VISIT)||new Date(Date.now()-864e5).toISOString()}catch(_){S.last=new Date(Date.now()-864e5).toISOString()}
  var a=await Promise.allSettled([
    c.rpc('get_my_entitlement'),
    c.rpc('is_watchdog_developer'),
    c.from('dashboard_layout_preferences').select('layout').eq('user_id',S.u.id).maybeSingle(),
    c.from('saved_properties').select('pams_pin,address,town,county').eq('user_id',S.u.id).limit(2000),
    c.from('intelligence_findings').select('pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,missing_evidence,recommended_actions,narrative,created_at').eq('user_id',S.u.id).order('created_at',{ascending:false}).limit(1000),
    c.from('property_update_events').select('pams_pin,event_type,severity,title,summary,marker_id,delta_numeric,source_url,occurred_at,read_at').eq('user_id',S.u.id).order('occurred_at',{ascending:false}).limit(1000),
    c.from('agent_dynamic_lists').select('id,name,monitored,last_count,next_check_at,last_monitor_completed_at,last_monitor_status').eq('user_id',S.u.id).limit(150),
    c.from('agent_dynamic_list_diffs').select('dynamic_list_id,new_match_count,dropped_match_count,assessment_change_count,source_complete,capacity_limited,created_at').eq('user_id',S.u.id).order('created_at',{ascending:false}).limit(250)
  ]);
  var ent=a[0].status==='fulfilled'?a[0].value.data:null;ent=Array.isArray(ent)?ent[0]:ent;
  S.plan=a[1].status==='fulfilled'&&a[1].value.data===true?'developer':normalize(ent&&ent.plan_tier);if(R[S.plan]<R.pro)return false;
  var lay=a[2].status==='fulfilled'&&a[2].value.data&&a[2].value.data.layout||{},p=lay[KEY];
  if(p&&Array.isArray(p.active)){var z=p.active.filter(valid).slice(0,MAX);if(z.length)S.active=z}
  S.props=a[3].status==='fulfilled'?arr(a[3].value.data):[];
  S.find=a[4].status==='fulfilled'?arr(a[4].value.data):[];
  S.events=a[5].status==='fulfilled'?arr(a[5].value.data):[];
  S.lists=a[6].status==='fulfilled'?arr(a[6].value.data):[];
  S.diffs=a[7].status==='fulfilled'?arr(a[7].value.data):[];
  var pins=Array.from(new Set(S.props.map(function(x){return x.pams_pin}).filter(Boolean))).slice(0,2000);
  if(pins.length){try{var sr=await c.from('public_watchdog_score_cache').select('pams_pin,watchdog_score,computed_at').in('pams_pin',pins);S.scores=!sr.error&&Array.isArray(sr.data)?sr.data:[]}catch(_){S.scores=[]}}
  return true
}
async function save(){var c=client(),lay={};if(!c||!S.u)return;try{var x=await c.from('dashboard_layout_preferences').select('layout').eq('user_id',S.u.id).maybeSingle();lay=x&&x.data&&x.data.layout||{}}catch(_){ }lay[KEY]={active:S.active,max_active:MAX,updated_at:new Date().toISOString()};c.from('dashboard_layout_preferences').upsert({user_id:S.u.id,layout:lay,updated_at:new Date().toISOString()},{onConflict:'user_id'}).then(function(){}).catch(function(){})}
function scoreStats(){var map={};S.scores.forEach(function(x){var v=Number(x.watchdog_score),t=new Date(x.computed_at).getTime();if(!Number.isFinite(v))return;var prev=map[x.pams_pin];if(!prev||t>prev.t)map[x.pams_pin]={v:v,t:t}});var vals=Object.values(map),avg=vals.length?vals.reduce(function(s,x){return s+x.v},0)/vals.length:null,latest=vals.length?Math.max.apply(null,vals.map(function(x){return x.t}).filter(Number.isFinite)):null;return{avg:avg,count:vals.length,latest:latest,coverage:S.props.length?Math.round(vals.length/S.props.length*100):0}}
function material30(){return S.events.filter(function(v){return new Date(v.occurred_at).getTime()>Date.now()-30*864e5&&(/high|critical|urgent|warning|review/i.test(v.severity||'')||Math.abs(n(v.delta_numeric))>0)}).length}
function kpis(){var st=scoreStats(),top=S.find.slice().sort(function(a,b){return n(b.score)-n(a.score)})[0],score=st.avg==null?'—':Math.round(st.avg),scoreSub=st.count?st.count+' scored of '+S.props.length+' saved properties · '+st.coverage+'% coverage':'No scored saved properties yet';return '<div class="wdp-kpis">'+
'<section class="wdp-kpi primary"><div><div class="wdp-kpi-top"><span>Average Watchdog Score</span><i class="fas fa-shield-dog"></i></div><div class="wdp-kpi-value">'+e(score)+(score!=='—'?'<small> / 100</small>':'')+'</div><div class="wdp-kpi-sub">'+e(scoreSub)+(st.latest?' · updated '+e(when(st.latest)):'')+'</div></div><div class="wdp-kpi-bar"><i style="width:'+e(st.avg==null?0:Math.max(0,Math.min(100,st.avg)))+'%"></i></div></section>'+
'<section class="wdp-kpi"><div class="wdp-kpi-top"><span>Properties monitored</span><i class="fas fa-binoculars"></i></div><div><div class="wdp-kpi-value">'+S.props.length+'</div><div class="wdp-kpi-sub">Saved properties currently in your dashboard scope.</div></div></section>'+
'<section class="wdp-kpi"><div class="wdp-kpi-top"><span>Material changes · 30d</span><i class="fas fa-wave-square"></i></div><div><div class="wdp-kpi-value">'+material30()+'</div><div class="wdp-kpi-sub">Source-linked updates that merit review, not routine noise.</div></div></section>'+
'<section class="wdp-kpi"><div class="wdp-kpi-top"><span>Top review priority</span><i class="fas fa-ranking-star"></i></div><div><div class="wdp-kpi-value">'+(top?Math.round(n(top.score)):'—')+(top?'<small> / 100</small>':'')+'</div><div class="wdp-kpi-sub">'+e(top?(top.property_address||top.pams_pin||String(top.opportunity_type||'Finding').replace(/_/g,' ')):'No ranked finding available.')+'</div></div></section>'+
'</div>'}
function row(title,sub,val,warn){return'<div class="wdp-row"><div><b>'+e(title)+'</b><small>'+e(sub||'')+'</small></div>'+(val!==undefined?'<strong class="wdp-score '+(warn?'warn':'')+'">'+e(val)+'</strong>':'')+'</div>'}
function empty(s){return'<div class="wdp-empty"><i class="fas fa-circle-check"></i> '+e(s)+'</div>'}
function card(id,title,kick,icon,body,foot){return'<article class="wdp-card" data-wdp-id="'+e(id)+'"><header><i class="fas '+icon+'"></i><div><span>'+e(kick)+'</span><h3>'+e(title)+'</h3></div><button class="x" data-off="'+id+'" aria-label="Hide '+e(title)+'"><i class="fas fa-xmark"></i></button></header><div class="wdp-card-body">'+body+'</div>'+(foot?'<div class="wdp-foot">'+e(foot)+'</div>':'')+'</article>'}
function ftitle(f){return f.property_address||f.pams_pin||String(f.opportunity_type||'Finding').replace(/_/g,' ')}
function why(f){return txt(f.why_now)||f.narrative||txt(f.recommended_actions)||'Governed finding ready for review'}
function after(rows,k){var t=new Date(S.last).getTime();return rows.filter(function(x){return new Date(x[k]).getTime()>t})}
function renderCard(id){
  var type=id.slice(2),b='',x=[];
  if(type==='today'){x=S.find.filter(function(f){return n(f.score)>=70}).sort(function(a,b){return n(b.score)-n(a.score)}).slice(0,4);b=x.length?x.map(function(f){return row(ftitle(f),why(f).slice(0,125),Math.round(n(f.score)))}).join(''):empty('No high-priority governed finding right now.');return card(id,'Watchdog Today','REVIEW FIRST','fa-bolt',b,'Ranked from governed findings, not generic AI prose.')}
  if(type==='since'){var ff=after(S.find,'created_at'),ev=after(S.events,'occurred_at');b=row(ff.length+' new findings',ff.length?'New governed findings since your previous dashboard visit.':'No new finding since your previous visit.',ff.length,ff.length>0)+row(ev.length+' property updates',ev.length?'Source-linked updates since your previous visit.':'No new property update since your previous visit.',ev.length,ev.length>0);return card(id,'Since your last visit','NET NEW','fa-clock-rotate-left',b,'Your visit baseline is stored locally on this browser.')}
  if(type==='top'){x=S.find.slice().sort(function(a,b){return n(b.score)-n(a.score)}).slice(0,5);b=x.length?x.map(function(f){return row(ftitle(f),String(f.opportunity_type||'review').replace(/_/g,' ')+' · '+why(f).slice(0,92),Math.round(n(f.score)))}).join(''):empty('No ranked finding is available.');return card(id,'Top opportunities','PRIORITY QUEUE','fa-ranking-star',b,'Score prioritizes review. It is not a guaranteed outcome or sale prediction.')}
  if(type==='inbox'){x=S.events.filter(function(v){return /high|critical|urgent|warning|review/i.test(v.severity||'')||Math.abs(n(v.delta_numeric))>0}).slice(0,5);b=x.length?x.map(function(v){return row(v.title||v.event_type||'Property update',(v.summary||v.marker_id||'')+' · '+when(v.occurred_at),v.severity||'change',true)}).join(''):empty('No material change is waiting for review.');return card(id,'Material change inbox','CHANGE INTELLIGENCE','fa-inbox',b,'Only events your account is authorized to read are shown.')}
  if(type==='appeal'){x=S.find.filter(function(f){return String(f.opportunity_type)==='assessment_review'}).sort(function(a,b){return n(b.score)-n(a.score)}).slice(0,5);b=x.length?x.map(function(f){return row(ftitle(f),'Evidence '+Math.round(n(f.evidence_coverage))+'% · confidence '+Math.round(n(f.confidence))+'%',Math.round(n(f.score)))}).join(''):empty('No assessment-review finding is currently ranked.');return card(id,'Assessment & appeal radar','NJ REVIEW','fa-scale-balanced',b,'Professional review aid only. Watchdog does not make legal conclusions.')}
  if(type==='lists'){x=S.diffs.slice(0,5);var names={};S.lists.forEach(function(l){names[l.id]=l.name});b=x.length?x.map(function(d){return row(names[d.dynamic_list_id]||'Monitored list','+'+n(d.new_match_count)+' new · -'+n(d.dropped_match_count)+' dropped · '+n(d.assessment_change_count)+' assessment changes',n(d.new_match_count)+n(d.assessment_change_count),d.capacity_limited)}).join(''):empty('No saved-list diff has been recorded yet.');return card(id,'Monitored list changes','WORKS WHILE YOU SLEEP','fa-satellite-dish',b,'Shows diffs instead of forcing you to re-check full lists.')}
  if(type==='evidence'){x=S.find.slice().sort(function(a,b){return n(b.evidence_coverage)-n(a.evidence_coverage)}).slice(0,5);b=x.length?x.map(function(f){return row(ftitle(f),(txt(f.missing_evidence)||'No missing evidence recorded').slice(0,100),Math.round(n(f.evidence_coverage))+'%',n(f.evidence_coverage)<60)}).join(''):empty('Evidence strength will appear with governed findings.');return card(id,'Evidence strength','TRUST LAYER','fa-shield-halved',b,'Missing evidence remains missing. Watchdog does not fill gaps with guesses.')}
  if(type==='closing'){x=S.find.filter(function(f){return String(f.opportunity_type)==='closing_review'}).sort(function(a,b){return n(b.score)-n(a.score)}).slice(0,5);b=x.length?x.map(function(f){return row(ftitle(f),'Confidence '+Math.round(n(f.confidence))+'% · coverage '+Math.round(n(f.evidence_coverage))+'%',Math.round(n(f.score)))}).join(''):empty('No closing-review finding is currently queued.');return card(id,'Closing review radar','CLOSING EVIDENCE','fa-file-circle-check',b,'Written evidence remains authoritative.')}
  if(type==='fresh'){var av=S.find.length?S.find.reduce(function(s,f){return s+n(f.evidence_coverage)},0)/S.find.length:0,dates=S.find.map(function(f){return new Date(f.created_at).getTime()}).concat(S.events.map(function(v){return new Date(v.occurred_at).getTime()})).filter(Number.isFinite),latest=dates.length?Math.max.apply(null,dates):null;b='<div class="wdp-health"><div><strong>'+Math.round(av)+'%</strong><span>average evidence coverage</span><div class="wdp-meter"><i style="width:'+Math.min(100,av)+'%"></i></div></div><div><strong>'+(latest?e(when(latest)):'—')+'</strong><span>latest governed update</span></div><div><strong>'+S.props.length+'</strong><span>saved properties in scope</span></div></div>';return card(id,'Data freshness','COVERAGE HEALTH','fa-database',b,'Freshness is shown, not assumed.')}
  if(type==='blast'){var g={};S.events.filter(function(v){return new Date(v.occurred_at).getTime()>Date.now()-30*864e5}).forEach(function(v){var k=v.source_url||v.marker_id||v.event_type||v.title;if(!k)return;(g[k]||(g[k]={label:v.title||v.marker_id||v.event_type,p:{},at:v.occurred_at})).p[v.pams_pin||'']=1});x=Object.values(g).map(function(v){v.count=Object.keys(v.p).filter(Boolean).length;return v}).filter(function(v){return v.count>1}).sort(function(a,b){return b.count-a.count}).slice(0,5);b=x.length?x.map(function(v){return row(v.label,v.count+' saved properties affected · '+when(v.at),v.count,true)}).join(''):empty('No recent single update currently affects multiple saved properties.');return card(id,'Change blast radius','ONE UPDATE → MANY','fa-diagram-project',b,'Groups only source-linked events already visible to your account.')}
  return''
}
function ensure(){var canvas=q('.wd4-canvas');if(!canvas)return null;var shell=q('#wd-paid-v2');if(!shell){shell=document.createElement('section');shell.id='wd-paid-v2';shell.className='wdp';canvas.parentNode.insertBefore(shell,canvas);shell.addEventListener('click',click)}return shell}
function portfolioLabel(on){var old=q('#wdp-portfolio-label');if(!on.size){if(old)old.remove();return}var canvas=q('.wd4-canvas');if(!canvas)return;if(!old){old=document.createElement('div');old.id='wdp-portfolio-label';old.className='wdp-portfolio-label';canvas.parentNode.insertBefore(old,canvas)}old.innerHTML='<span>Portfolio basics</span><b>'+on.size+' active · managed in Cards</b>'}
function legacyVisibility(){var on=new Set(S.active.filter(function(v){return !/^p-/.test(v)}));qa('.wd4-card[data-card-id]').forEach(function(el){el.classList.toggle('wdp-hide',!on.has(el.dataset.cardId))});document.documentElement.classList.toggle('wdp-no-legacy',on.size===0);portfolioLabel(on)}
function draw(){if(R[S.plan]<R.pro)return;css();document.documentElement.classList.add('wd-paid-v3');var sh=ensure();if(!sh)return;var count=S.active.length,paid=S.active.filter(function(v){return /^p-/.test(v)}).map(renderCard).join('');sh.innerHTML='<div class="wdp-head"><div><div class="wdp-eyebrow">'+e(S.plan.replace('_plus','+').toUpperCase())+' WORKSPACE</div><h2>Watchdog Command Center</h2><p>A decision dashboard: score first, then changes, priorities, evidence and action.</p></div><div class="wdp-actions"><button data-intel><i class="fas fa-dog"></i> Intelligence</button><button class="alt" data-settings><i class="fas fa-sliders"></i> Cards '+count+'/'+MAX+'</button></div></div>'+kpis()+'<div class="wdp-grid">'+paid+'</div>';legacyVisibility();edge()}
function click(ev){var off=ev.target.closest('[data-off]');if(off){toggle(off.dataset.off,false);return}if(ev.target.closest('[data-settings]'))settings();if(ev.target.closest('[data-intel]'))drawer()}
function toggle(id,on){var has=S.active.includes(id);if(on&&!has){if(S.active.length>=MAX)return false;S.active.push(id)}if(!on&&has)S.active=S.active.filter(function(x){return x!==id});save();draw();renderSettings();return true}
function settings(){var w=q('#wdp-settings');if(!w){w=document.createElement('div');w.id='wdp-settings';w.className='wdp-settings-wrap';w.innerHTML='<button class="wdp-back" data-close aria-label="Close dashboard settings"></button><aside class="wdp-settings"><header><div><span>DASHBOARD SETTINGS</span><h2>Choose your cards</h2><p>Keep the workspace focused. Up to '+MAX+' dashboard cards can be active at once.</p></div><button data-close aria-label="Close"><i class="fas fa-xmark"></i></button></header><div class="wdp-count"></div><div class="wdp-settings-list"></div><button class="wdp-reset" data-reset>Reset professional defaults</button></aside>';document.body.appendChild(w);w.addEventListener('click',function(ev){if(ev.target.closest('[data-close]'))w.classList.remove('open');if(ev.target.closest('[data-reset]')){S.active=cards.map(function(x){return'p-'+x[0]});save();draw();renderSettings()}var t=ev.target.closest('[data-toggle]');if(t){if(!toggle(t.dataset.toggle,t.checked)){t.checked=false;var c=q('.wdp-count',w);c.innerHTML='<span class="wdp-limit">'+MAX+' card maximum. Turn one off first.</span>'}}})}renderSettings();requestAnimationFrame(function(){w.classList.add('open')})}
function renderSettings(){var w=q('#wdp-settings');if(!w)return;var c=q('.wdp-count',w),l=q('.wdp-settings-list',w);c.textContent=S.active.length+' of '+MAX+' active';function line(id,name,sub){var on=S.active.includes(id),dis=!on&&S.active.length>=MAX;return'<label class="wdp-toggle"><span>'+e(name)+'<small>'+e(sub)+'</small></span><input type="checkbox" data-toggle="'+e(id)+'" '+(on?'checked':'')+' '+(dis?'disabled':'')+'></label>'}l.innerHTML='<div class="wdp-set-title">PAID INTELLIGENCE</div>'+cards.map(function(x){return line('p-'+x[0],x[1],x[2])}).join('')+'<div class="wdp-set-title">PORTFOLIO BASICS</div>'+legacy.map(function(x){return line(x[0],x[1],'Existing portfolio dashboard card')}).join('')}
function edge(){if(q('#wdp-edge'))return;var b=document.createElement('button');b.id='wdp-edge';b.className='wdp-edge';b.innerHTML='<i class="fas fa-dog"></i><span>Intelligence</span>';b.onclick=drawer;document.body.appendChild(b)}
function drawer(){var w=q('#wdp-drawer');if(!w){w=document.createElement('div');w.id='wdp-drawer';w.className='wdp-drawer';w.innerHTML='<button class="wdp-back" data-close aria-label="Close Watchdog Intelligence"></button><aside class="wdp-panel"><header><div><span>WATCHDOG INTELLIGENCE</span><b>Ask, listen, inspect evidence, act.</b></div><div><a href="/property/intelligence" target="_blank" title="Open full page"><i class="fas fa-up-right-from-square"></i></a><button data-close aria-label="Close"><i class="fas fa-xmark"></i></button></div></header><iframe title="Watchdog Intelligence" src="/property/intelligence/?embed=1"></iframe></aside>';document.body.appendChild(w);w.addEventListener('click',function(ev){if(ev.target.closest('[data-close]'))w.classList.remove('open')})}w.classList.add('open')}
function observe(){var root=q('#wd4-root');if(!root)return;var tm;new MutationObserver(function(){clearTimeout(tm);tm=setTimeout(function(){if(R[S.plan]>=R.pro){draw();legacyVisibility()}},160)}).observe(root,{childList:true,subtree:true})}
async function boot(){if(!await load())return;draw();observe();try{localStorage.setItem(VISIT,new Date().toISOString())}catch(_){ }window.addEventListener('keydown',function(ev){if(ev.key==='Escape'){var a=q('#wdp-drawer'),b=q('#wdp-settings');if(a)a.classList.remove('open');if(b)b.classList.remove('open')}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,700)},{once:true});else setTimeout(boot,700);
})();

/* 
     
     Hi There. I see you are checking the code. I'm sure you have reasons for such. Curiosity would be my guess. 

     My name is John. I've been building sites since I was 10. I was gifted ecommerce website software on floppy disks
     and fell in love with web developement ever since. I learned to code HTML using just notepad. I took computer science
     classes (BASIC and Visual Basic in high school). Took a few college classes learning C++, Python, Ruby and Javascript.
     My very first websites was with Angelfire and Geocities. In college I dabbed in game development, small tools, and
     graphic design. Database management with SQL by my sophmore year. Joomla and other CMS tools learned by the age of 20. 
     I have an understanding and experience writing code by hand, studing and analyzing bugs, issues, and corrections. 
     The introduction of AI is interesting. I can understand the worry and fear. I also see the memes of "Hey I can make 
     your job obsolete" then show a localhost:3000. haha. But I do believe, if you understand how to use the tools, it's
     no different than templates, hiring a local kid, outsourcing your work to fivrr or an agency. I code, I understand the
     backend and frontend. I'm not an expert by all means. But I do have insights. Watchdog was built on real research.
     Watchdog & it's companion, NJPropertyTaxRelief.com, is from years of listening to real people with real needs in NJ.
     I hope these sites and tools have benefit to you and/or your business. If you found them useful, the least I ask of
     you is to share. Sure, I have paid plan options for members, but majority of the site is free to use. I'm a real estate
     agent, licensed tax professional, and a big fan of the state of New Jersey. It's a great state, but not without its
     flaws. The idea is to educate more New Jerseyians about their benefits and property taxes in the state. It's possible
     one day this site will exceed some of the bigger natonal sites. Who knows. But for now, I present to you, Watchdog
     Property Intelligence.

     */
/* ==========================================================================
   Watchdog Dashboard board renderer. Reads WD state from wd-core.js; never
   fetches. Layout: search + greeting, four summary cards, the property list
   with a details card, and a side column with the calendar and activity.
   Each region repaints only when its markup changes, so focus, the search
   box and scroll position survive the secondary data arriving.
   ========================================================================== */
(function(w,d){
'use strict';
function start(){
  var WD=w.WD;if(!WD||start.done)return;start.done=true;
  var H=WD.H,S=WD.S,esc=H.esc,voiceRecognition=null;
  var today=new Date();
  var ui={pin:'',sort:'review',all:false,calY:today.getFullYear(),calM:today.getMonth(),day:'',feed:'all'};
  var LIST_LIMIT=5,WEEKS=17,DAY=86400000;

  /* Clean public routes on WatchdogIndex; /property/... on the legacy host. */
  function route(path){
    var rt=w.NJPTRSupabaseRuntime,prefix=rt&&typeof rt.routePrefix==='string'?rt.routePrefix:((location.hostname==='watchdogindex.com'||location.hostname==='www.watchdogindex.com')?'':'/property');
    path=String(path||'/');if(path.charAt(0)!=='/')path='/'+path;
    return prefix+path;
  }
  function setHTML(id,html){var el=H.el(id);if(!el||el.__wddHTML===html)return false;el.__wddHTML=html;el.innerHTML=html;return true;}
  function plural(n,one,many){return n===1?one:many;}
  function dateKey(dt){return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');}
  function place(p){return [H.titleCase(p.town),p.county?H.titleCase(p.county)+' County':''].filter(Boolean).join(', ')||'New Jersey';}

  /* One status per property, from the shared category logic in wd-core. */
  function statusOf(p){
    var g=WD.gapFor(p),s=S.scores[p.pams_pin];
    if(!g&&!(s&&s.score!=null))return{key:'none',label:'Not rated yet',short:'Not rated'};
    var c=WD.categoryFor(p);
    if(c==='bad')return{key:'review',label:'Worth a review',short:'Review'};
    if(c==='warn')return{key:'watch',label:'Keep an eye on it',short:'Watch'};
    return{key:'good',label:'Looks fair',short:'Fair'};
  }
  function scoreOf(p){var s=S.scores[p.pams_pin];return s&&s.score!=null?Math.round(s.score):null;}
  function counts(props){var c={review:0,watch:0,good:0,none:0};props.forEach(function(p){c[statusOf(p).key]+=1;});return c;}

  /* ---------------------------------------------------------------- top -- */
  function greetingWord(){var h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
  function greeting(){
    var name=String(WD.userName()||'').trim().split(/\s+/)[0]||'';
    if(!name||name==='there'||name.indexOf('@')>-1)return greetingWord();
    return greetingWord()+', '+name;
  }
  function summaryLine(){
    var props=WD.filtered(),n=props.length,st=WD.stats(),c=counts(props),look=c.review+c.watch;
    if(!n)return 'Add a New Jersey property and Watchdog will keep an eye on its assessment, taxes and changes for you.';
    var first='Watchdog is watching <b>'+n.toLocaleString()+' '+plural(n,'property','properties')+'</b> for you. ';
    var second=look?'<b>'+look+'</b> '+plural(look,'is','are')+' worth a closer look':'Nothing needs a closer look right now';
    var third=st.changes30?', and <b>'+st.changes30+' '+plural(st.changes30,'change','changes')+'</b> came in over the last 30 days.':', and nothing new came in over the last 30 days.';
    return first+second+third;
  }
  function paintTop(){
    var slot=H.el('wdd-search-slot');
    // The search box is built once so a repaint never wipes what someone is typing.
    if(slot&&!slot.querySelector('#wdd-command')){
      slot.innerHTML=
        '<form class="wdd-search" id="wdd-command" role="search">'+
          '<span class="wdd-search-icon" aria-hidden="true"><i class="fas fa-magnifying-glass"></i></span>'+
          '<input id="wdd-command-input" data-watchdog-address-search type="search" autocomplete="off" placeholder="Search a New Jersey address..." aria-label="Search New Jersey property addresses">'+
          '<button class="wdd-search-voice" type="button" data-act="voice-search" aria-label="Search by voice" title="Search by voice"><i class="fas fa-microphone" aria-hidden="true"></i></button>'+
          '<kbd aria-hidden="true">⌘ K</kbd>'+
        '</form>';
      if(typeof w.WatchdogNJAddressAutocompleteRefresh==='function')w.setTimeout(w.WatchdogNJAddressAutocompleteRefresh,0);
    }
    var title=H.el('wdd-greet-title');
    if(title&&title.textContent!==greeting())title.textContent=greeting();
    setHTML('wdd-greet-line',summaryLine());
  }

  /* -------------------------------------------------------------- cards -- */
  // Background art: shield (score), house (changes), magnifier (status), map pin (value).
  var DECO={
    shield:'<svg class="wdd-deco wdd-deco--shield" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><path d="M50 2 94 18v34c0 30-19 52-44 62C25 104 6 82 6 52V18Z" stroke="none"/><path d="m30 58 14 14 28-30" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    house:'<svg class="wdd-deco wdd-deco--house" viewBox="0 0 100 92" aria-hidden="true" focusable="false"><path d="M50 4 96 42h-12v46H62V62H38v26H16V42H4Z"/></svg>',
    magnifier:'<svg class="wdd-deco wdd-deco--magnifier" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="42" cy="42" r="28" stroke-width="14"/><path d="m64 64 26 26" stroke-width="16" stroke-linecap="round"/></svg>',
    pin:'<svg class="wdd-deco wdd-deco--pin" viewBox="0 0 80 100" aria-hidden="true" focusable="false"><path d="M40 2C19 2 4 17 4 37c0 26 36 61 36 61s36-35 36-61C76 17 61 2 40 2Z"/><circle cx="40" cy="37" r="13"/></svg>'
  };

  function stat(value,unit,caption,lead){
    return '<div class="wdd-stat'+(lead?' is-lead':'')+'"><b>'+value+(unit?'<small>'+unit+'</small>':'')+'</b><span>'+caption+'</span></div>';
  }
  function scoreCard(props){
    var st=WD.stats(),scored=props.filter(function(p){return scoreOf(p)!=null;}),avg=st.score!=null?Math.round(st.score):null,peer=st.peer!=null?Math.round(st.peer):null;
    var shown=props.slice(0,16),bars;
    if(!shown.length)bars='<div class="wdd-bars" aria-hidden="true">'+[40,62,30,74,52,66,44].map(function(h){return '<span class="wdd-bar is-empty"><i style="height:'+h+'%"></i></span>';}).join('')+'</div>';
    else bars='<div class="wdd-bars" role="group" aria-label="Watchdog Score by property">'+shown.map(function(p){
      var sc=scoreOf(p),pin=String(p.pams_pin||''),sel=pin&&pin===ui.pin;
      var label=(p.address||pin||'Saved property')+': '+(sc==null?'not scored yet':'Watchdog Score '+sc);
      return '<button type="button" class="wdd-bar'+(sc==null?' is-empty':'')+(sel?' is-selected':'')+'" data-select-pin="'+esc(pin)+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" aria-pressed="'+(sel?'true':'false')+'"><i style="height:'+(sc==null?34:Math.max(6,Math.min(100,sc)))+'%"></i></button>';
    }).join('')+(peer!=null&&shown.length?'<span class="wdd-peer-line" style="bottom:'+Math.max(4,Math.min(96,peer))+'%" aria-hidden="true"><span>Town median '+peer+'</span></span>':'')+'</div>';
    var verdict=WD.verdict(avg);
    return '<article class="wdd-card wdd-card--score">'+DECO.shield+
      '<div class="wdd-card-head"><h2>Watchdog Score:</h2><a class="wdd-card-info" href="'+esc(route('/data-methodology'))+'#robust" aria-label="How the Watchdog Score works" title="The Watchdog Score, powered by the ROBUST Framework."><i class="fas fa-info" aria-hidden="true"></i></a></div>'+
      '<div class="wdd-stats">'+
        stat(avg==null?'—':String(avg),avg==null?'':'/100','Your average',true)+
        stat(peer==null?'—':String(peer),'','Town median')+
        stat(String(scored.length),props.length?'of '+props.length:'','Scored')+
      '</div>'+
      '<div class="wdd-bars-wrap">'+bars+'</div>'+
      '<div class="wdd-axis"><span>'+(props.length?esc(avg==null?'Not scored yet':verdict.label):'Your properties will show here')+'</span><span>Higher is better</span></div>'+
    '</article>';
  }

  function weekly(changes){
    var end=new Date();end.setHours(23,59,59,999);var endT=end.getTime(),out=[];
    for(var i=0;i<WEEKS;i++){var from=endT-(WEEKS-i)*7*DAY;out.push({from:from,count:0});}
    changes.forEach(function(r){var t=new Date(r.occurred_at).getTime();if(!Number.isFinite(t)||t>endT)return;var idx=WEEKS-1-Math.floor((endT-t)/(7*DAY));if(idx>=0&&idx<WEEKS)out[idx].count+=1;});
    return out;
  }
  function smoothPath(pts,top,base){
    if(pts.length<2)return'';
    var dd='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
    function clampY(v){return Math.max(top,Math.min(base,v));}
    for(var i=0;i<pts.length-1;i++){
      var p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      var c1x=p1[0]+(p2[0]-p0[0])/6,c1y=clampY(p1[1]+(p2[1]-p0[1])/6),c2x=p2[0]-(p3[0]-p1[0])/6,c2y=clampY(p2[1]-(p3[1]-p1[1])/6);
      dd+=' C'+c1x.toFixed(1)+' '+c1y.toFixed(1)+' '+c2x.toFixed(1)+' '+c2y.toFixed(1)+' '+p2[0].toFixed(1)+' '+p2[1].toFixed(1);
    }
    return dd;
  }
  function shortDate(t){return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'});}
  function changesCard(props){
    var st=WD.stats(),changes=st.changes,weeks=weekly(changes),max=Math.max.apply(null,weeks.map(function(x){return x.count;}).concat([1]));
    var W=600,Hh=120,top=12,base=108,pad=6;
    var pts=weeks.map(function(wk,i){return[pad+i*(W-2*pad)/(WEEKS-1),base-(wk.count/max)*(base-top)];});
    var peak=-1,peakCount=0;weeks.forEach(function(wk,i){if(wk.count>peakCount){peakCount=wk.count;peak=i;}});
    var affected=H.unique(changes.map(function(r){return r.pams_pin;})).length;
    var chart='<div class="wdd-line-wrap" style="position:relative">'+
      '<svg class="wdd-line" viewBox="0 0 '+W+' '+Hh+'" preserveAspectRatio="none" role="img" aria-label="'+esc(changes.length?'Changes per week over the last '+WEEKS+' weeks. Busiest week: '+peakCount+' '+plural(peakCount,'change','changes')+', week of '+shortDate(weeks[peak].from+DAY)+'.':'No changes in the last '+WEEKS+' weeks.')+'">'+
        '<line class="wdd-line-base" x1="0" y1="'+base+'" x2="'+W+'" y2="'+base+'" vector-effect="non-scaling-stroke"/>'+
        (peak>-1?'<line class="wdd-line-drop" x1="'+pts[peak][0].toFixed(1)+'" y1="'+pts[peak][1].toFixed(1)+'" x2="'+pts[peak][0].toFixed(1)+'" y2="'+base+'" vector-effect="non-scaling-stroke"/>':'')+
        '<path class="wdd-line-path" d="'+smoothPath(pts,top,base)+'" vector-effect="non-scaling-stroke"/>'+
      '</svg>'+
      (peak>-1?'<svg class="wdd-line-dot-wrap" viewBox="0 0 14 14" aria-hidden="true" style="position:absolute;width:14px;height:14px;left:calc('+(pts[peak][0]/W*100).toFixed(2)+'% - 7px);top:calc('+(10+pts[peak][1]/Hh*132).toFixed(1)+'px - 7px);overflow:visible"><circle class="wdd-line-dot" cx="7" cy="7" r="5.5"/></svg>':'')+
    '</div>';
    var labelIdx=[0,4,8,12,16],axis=labelIdx.map(function(i){
      var near=peak>-1&&Math.abs(i-peak)<=1;
      return near?'<b>'+esc(shortDate(weeks[peak].from+DAY))+'</b>':'<span>'+esc(shortDate(weeks[i].from+DAY))+'</span>';
    });
    if(peak>-1&&labelIdx.every(function(i){return Math.abs(i-peak)>1;})){
      // Keep the peak's date visible even when it falls between the axis ticks.
      var slot=Math.round(peak/4);axis[Math.max(0,Math.min(4,slot))]='<b>'+esc(shortDate(weeks[peak].from+DAY))+'</b>';
    }
    return '<article class="wdd-card wdd-card--changes">'+DECO.house+
      '<div class="wdd-card-head"><h2>Changes:</h2><a class="wdd-card-link" href="'+esc(route('/pulse'))+'">Show all <i class="fas fa-arrow-right" aria-hidden="true"></i></a></div>'+
      '<div class="wdd-stats">'+
        stat(String(st.changes30),'','Last 30 days',true)+
        stat(String(changes.length),'','Last 120 days')+
        stat(String(affected),props.length?'of '+props.length:'','Properties')+
      '</div>'+chart+
      '<div class="wdd-line-axis" aria-hidden="true">'+axis.join('')+'</div>'+
      (changes.length?'':'<p class="wdd-card-note">A quiet stretch. Nothing has changed on your properties in the last 120 days.</p>')+
    '</article>';
  }
  function statusCard(props){
    var c=counts(props);
    return '<article class="wdd-card wdd-card--status">'+DECO.magnifier+
      '<div class="wdd-card-head"><h2>By status:</h2></div>'+
      '<div class="wdd-stats">'+stat(String(c.good),'','Looks fair',true)+stat(String(c.watch),'','Watch')+stat(String(c.review),'','Review')+'</div>'+
      (c.none?'<p class="wdd-card-note">'+c.none+' '+plural(c.none,'property is','properties are')+' not rated yet.</p>':'')+
    '</article>';
  }
  function valueCard(){
    var st=WD.stats();
    return '<article class="wdd-card wdd-card--value">'+DECO.pin+
      '<div class="wdd-card-head"><h2>Portfolio value:</h2></div>'+
      '<div class="wdd-stats">'+
        stat(st.value?esc(H.money(st.value)):'—','','Market est.',true)+
        stat(st.assessed?esc(H.money(st.assessed)):'—','','Assessed')+
        stat(st.tax?esc(H.money(st.tax)):'—','','Annual tax')+
      '</div>'+
      (st.atStake?'<p class="wdd-card-note">About <b>'+esc(H.dollars(st.atStake))+'</b> a year sits in assessments above market evidence.</p>':'')+
    '</article>';
  }
  function paintCards(){
    var props=WD.filtered();
    setHTML('wdd-signals',scoreCard(props)+changesCard(props)+statusCard(props)+valueCard());
  }

  /* --------------------------------------------------------- list+detail -- */
  var RANK={review:0,watch:1,good:2,none:3};
  function sortedProps(){
    var props=WD.filtered().slice();
    props.sort(function(a,b){
      if(ui.sort==='score'){var x=scoreOf(a),y=scoreOf(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return x-y;}
      if(ui.sort==='tax')return H.num(b.last_year_tax)-H.num(a.last_year_tax);
      if(ui.sort==='recent')return new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime();
      var r=RANK[statusOf(a).key]-RANK[statusOf(b).key];if(r)return r;
      var ga=WD.gapFor(a),gb=WD.gapFor(b);return (gb?gb.pct:-999)-(ga?ga.pct:-999);
    });
    return props;
  }
  function selected(list){
    if(!list.length)return null;
    var found=list.filter(function(p){return String(p.pams_pin||'')===ui.pin;})[0];
    if(!found){found=list[0];ui.pin=String(found.pams_pin||'');}
    return found;
  }
  function row(p){
    var st=statusOf(p),sc=scoreOf(p),pin=String(p.pams_pin||''),sel=pin===ui.pin;
    return '<li><button type="button" class="wdd-row'+(sel?' is-selected':'')+'" data-select-pin="'+esc(pin)+'" aria-pressed="'+(sel?'true':'false')+'">'+
      '<span class="wdd-row-icon is-tone-'+st.key+'" aria-hidden="true"><i class="fas fa-house"></i></span>'+
      '<span class="wdd-row-text"><b>'+esc(p.address||pin||'Saved property')+'</b><small>'+esc(place(p))+' · '+esc(st.label)+'</small></span>'+
      '<span class="wdd-tag is-tone-'+st.key+'">'+(sc==null?'No score':'Score '+sc)+'</span>'+
    '</button></li>';
  }
  function paintList(){
    var list=sortedProps();selected(list);
    var head='<div class="wdd-section-head"><h2 id="wdd-list-title">Your properties</h2>'+
      (list.length>1?'<label class="wdd-pill-select"><span class="wdd-sr">Sort properties</span><select data-act="sort">'+
        [['review','Needs review'],['score','Lowest score'],['tax','Highest tax'],['recent','Recently added']].map(function(o){return '<option value="'+o[0]+'"'+(ui.sort===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+
      '</select></label>':'')+'</div>';
    var body;
    if(!list.length){
      body='<div class="wdd-empty"><i class="fas fa-house-circle-check" aria-hidden="true"></i><p>No saved properties yet. Look one up and it will show here with its assessment, taxes and Watchdog Score.</p><a class="wdd-btn" href="'+esc(route('/'))+'">Look up an address</a></div>';
    }else{
      var shown=ui.all?list:list.slice(0,LIST_LIMIT);
      body='<ul class="wdd-rows" aria-labelledby="wdd-list-title">'+shown.map(row).join('')+'</ul>'+
        (list.length>LIST_LIMIT?'<button type="button" class="wdd-list-more" data-act="list-all" aria-expanded="'+(ui.all?'true':'false')+'">'+(ui.all?'Show fewer':'Show all '+list.length)+'</button>':'');
    }
    setHTML('wdd-positions',head+body);
  }
  function ago(v){var t=new Date(v).getTime();return Number.isFinite(t)&&Date.now()-t<60000?'just now':H.ago(v);}
  function latestChange(p){return S.changes.filter(function(r){return r.pams_pin===p.pams_pin;})[0]||null;}
  function paintDetail(){
    var list=sortedProps(),p=selected(list);
    var head='<div class="wdd-section-head"><h2>Property details</h2></div>';
    if(!p){setHTML('wdd-detail',head+'<div class="wdd-detail-card"><p style="margin:0;font-size:14px;line-height:1.5">Pick a property from your list to see its assessment, market estimate and latest changes here.</p></div>');return;}
    var st=statusOf(p),g=WD.gapFor(p),sc=scoreOf(p),s=S.scores[p.pams_pin],pin=String(p.pams_pin||''),change=latestChange(p);
    var finding=S.findings.filter(function(f){return f.pams_pin===p.pams_pin;})[0],why=finding?H.copy(finding.why_now):'';
    var tags=['<span>'+esc(st.label)+'</span>'];
    if(g)tags.push('<span>'+(g.pct>0?'+':'')+g.pct.toFixed(1)+'% vs market</span>');
    if(sc!=null)tags.push('<span>Score '+sc+(s&&s.peer!=null?' · town '+Math.round(s.peer):'')+'</span>');
    var rows=[
      ['Assessed',p.assessed?esc(H.dollars(p.assessed))+(p.assessment_year?'<small>'+esc(String(p.assessment_year))+' assessment</small>':''):'Not available'],
      ['Market estimate',p.watchdog_value?esc(H.dollars(p.watchdog_value)):'Not available'],
      ['Annual tax',p.last_year_tax?esc(H.dollars(p.last_year_tax))+(p.last_year_tax_year?'<small>'+esc(String(p.last_year_tax_year))+(p.municipal_tax_live?' municipal record':'')+'</small>':''):'Not available']
    ];
    if(g&&g.dollars&&g.pct>=5)rows.push(['Gap in tax',esc(H.dollars(g.dollars))+' a year<small>Estimate, not guaranteed savings</small>']);
    rows.push(['Latest change',change?esc(change.title||H.pretty(change.event_type))+'<small>'+esc(ago(change.occurred_at))+'</small>':'Nothing in the last 120 days']);
    if(why)rows.push(['Why now',esc(why)]);
    var gate=WD.isPro()?'':'<p class="wdd-detail-gate">Evidence files and the appeal workflow come with Pro. <a href="'+esc(route('/pro'))+'">Compare plans</a></p>';
    setHTML('wdd-detail',head+'<div class="wdd-detail-card">'+
      '<div class="wdd-detail-top"><div><a href="'+esc(route('/home')+'?pin='+encodeURIComponent(pin))+'">'+esc(p.address||pin||'Saved property')+'</a><p>'+esc(place(p))+'</p></div>'+(pin?'<span class="wdd-pin" title="Property PIN">PIN '+esc(pin)+'</span>':'')+'</div>'+
      '<div class="wdd-detail-tags">'+tags.join('')+'</div>'+
      '<dl class="wdd-detail-list">'+rows.map(function(r){return '<div><dt>'+r[0]+'</dt><dd>'+r[1]+'</dd></div>';}).join('')+'</dl>'+
      '<div class="wdd-detail-actions"><a class="wdd-btn" href="'+esc(route('/home')+'?pin='+encodeURIComponent(pin))+'">Open property</a><a class="wdd-btn is-ghost" href="'+esc(route('/report')+'?pin='+encodeURIComponent(pin))+'">Full report</a>'+(pin?'<button type="button" class="wdd-btn is-ghost" data-act="why" data-why-pin="'+esc(pin)+'" data-why-address="'+esc(p.address||'')+'"><i class="fas fa-dog" aria-hidden="true"></i>Why Watchdog?</button>':'')+'</div>'+
      gate+
    '</div>');
  }

  /* --------------------------------------------------------------- side -- */
  // Appeal calendar baselines mirror appeal-deadline-rules.json: Burlington,
  // Gloucester and Monmouth use the January 15 baseline, other counties
  // April 1. Per its display_policy: statutory baseline only, no countdown,
  // and always verify against the assessment notice.
  var APPEAL_ALT_COUNTIES=['BURLINGTON','GLOUCESTER','MONMOUTH'];
  function countyKey(c){return String(c||'').trim().toUpperCase().replace(/\s+COUNTY$/,'');}
  function nextBaseline(month,day){var now=new Date(),y=now.getFullYear();if(now>new Date(y,month-1,day,23,59,59))y+=1;return new Date(y,month-1,day);}
  function baselines(props){
    var alt=false,trad=false;
    props.forEach(function(p){var k=countyKey(p.county);if(!k)return;if(APPEAL_ALT_COUNTIES.indexOf(k)>-1)alt=true;else trad=true;});
    return{alt:alt,trad:trad};
  }
  function isoWeek(dt){var t=new Date(Date.UTC(dt.getFullYear(),dt.getMonth(),dt.getDate()));var day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);var y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/DAY+1)/7);}
  function eventsByDay(changes){var map={};changes.forEach(function(r){var t=new Date(r.occurred_at);if(!Number.isFinite(t.getTime()))return;var k=dateKey(t);(map[k]=map[k]||[]).push(r);});return map;}
  function calendar(props,byDay){
    var b=baselines(props),y=ui.calY,m=ui.calM,first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7,todayKey=dateKey(new Date());
    var label=first.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    var cells=['Mo','Tu','We','Th','Fr','Sa','Su'].map(function(x){return '<span aria-hidden="true">'+x+'</span>';}).join('')+'<span aria-hidden="true"></span>';
    var total=Math.ceil((offset+days)/7)*7;
    for(var i=0;i<total;i++){
      var dayNum=i-offset+1;
      if(dayNum<1||dayNum>days)cells+='<span aria-hidden="true"></span>';
      else{
        var dt=new Date(y,m,dayNum),k=dateKey(dt),ev=byDay[k]||[],base=(b.alt&&m===0&&dayNum===15)||(b.trad&&m===3&&dayNum===1);
        var cls='wdd-cal-day'+(ev.length?' has-events':'')+(base?' is-baseline':'')+(k===todayKey?' is-today':'')+(k===ui.day?' is-selected':'');
        var aria=dt.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+(k===todayKey?', today':'')+(ev.length?', '+ev.length+' '+plural(ev.length,'change','changes'):'')+(base?', county appeal baseline':'');
        cells+='<button type="button" class="'+cls+'" data-day="'+k+'" aria-label="'+esc(aria)+'" aria-pressed="'+(k===ui.day?'true':'false')+'">'+dayNum+'</button>';
      }
      if(i%7===6){var monday=new Date(y,m,i-6-offset+1);cells+='<span class="wdd-cal-wk" aria-hidden="true">W'+isoWeek(monday)+'</span>';}
    }
    var note='';
    if(b.alt||b.trad){
      var parts=[];
      if(b.alt)parts.push('<b>'+esc(nextBaseline(1,15).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))+'</b> for Burlington, Gloucester and Monmouth');
      if(b.trad)parts.push('<b>'+esc(nextBaseline(4,1).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))+'</b> for other counties');
      note='<p class="wdd-cal-note">Next appeal baseline: '+parts.join('; ')+'. These are county baselines, so verify your deadline on the assessment notice.</p>';
    }
    return '<section class="wdd-cal" aria-label="Calendar">'+
      '<div class="wdd-cal-head"><button type="button" class="wdd-cal-nav" data-cal="-1" aria-label="Previous month"><i class="fas fa-arrow-left" aria-hidden="true"></i></button><span class="wdd-cal-month" aria-live="polite">'+esc(label)+'</span><button type="button" class="wdd-cal-nav" data-cal="1" aria-label="Next month"><i class="fas fa-arrow-right" aria-hidden="true"></i></button></div>'+
      '<div class="wdd-cal-grid">'+cells+'</div>'+
      '<div class="wdd-cal-actions"><a class="wdd-btn" href="'+esc(route('/'))+'"><i class="fas fa-plus" aria-hidden="true"></i>Add a property</a><button type="button" class="wdd-icon-btn" data-act="refresh" aria-label="Refresh dashboard" title="Refresh"><i class="fas fa-rotate-right" aria-hidden="true"></i></button><button type="button" class="wdd-icon-btn" data-act="export" aria-label="Export properties as CSV" title="Export CSV"><i class="fas fa-download" aria-hidden="true"></i></button></div>'+
      note+
    '</section>';
  }
  function severity(r){var s=String(r.severity||'').toLowerCase();if(s==='high'||s==='critical')return'high';if(s==='medium'||s==='warning')return'medium';return'low';}
  function feedIcon(r){var t=String(r.event_type||r.marker_id||'').toLowerCase();if(/tax|assessment|ratio/.test(t))return'fa-receipt';if(/sale|market|value/.test(t))return'fa-house';if(/permit|construction/.test(t))return'fa-hammer';if(/class/.test(t))return'fa-layer-group';if(/appeal/.test(t))return'fa-gavel';if(/flood/.test(t))return'fa-droplet';return'fa-wave-square';}
  function addressFor(pin){var p=S.properties.filter(function(x){return x.pams_pin===pin;})[0];return p?(p.address||''):'';}
  function timeline(changes,byDay){
    var list=ui.day?(byDay[ui.day]||[]):changes;
    if(ui.feed==='important')list=list.filter(function(r){return severity(r)!=='low';});
    var title=ui.day?new Date(ui.day+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric'}):'Recent activity';
    var sub=ui.day?(list.length?list.length+' '+plural(list.length,'change','changes')+' on this day':'Nothing changed on this day'):'Latest changes';
    var items=list.slice(0,6).map(function(r){
      var t=new Date(r.occurred_at),when=ui.day?t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):t.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      return '<li><time datetime="'+esc(Number.isFinite(t.getTime())?t.toISOString():'')+'">'+esc(when)+'</time><span class="wdd-feed-icon is-'+severity(r)+'" aria-hidden="true"><i class="fas '+feedIcon(r)+'"></i></span><span class="wdd-feed-text"><b>'+esc(r.title||H.pretty(r.event_type))+'</b><small>'+esc(addressFor(r.pams_pin)||r.pams_pin||'Saved property')+(ui.day?'':' · '+esc(ago(r.occurred_at)))+'</small></span></li>';
    }).join('');
    var empty=ui.day?'Pick another day with a dot, or clear the day to see all recent activity.':(S.properties.length?'Nothing has changed on your properties in the last 120 days.':'Changes to your saved properties will show up here.');
    return '<section class="wdd-timeline" aria-label="Recent activity">'+
      '<div class="wdd-timeline-head"><div><h2>'+esc(title)+'</h2><p>'+esc(sub)+'</p></div>'+
        '<label class="wdd-pill-select is-light"><span class="wdd-sr">Filter activity</span><select data-act="feed"><option value="all"'+(ui.feed==='all'?' selected':'')+'>All</option><option value="important"'+(ui.feed==='important'?' selected':'')+'>Important</option></select></label></div>'+
      (items?'<ol class="wdd-feed">'+items+'</ol>':'<p class="wdd-feed-empty">'+esc(empty)+'</p>')+
      (ui.day?'<button type="button" class="wdd-list-more" data-act="clear-day">Show all recent activity</button>':'<a class="wdd-feed-more" href="'+esc(route('/pulse'))+'">View all changes <i class="fas fa-arrow-right" aria-hidden="true"></i></a>')+
    '</section>';
  }
  function sponsor(){
    return '<a class="wdd-sponsor" href="https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=dashboard_kpi" target="_blank" rel="noopener sponsored" aria-label="Advertisement: Greentree Mortgage. Explore purchase, refinance, and home equity options with John Varano, NMLS 142739.">'+
      '<img src="/johnvarano.jpg" alt="" loading="lazy" width="44" height="44"><em>Advertisement</em><strong>Greentree Mortgage</strong><span>Know the full monthly number before you make an offer. Purchase, refinance or home equity.</span><small>John Varano · NMLS #142739</small></a>';
  }
  function paintSide(){
    var st=WD.stats(),byDay=eventsByDay(st.changes);
    setHTML('wdd-rail',calendar(WD.filtered(),byDay)+timeline(st.changes,byDay)+sponsor());
  }

  function paintFoot(){
    setHTML('wdd-foot','<b>Decision-support data.</b> Market estimates and gap figures are not appraisals or legal conclusions. A gap does not establish appeal eligibility or success. Verify filing decisions against original county and municipal records.');
  }

  /* ------------------------------------------------------------ actions -- */
  function exportCsv(){
    var st=WD.stats(),out=[['Watchdog portfolio export',new Date().toISOString()],[],['Metric','Value'],['Properties',st.count],['Watchdog Score',st.score==null?'':st.score.toFixed(1)],['Market estimate',Math.round(st.value)],['Assessed total',Math.round(st.assessed)],['Annual tax',Math.round(st.tax)],['Above evidence',st.over],['Annual gap estimate',Math.round(st.atStake)],[],['Address','Town','County','Assessed','Market estimate','Gap %','Annual gap estimate','Annual tax','Watchdog Score']];
    WD.filtered().forEach(function(p){var g=WD.gapFor(p),s=S.scores[p.pams_pin];out.push([p.address||'',p.town||'',p.county||'',p.assessed||'',p.watchdog_value||'',g?g.pct.toFixed(2):'',g&&g.dollars?Math.round(g.dollars):'',p.last_year_tax||'',s?Math.round(s.score):'']);});
    var csv=out.map(function(r){return r.map(function(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=d.createElement('a');a.href=url;a.download='watchdog-portfolio.csv';d.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);WD.toast('Exported '+WD.filtered().length+' properties');
  }
  function startVoiceSearch(button){
    var Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
    if(!Speech){WD.toast('Voice search is not supported in this browser.');return;}
    if(voiceRecognition){try{voiceRecognition.abort();}catch(_e){}voiceRecognition=null;}
    var input=H.el('wdd-command-input'),recognition=new Speech();voiceRecognition=recognition;
    recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1;
    button.classList.add('is-listening');button.setAttribute('aria-label','Listening for an address');
    recognition.onresult=function(e){
      var transcript=e&&e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript;
      if(input&&transcript){input.value=String(transcript).trim();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
    };
    recognition.onerror=function(){WD.toast('I could not hear an address. Try again.');};
    recognition.onend=function(){button.classList.remove('is-listening');button.setAttribute('aria-label','Search by voice');voiceRecognition=null;};
    try{recognition.start();}catch(_err){button.classList.remove('is-listening');voiceRecognition=null;}
  }
  function refocus(selector){w.setTimeout(function(){var el=d.querySelector(selector);if(el)el.focus({preventScroll:true});},0);}
  /* "Why Watchdog?" opens the plain-English evidence drawer (watchdog-why.js),
     loaded on first use so the dashboard does not pay for it up front. */
  function openWhy(btn){
    var opts={pamsPin:btn.getAttribute('data-why-pin')||'',address:btn.getAttribute('data-why-address')||'',surface:'dashboard'};
    if(w.WatchdogWhy){w.WatchdogWhy.open(opts);return;}
    var s=d.getElementById('wd-why-script');
    if(!s){s=d.createElement('script');s.id='wd-why-script';s.src='/property/js/watchdog-why.js';d.head.appendChild(s);}
    s.addEventListener('load',function(){if(w.WatchdogWhy)w.WatchdogWhy.open(opts);},{once:true});
  }
  function onClick(ev){
    var t=ev.target;if(!t||!t.closest||!t.closest('.wdd-app'))return;
    var pick=t.closest('[data-select-pin]');
    if(pick){
      ui.pin=pick.getAttribute('data-select-pin')||'';
      var inList=!!pick.closest('#wdd-positions'),inBars=!!pick.closest('.wdd-bars');
      // A pick from the chart may be hidden in the collapsed list; open it.
      if(inBars&&sortedProps().map(function(p){return String(p.pams_pin||'');}).indexOf(ui.pin)>=LIST_LIMIT)ui.all=true;
      paintList();paintDetail();paintCards();bridge();
      var sel='[data-select-pin="'+ui.pin.replace(/["\\]/g,'\\$&')+'"]';
      refocus((inList?'#wdd-positions ':inBars?'.wdd-bars ':'')+sel);
      if(w.matchMedia&&w.matchMedia('(max-width: 980px)').matches&&inList){var det=H.el('wdd-detail');if(det)det.scrollIntoView({behavior:w.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
      return;
    }
    var day=t.closest('[data-day]');
    if(day){var k=day.getAttribute('data-day');ui.day=ui.day===k?'':k;paintSide();refocus('[data-day="'+k+'"]');return;}
    var cal=t.closest('[data-cal]');
    if(cal){var m=ui.calM+Number(cal.getAttribute('data-cal'));ui.calY+=Math.floor(m/12);ui.calM=((m%12)+12)%12;paintSide();refocus('[data-cal="'+cal.getAttribute('data-cal')+'"]');return;}
    var act=t.closest('[data-act]');if(!act||act.tagName==='SELECT')return;
    var a=act.getAttribute('data-act');
    if(a==='list-all'){ui.all=!ui.all;paintList();bridge();refocus('[data-act="list-all"]');}
    else if(a==='clear-day'){ui.day='';paintSide();refocus('.wdd-timeline h2');}
    else if(a==='export')exportCsv();
    else if(a==='refresh')location.reload();
    else if(a==='voice-search')startVoiceSearch(act);
    else if(a==='why')openWhy(act);
  }
  function onChange(ev){
    var t=ev.target;if(!t||!t.getAttribute)return;
    var a=t.getAttribute('data-act');
    if(a==='sort'){ui.sort=t.value;ui.pin='';paintList();paintDetail();paintCards();bridge();refocus('[data-act="sort"]');}
    else if(a==='feed'){ui.feed=t.value==='important'?'important':'all';paintSide();refocus('[data-act="feed"]');}
  }
  function onSubmit(ev){
    if(ev.target&&ev.target.id==='wdd-command'){ev.preventDefault();var input=H.el('wdd-command-input'),q=String(input&&input.value||'').trim();location.href=route('/')+(q?'?address='+encodeURIComponent(q):'');}
  }
  function onKeydown(ev){
    if((ev.metaKey||ev.ctrlKey)&&String(ev.key).toLowerCase()==='k'){var input=H.el('wdd-command-input');if(input){ev.preventDefault();input.focus();}}
  }
  // Color bridge: on the two-column layout the selected row and the details
  // card share one sky tint, joined across the gap so they read as one unit.
  // Only drawn when the row sits fully beside the card; otherwise plain rows.
  var bridgeFrame=0;
  function bridge(){
    w.cancelAnimationFrame(bridgeFrame);
    bridgeFrame=w.requestAnimationFrame(function(){
      var lower=d.querySelector('.wdd-lower'),rowEl=d.querySelector('#wdd-positions .wdd-row.is-selected'),card=d.querySelector('#wdd-detail .wdd-detail-card');
      if(!lower)return;
      var on=false,top=false,bottom=false;
      if(rowEl&&card&&!(w.matchMedia&&w.matchMedia('(max-width: 980px)').matches)){
        var r=rowEl.getBoundingClientRect(),c=card.getBoundingClientRect();
        on=r.top>=c.top-1&&r.bottom<=c.bottom+1;
        top=on&&r.top-c.top>=12;bottom=on&&c.bottom-r.bottom>=12;
      }
      lower.classList.toggle('has-bridge',on);
      lower.classList.toggle('bridge-top',top);
      lower.classList.toggle('bridge-bottom',bottom);
    });
  }
  function paintAll(){paintTop();paintCards();paintList();paintDetail();paintSide();paintFoot();bridge();}
  d.addEventListener('click',onClick);d.addEventListener('change',onChange);d.addEventListener('submit',onSubmit);d.addEventListener('keydown',onKeydown);
  w.addEventListener('resize',bridge);
  WD.onRepaint(paintAll);paintAll();
}
if(w.WD&&w.WD.S&&w.WD.S.user)start();else d.addEventListener('wd:ready',start,{once:true});
})(window,document);

/* Watchdog Dashboard V3 renderer. Reads WD state; never fetches. */
(function(w,d){
'use strict';
function start(){
  var WD=w.WD;if(!WD)return;var H=WD.H,S=WD.S,esc=H.esc,map=null,railMap=null,voiceRecognition=null,analysisTab='assessed',fallbackVariant=Math.floor(Math.random()*4)+1;

  function verdict(score){
    if(score==null)return{label:'Not scored yet',tone:''};
    if(score>=80)return{label:'Strong position',tone:'ok'};
    if(score>=65)return{label:'Reasonable',tone:'ok'};
    if(score>=50)return{label:'Typical for New Jersey',tone:'warn'};
    return{label:'Worth a review',tone:'bad'};
  }
  function initials(){
    var name=WD.userName()||'W',parts=String(name).trim().split(/\s+/);
    return parts.slice(0,2).map(function(p){return p.charAt(0).toUpperCase();}).join('')||'W';
  }
  function dateLabel(){
    try{return new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}
    catch(_e){return '';}
  }
  function safeCssUrl(url){return String(url||'').replace(/[\\"')]/g,'');}
  function safePhotoUrl(url){try{var parsed=new URL(String(url||''),location.origin);return parsed.protocol==='https:'?parsed.href:'';}catch(_e){return'';}}
  function tileUrl(p,z){
    var lat=H.valid(p&&p.lat),lon=H.valid(p&&p.lon);if(lat==null||lon==null)return'';
    z=z||15;var n=Math.pow(2,z),x=Math.floor((lon+180)/360*n),rad=lat*Math.PI/180;
    var y=Math.floor((1-Math.asinh(Math.tan(rad))/Math.PI)/2*n);
    return 'https://a.basemaps.cartocdn.com/light_all/'+z+'/'+x+'/'+y+'.png';
  }
  function thumbStyle(p){
    var u=tileUrl(p,15);return u?' style="background-image:url(\''+safeCssUrl(u)+'\')"':'';
  }
  function statusFor(p){
    var g=WD.gapFor(p),cat=WD.categoryFor(p);
    if((g&&g.pct>=15)||cat==='bad')return{label:'Review',cls:'is-review'};
    if((g&&g.pct>=5)||cat==='warn')return{label:'Watch',cls:'is-watch'};
    return{label:'Good',cls:'is-good'};
  }
  function readLine(st){
    if(!st.count)return'Add a property to start building your Watchdog portfolio.';
    if(st.over>0)return st.over+' of '+st.count+' saved properties '+(st.over===1?'is':'are')+' currently worth a closer look.';
    return'Your saved properties are being monitored for meaningful changes.';
  }

  function paintStanding(){
    var st=WD.stats(),hour=new Date().getHours(),greet=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening',photo=safePhotoUrl(WD.userPhoto()),art=photo?'<div class="wdd-intro-art is-photo" aria-hidden="true"><div class="wdd-intro-palette palette-'+fallbackVariant+'"></div><img src="'+esc(photo)+'" alt=""></div>':'<div class="wdd-intro-art is-fallback" aria-hidden="true"><div class="wdd-intro-palette palette-'+fallbackVariant+'"></div></div>';
    H.el('wdd-standing').innerHTML=
      '<div class="wdd-appbar">'+
        '<form class="wdd-command" id="wdd-command" role="search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>'+
          '<input id="wdd-command-input" data-watchdog-address-search type="search" autocomplete="off" placeholder="Search any New Jersey property address..." aria-label="Search New Jersey property addresses">'+
          '<button class="wdd-command-voice" type="button" data-act="voice-search" aria-label="Search by voice" title="Search by voice"><i class="fas fa-microphone" aria-hidden="true"></i></button>'+
          '<kbd>⌘ K</kbd></form>'+
      '</div>'+
      '<div class="wdd-page-intro">'+art+'<div class="wdd-page-intro-copy"><h1>'+greet+', '+esc(WD.userName())+'</h1><p>'+esc(readLine(st))+'</p></div>'+
        '<div class="wdd-page-context"><b>'+esc(dateLabel())+'</b><span>Stay informed. Act on verified changes.</span></div></div>';
    var photoNode=d.querySelector('.wdd-intro-art img');
    if(photoNode)photoNode.addEventListener('error',function(){photoNode.hidden=true;photoNode.parentElement.classList.add('is-fallback');},{once:true});
    if(typeof w.WatchdogNJAddressAutocompleteRefresh==='function')w.setTimeout(w.WatchdogNJAddressAutocompleteRefresh,0);
  }

  function paintSignals(){
    var st=WD.stats(),score=st.score==null?null:Math.round(st.score),v=verdict(score),review=st.warn+st.bad;
    var avgTax=st.count&&st.tax?st.tax/st.count:0;
    var items=[
      {c:'is-score',k:'Watchdog Score',icon:'fa-chart-simple',v:score==null?'—':score+' <small>/ 100</small>',n:v.label,t:v.tone,raw:true},
      {k:'Properties',icon:'fa-house',v:st.count.toLocaleString(),n:'Saved properties'},
      {k:'Market Estimate',icon:'fa-coins',v:st.value?H.money(st.value):'—',n:st.value?'Current governed estimate':'Needs market evidence'},
      {k:'Annual Tax',icon:'fa-file-invoice-dollar',v:st.tax?H.money(st.tax):'—',n:avgTax?H.dollars(avgTax)+' avg per property':'No tax total yet'},
      {c:'is-review',k:'Worth Reviewing',icon:'fa-flag',v:review.toLocaleString(),n:review+' of '+st.count+' properties',t:st.bad?'bad':st.warn?'warn':'ok'}
    ];
    var cards=items.map(function(i){
      return '<article class="wdd-signal '+(i.c||'')+'"><div class="wdd-signal-top"><div class="wdd-signal-k">'+esc(i.k)+'</div><span class="wdd-signal-icon"><i class="fas '+i.icon+'" aria-hidden="true"></i></span></div>'+
        '<div class="wdd-signal-v'+(i.t?' wdd-'+i.t:'')+'">'+(i.raw?i.v:esc(i.v))+'</div><div class="wdd-signal-n">'+esc(i.n)+'</div></article>';
    }).join('');
    cards+='<a class="wdd-signal wdd-sponsor-signal" href="https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=dashboard_kpi" target="_blank" rel="noopener sponsored" aria-label="Advertisement: Greentree Mortgage, John Varano">'+
      '<div class="wdd-sponsor-top"><span class="wdd-ad-label">Advertisement</span><img src="/johnvarano.jpg" alt="" loading="lazy"></div>'+
      '<strong>Greentree Mortgage</strong><span>Know the payment before you make the move.</span><em>John Varano · NMLS #142739 <i class="fas fa-arrow-right" aria-hidden="true"></i></em>'+
      '<small>Separate company · Shop for any lender</small></a>';
    H.el('wdd-signals').innerHTML=cards;
  }

  var COLS=[
    {key:'address',label:'Property'},
    {key:'assessed',label:'Assessed',r:true},
    {key:'value',label:'Market est.',r:true},
    {key:'gap',label:'Gap',r:true},
    {key:'tax',label:'Annual tax',r:true},
    {key:'score',label:'Score',r:true},
    {key:null,label:'Status'},
    {key:null,label:'',r:true}
  ];
  function sortValue(p,key){
    var g=WD.gapFor(p),s=S.scores[p.pams_pin];
    if(key==='address')return String(p.address||'').toLowerCase();
    if(key==='assessed')return H.num(p.assessed);
    if(key==='value')return H.num(p.watchdog_value);
    if(key==='gap')return g?g.pct:-999;
    if(key==='tax')return H.num(p.last_year_tax);
    if(key==='score')return s?s.score:-1;
    return 0;
  }
  function sortedProps(){
    var props=WD.filtered().slice(),dir=S.sort.dir==='asc'?1:-1;
    props.sort(function(a,b){var x=sortValue(a,S.sort.key),y=sortValue(b,S.sort.key);return x===y?0:(x>y?1:-1)*dir;});
    return props;
  }
  function rows(){
    return sortedProps().map(function(p){
      var g=WD.gapFor(p),s=S.scores[p.pams_pin],sc=s?Math.round(s.score):null,status=statusFor(p),gapTone=g==null?'':' wdd-'+(g.pct>=15?'bad':g.pct>=5?'warn':'ok');
      return '<tr data-pin="'+esc(p.pams_pin||'')+'">'+
        '<td><div class="wdd-property-cell"><span class="wdd-property-thumb"'+thumbStyle(p)+'><i class="fas fa-house"></i></span><div class="wdd-addr"><span>'+esc(p.address||p.pams_pin||'Saved property')+'</span><small>'+esc([H.titleCase(p.town),H.titleCase(p.county)].filter(Boolean).join(' · ')||'New Jersey')+'</small></div></div></td>'+
        '<td class="wdd-r wdd-fig">'+(p.assessed?H.money(p.assessed):'—')+'</td>'+
        '<td class="wdd-r wdd-fig">'+(p.watchdog_value?H.money(p.watchdog_value):'—')+'</td>'+
        '<td class="wdd-r"><span class="wdd-fig'+gapTone+'">'+(g==null?'—':(g.pct>0?'+':'')+g.pct.toFixed(1)+'%')+'</span>'+(g&&g.dollars?'<span class="wdd-sub">'+esc(H.dollars(g.dollars))+'/yr</span>':'')+'</td>'+
        '<td class="wdd-r wdd-fig">'+(p.last_year_tax?H.money(p.last_year_tax):'—')+(p.last_year_tax_year?'<span class="wdd-sub">'+esc(String(p.last_year_tax_year))+(p.municipal_tax_live?' municipal':'')+'</span>':'')+'</td>'+
        '<td class="wdd-r"><span class="wdd-scorecell wdd-'+WD.categoryFor(p)+'"><b>'+(sc==null?'—':sc)+'</b></span></td>'+
        '<td><span class="wdd-status-pill '+status.cls+'">'+status.label+'</span></td>'+
        '<td class="wdd-r wdd-row-actions-cell"><button class="wdd-row-menu" type="button" aria-label="Property options" aria-expanded="false"><i class="fas fa-ellipsis"></i></button>'+
          '<div class="wdd-row-actions" hidden role="menu">'+
            '<a role="menuitem" data-property-action="open" href="/property/home?pin='+encodeURIComponent(p.pams_pin||'')+'"><i class="fas fa-house"></i><span>Open property</span></a>'+
            '<a role="menuitem" data-property-action="report" href="/property/report?pin='+encodeURIComponent(p.pams_pin||'')+'"><i class="fas fa-file-lines"></i><span>Full report</span></a>'+
            '<a role="menuitem" data-property-action="pulse" href="/property/pulse?pin='+encodeURIComponent(p.pams_pin||'')+'"><i class="fas fa-wave-square"></i><span>View changes</span></a>'+
            '<a role="menuitem" data-property-action="lookup" href="/property/?address='+encodeURIComponent(p.address||'')+'"><i class="fas fa-magnifying-glass"></i><span>New lookup</span></a>'+
            '<button role="menuitem" type="button" data-property-action="copy-address" data-address="'+esc(p.address||'')+'"><i class="far fa-copy"></i><span>Copy address</span></button>'+
          '</div></td>'+
      '</tr>';
    }).join('');
  }
  function paintPositions(){
    var props=WD.filtered(),current=COLS.filter(function(c){return c.key===S.sort.key;})[0]||COLS[0];
    var head=COLS.map(function(c){
      if(!c.key)return '<th'+(c.r?' class="wdd-r"':'')+'>'+esc(c.label)+'</th>';
      var arrow=S.sort.key===c.key?(S.sort.dir==='asc'?' ↑':' ↓'):'';
      return '<th'+(c.r?' class="wdd-r"':'')+'><button type="button" data-sort="'+c.key+'">'+esc(c.label)+arrow+'</button></th>';
    }).join('');
    var body=props.length?'<div class="wdd-scrollx"><table class="wdd-table"><thead><tr>'+head+'</tr></thead><tbody>'+rows()+'</tbody></table></div>':
      '<div class="wdd-empty"><i class="fas fa-folder-open" aria-hidden="true"></i><p>No saved properties yet. Look one up and it will appear here with assessment, tax and Watchdog status.</p><a href="/property/">Look up an address</a></div>';
    // content-architecture: dynamic — portfolio markup depends on authenticated rows, sort state, and table/map mode.
    H.el('wdd-positions').innerHTML='<div class="wdd-panel"><div class="wdd-panel-head"><div><h2>Your Portfolio</h2><p>'+props.length+' propert'+(props.length===1?'y':'ies')+' · Sorted by '+esc(current.label.toLowerCase())+'</p></div><div class="wdd-fill"></div><div class="wdd-tabs" role="tablist"><button type="button" role="tab" data-tab="ledger" aria-selected="'+(S.tab==='ledger')+'">Table</button><button type="button" role="tab" data-tab="map" aria-selected="'+(S.tab==='map')+'">Map</button></div></div>'+
      (S.tab==='map'?'<div id="wdd-map"></div>':body)+'</div>';
    if(S.tab==='map')drawMap();
  }
  function drawMap(){
    if(!w.L)return;var node=H.el('wdd-map');if(!node)return;if(map){map.remove();map=null;}
    map=w.L.map(node,{scrollWheelZoom:false,zoomControl:true,attributionControl:false}).setView([40.06,-74.5],8);
    w.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
    var colors={bad:'#e24b5b',warn:'#d98b08',ok:'#16a365'},bounds=[];
    WD.filtered().forEach(function(p){
      if(H.valid(p.lat)==null||H.valid(p.lon)==null)return;
      w.L.circleMarker([H.num(p.lat),H.num(p.lon)],{radius:7,weight:2,color:'#fff',fillColor:colors[WD.categoryFor(p)]||'#2563eb',fillOpacity:1}).addTo(map)
        .bindPopup('<b>'+esc(p.address||'Saved property')+'</b><br>'+esc(H.titleCase(p.town||'')));
      bounds.push([H.num(p.lat),H.num(p.lon)]);
    });
    if(bounds.length)map.fitBounds(bounds,{padding:[24,24],maxZoom:12});
    setTimeout(function(){if(map)map.invalidateSize();},60);
  }

  function feedTone(r){var s=String(r.severity||'').toLowerCase();if(s==='high'||s==='critical')return'is-bad';if(s==='medium'||s==='warning')return'is-warn';if(H.num(r.delta_numeric)<0)return'is-ok';return'';}
  function feedIcon(r){var t=String(r.event_type||r.marker_id||'').toLowerCase();if(/tax|assessment|ratio/.test(t))return'fa-receipt';if(/sale|market|value/.test(t))return'fa-house';if(/permit|construction/.test(t))return'fa-file-lines';if(/class/.test(t))return'fa-layer-group';if(/appeal/.test(t))return'fa-gavel';return'fa-wave-square';}
  function addressFor(pin){var p=S.properties.find(function(x){return x.pams_pin===pin;});return p?(p.address||''):'';}

  function railHistogram(){
    var vals=WD.filtered().map(WD.gapFor).filter(Boolean).map(function(g){return Math.max(-30,Math.min(30,g.pct));});
    var bins=[0,0,0,0,0,0,0,0,0,0,0,0],step=5;
    vals.forEach(function(v){var idx=Math.min(bins.length-1,Math.max(0,Math.floor((v+30)/step)));bins[idx]+=1;});
    var max=Math.max.apply(null,bins.concat([1]));
    return bins.map(function(v,i){var h=16+(v/max)*70;return '<i class="'+(i===6?'is-you':'')+'" style="--h:'+h.toFixed(0)+'%"></i>';}).join('');
  }
  function analysisCopy(){
    var st=WD.stats();if(!st.assessed||!st.value)return'Add market evidence to compare your portfolio against current value.';
    var pct=(st.assessed/st.value-1)*100,dir=pct>0?'above':'below';
    return 'Your portfolio is <b>'+Math.abs(pct).toFixed(0)+'% '+dir+' market</b> on aggregate'+(st.atStake?', representing '+H.dollars(st.atStake)+' a year across flagged gaps.':'.');
  }
  function taxDistribution(){
    var bands=[{label:'Under $5k',min:0,max:5000,count:0},{label:'$5k–$10k',min:5000,max:10000,count:0},{label:'$10k–$20k',min:10000,max:20000,count:0},{label:'$20k+',min:20000,max:Infinity,count:0}],taxes=WD.filtered().map(function(p){return H.valid(p.last_year_tax);}).filter(function(v){return v!=null&&v>0;}),total=H.sum(taxes),max=1;
    taxes.forEach(function(value){for(var i=0;i<bands.length;i++){if(value>=bands[i].min&&value<bands[i].max){bands[i].count++;break;}}});
    bands.forEach(function(b){max=Math.max(max,b.count);});
    if(!taxes.length)return'<div class="wdd-analysis-empty">Tax distribution will appear when annual tax data is available for your saved properties.</div>';
    return'<div class="wdd-tax-distribution" role="img" aria-label="Annual tax distribution across '+taxes.length+' properties">'+bands.map(function(b){var height=Math.max(5,Math.round((b.count/max)*100));return'<div class="wdd-tax-band"><div class="wdd-tax-bar-wrap"><i class="wdd-tax-bar" style="height:'+height+'%"></i></div><b>'+b.count+'</b><span>'+b.label+'</span></div>';}).join('')+'</div><div class="wdd-analysis-copy">Annual taxes total <b>'+esc(H.dollars(total))+'</b> across '+taxes.length+' properties with tax data.</div>';
  }
  function drawRailMap(){
    if(!w.L)return;var node=H.el('wdd-rail-map');if(!node)return;if(railMap){railMap.remove();railMap=null;}
    railMap=w.L.map(node,{scrollWheelZoom:false,dragging:false,zoomControl:false,attributionControl:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false}).setView([40.06,-74.5],8);
    w.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(railMap);
    var bounds=[];
    WD.filtered().forEach(function(p){
      if(H.valid(p.lat)==null||H.valid(p.lon)==null)return;
      w.L.circleMarker([H.num(p.lat),H.num(p.lon)],{radius:5,weight:2,color:'#fff',fillColor:'#2563eb',fillOpacity:1}).addTo(railMap);
      bounds.push([H.num(p.lat),H.num(p.lon)]);
    });
    if(bounds.length)railMap.fitBounds(bounds,{padding:[18,18],maxZoom:10});
    setTimeout(function(){if(railMap)railMap.invalidateSize();},80);
  }
  function paintRail(){
    var st=WD.stats(),recent=st.changes.slice(0,4);
    var feed=recent.length?recent.map(function(r){
      var tone=feedTone(r);return '<div class="wdd-feed-item '+tone+'"><span class="wdd-feed-source '+tone+'"><i class="fas '+feedIcon(r)+'" aria-hidden="true"></i></span><div><b>'+esc(r.title||H.pretty(r.event_type))+'</b><small>'+esc(addressFor(r.pams_pin)||r.pams_pin||'Saved property')+' · '+esc(H.ago(r.occurred_at))+'</small></div></div>';
    }).join(''):'<div class="wdd-empty" style="padding:24px 14px"><p>Nothing has changed on your properties in the last 120 days.</p></div>';
    // content-architecture: dynamic — rail modules combine live saved-property counts, map state, events, and calculated portfolio distribution.
    H.el('wdd-rail').innerHTML=
      '<div class="wdd-rail-sticky"><div class="wdd-rail-scroll">'+
      '<section class="wdd-panel wdd-portfolio-map-card"><div class="wdd-panel-head"><div><h2>Your Portfolio</h2></div><a class="wdd-panel-link" href="#" data-tab-link="map">View map →</a></div><div class="wdd-map-wrap"><div id="wdd-rail-map"></div><span class="wdd-map-stat"><i class="fas fa-location-dot"></i>'+st.count+' properties</span></div></section>'+
      '<section class="wdd-panel" id="wdd-activity"><div class="wdd-panel-head"><div><h2>Recent Changes</h2><p>'+(st.changes30?st.changes30+' in the last 30 days':'Last 120 days')+'</p></div><a class="wdd-panel-link" href="/property/pulse">View all →</a></div>'+feed+'</section>'+
      '<section class="wdd-panel wdd-analysis-card"><div class="wdd-panel-head"><div><h2>Portfolio Analysis</h2></div></div><div class="wdd-analysis-tabs" role="tablist" aria-label="Portfolio analysis views"><button class="wdd-analysis-tab" id="wdd-analysis-tab-assessed" role="tab" aria-controls="wdd-analysis-assessed" aria-selected="'+(analysisTab==='assessed')+'" data-analysis-tab="assessed" type="button">Assessed vs Market</button><button class="wdd-analysis-tab" id="wdd-analysis-tab-tax" role="tab" aria-controls="wdd-analysis-tax" aria-selected="'+(analysisTab==='tax')+'" data-analysis-tab="tax" type="button">Tax Distribution</button></div><div class="wdd-analysis-panel" id="wdd-analysis-assessed" role="tabpanel" aria-labelledby="wdd-analysis-tab-assessed"'+(analysisTab==='assessed'?'':' hidden')+'><div class="wdd-histogram" role="img" aria-label="Assessment gap distribution">'+railHistogram()+'</div><div class="wdd-analysis-copy">'+analysisCopy()+'</div></div><div class="wdd-analysis-panel" id="wdd-analysis-tax" role="tabpanel" aria-labelledby="wdd-analysis-tab-tax"'+(analysisTab==='tax'?'':' hidden')+'>'+taxDistribution()+'</div></section></div></div>';
    drawRailMap();
  }

  function cases(){
    var out=[];WD.filtered().forEach(function(p){
      var g=WD.gapFor(p);if(!g||g.pct<5)return;
      var f=S.findings.find(function(x){return x.pams_pin===p.pams_pin;});
      out.push({p:p,g:g,dollars:g.dollars||0,why:(f&&H.copy(f.why_now))||''});
    });
    return out.sort(function(a,b){return b.dollars-a.dollars;});
  }
  function paintQueue(){
    var list=cases(),count=list.length,head='<div class="wdd-queue-head"><div><h2>Action Queue <span class="wdd-queue-count">'+count+'</span></h2><p>Properties with the biggest review opportunities based on current governed market evidence.</p></div><a class="wdd-queue-link" href="#wdd-positions">View all →</a></div>';
    if(!WD.isPro()){
      // content-architecture: dynamic — gated queue copy and actions depend on entitlement plus the live review-case count.
      H.el('wdd-queue').innerHTML=head+'<div class="wdd-gate"><h3>'+(count?'Watchdog found '+count+' propert'+(count===1?'y':'ies')+' worth reviewing':'Nothing needs review right now')+'</h3><p>The gap remains visible in your portfolio. Professional plans add the governed evidence file and decision workflow.</p><a class="wdd-gate-cta" href="/property/pro">Compare plans <i class="fas fa-arrow-right"></i></a></div>';return;
    }
    if(!list.length){
      // content-architecture: dynamic — this empty state depends on the live authenticated review queue.
      H.el('wdd-queue').innerHTML=head+'<div class="wdd-gate"><h3>Nothing to review right now</h3><p>No saved property is currently assessed above the review threshold. Watchdog keeps monitoring the evidence.</p></div>';return;
    }
    // content-architecture: dynamic — review cards are ranked from the authenticated portfolio and governed gap calculations.
    H.el('wdd-queue').innerHTML=head+'<div class="wdd-cases">'+list.slice(0,3).map(function(c){
      return '<article class="wdd-case"><span class="wdd-case-thumb"'+thumbStyle(c.p)+'><i class="fas fa-house"></i></span><div class="wdd-case-main"><h3 class="wdd-case-title">'+esc(c.p.address||c.p.pams_pin||'Saved property')+'</h3><span class="wdd-case-place">'+esc([H.titleCase(c.p.town),H.titleCase(c.p.county)].filter(Boolean).join(', ')||'New Jersey')+'</span><span class="wdd-gap-pill">+'+c.g.pct.toFixed(1)+'% gap</span></div><div class="wdd-case-row"><span class="wdd-case-value"><b>'+(c.dollars?H.dollars(c.dollars):'—')+'</b><small>a year</small></span><a class="wdd-case-review" href="/property/report?pin='+encodeURIComponent(c.p.pams_pin||'')+'">Review</a></div></article>';
    }).join('')+'</div>';
  }

  function paintFoot(){
    H.el('wdd-foot').innerHTML='<b>Decision-support data.</b> Market estimates and gap figures are not appraisals or legal conclusions. A gap does not establish appeal eligibility or success. Verify filing decisions against original county and municipal records.';
  }
  function cycleCounty(){
    var list=['ALL'].concat(WD.counties());S.county=list[(list.indexOf(S.county)+1)%list.length];WD.repaint();WD.toast(S.county==='ALL'?'Showing all counties':'Showing '+H.titleCase(S.county)+' County');
  }
  function exportCsv(){
    var st=WD.stats(),out=[['Watchdog portfolio export',new Date().toISOString()],[],['Metric','Value'],['Properties',st.count],['Watchdog Score',st.score==null?'':st.score.toFixed(1)],['Market estimate',Math.round(st.value)],['Assessed total',Math.round(st.assessed)],['Annual tax',Math.round(st.tax)],['Above evidence',st.over],['Annual gap estimate',Math.round(st.atStake)],[],['Address','Town','County','Assessed','Market estimate','Gap %','Annual gap estimate','Annual tax','Watchdog Score']];
    WD.filtered().forEach(function(p){var g=WD.gapFor(p),s=S.scores[p.pams_pin];out.push([p.address||'',p.town||'',p.county||'',p.assessed||'',p.watchdog_value||'',g?g.pct.toFixed(2):'',g&&g.dollars?Math.round(g.dollars):'',p.last_year_tax||'',s?Math.round(s.score):'']);});
    var csv=out.map(function(r){return r.map(function(v){return'"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=d.createElement('a');a.href=url;a.download='watchdog-portfolio.csv';d.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);WD.toast('Exported '+WD.filtered().length+' properties');
  }
  function openMoreMenu(){
    if(w.WatchdogPublicNav&&typeof w.WatchdogPublicNav.open==='function'){w.WatchdogPublicNav.open('main');return;}
    var trigger=d.querySelector('#wd-menu-trigger,.wdx-menu,.wd4-menu,[data-wd-menu-toggle]');
    if(trigger&&typeof trigger.click==='function')trigger.click();else location.href='/property/account';
  }
  function closePropertyMenus(except){
    Array.prototype.slice.call(d.querySelectorAll('.wdd-row-actions')).forEach(function(menu){
      if(menu===except)return;
      menu.hidden=true;
      var button=menu.parentNode&&menu.parentNode.querySelector('.wdd-row-menu');
      if(button)button.setAttribute('aria-expanded','false');
    });
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
  function onClick(ev){
    if(!ev.target||!ev.target.closest)return;
    var analysisButton=ev.target.closest('[data-analysis-tab]');if(analysisButton){analysisTab=analysisButton.getAttribute('data-analysis-tab')==='tax'?'tax':'assessed';var tabs=d.querySelectorAll('[data-analysis-tab]');Array.prototype.forEach.call(tabs,function(button){button.setAttribute('aria-selected',button===analysisButton?'true':'false');});var panels=d.querySelectorAll('.wdd-analysis-panel');Array.prototype.forEach.call(panels,function(panel){panel.hidden=panel.id!==(analysisTab==='tax'?'wdd-analysis-tax':'wdd-analysis-assessed');});return;}
    var mapLink=ev.target.closest('[data-tab-link="map"]');if(mapLink){ev.preventDefault();S.tab='map';paintPositions();var p=H.el('wdd-positions');if(p)p.scrollIntoView({behavior:'smooth',block:'start'});return;}
    var sortBtn=ev.target.closest('[data-sort]');if(sortBtn){var k=sortBtn.getAttribute('data-sort');if(S.sort.key===k)S.sort.dir=S.sort.dir==='asc'?'desc':'asc';else{S.sort.key=k;S.sort.dir=k==='address'?'asc':'desc';}paintPositions();return;}
    var tab=ev.target.closest('[data-tab]');if(tab){S.tab=tab.getAttribute('data-tab');paintPositions();return;}
    var propertyAction=ev.target.closest('[data-property-action]');if(propertyAction){
      ev.stopPropagation();
      var pa=propertyAction.getAttribute('data-property-action');
      if(pa==='copy-address'){
        ev.preventDefault();
        var address=propertyAction.getAttribute('data-address')||'';
        if(address&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(address).then(function(){WD.toast('Address copied');}).catch(function(){WD.toast('Could not copy address');});
      }
      closePropertyMenus();
      return;
    }
    var menu=ev.target.closest('.wdd-row-menu');if(menu){
      ev.preventDefault();ev.stopPropagation();
      var actionMenu=menu.parentNode&&menu.parentNode.querySelector('.wdd-row-actions'),open=actionMenu&&actionMenu.hidden;
      closePropertyMenus(actionMenu);
      if(actionMenu){actionMenu.hidden=!open;menu.setAttribute('aria-expanded',open?'true':'false');}
      return;
    }
    if(!ev.target.closest('.wdd-row-actions'))closePropertyMenus();
    var row=ev.target.closest('tr[data-pin]');if(row&&row.getAttribute('data-pin')){location.href='/property/home?pin='+encodeURIComponent(row.getAttribute('data-pin'));return;}
    var act=ev.target.closest('[data-act]');if(!act)return;var a=act.getAttribute('data-act');
    if(a==='export')exportCsv();else if(a==='county')cycleCounty();else if(a==='mobile-more')openMoreMenu();else if(a==='voice-search')startVoiceSearch(act);
  }
  function onSubmit(ev){
    if(ev.target&&ev.target.id==='wdd-command'){ev.preventDefault();var input=H.el('wdd-command-input'),q=String(input&&input.value||'').trim();location.href='/property/'+(q?'?address='+encodeURIComponent(q):'');}
  }
  function onKeydown(ev){
    if((ev.metaKey||ev.ctrlKey)&&String(ev.key).toLowerCase()==='k'){var input=H.el('wdd-command-input');if(input){ev.preventDefault();input.focus();}}
  }
  function paintAll(){paintStanding();paintSignals();paintQueue();paintPositions();paintRail();paintFoot();}
  d.addEventListener('click',onClick);d.addEventListener('submit',onSubmit);d.addEventListener('keydown',onKeydown);WD.onRepaint(paintAll);paintAll();
}
if(w.WD&&w.WD.S&&w.WD.S.user)start();else d.addEventListener('wd:ready',start,{once:true});
})(window,document);

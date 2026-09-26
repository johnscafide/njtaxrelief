/* Watchdog Dashboard V3 renderer. Reads WD state; never fetches. */
(function(w,d){
'use strict';
function start(){
  var WD=w.WD;if(!WD)return;var H=WD.H,S=WD.S,esc=H.esc,map=null,railMap=null,voiceRecognition=null,analysisTab='assessed',selectedGapBin=-1;
  var selectedPropertyPin='',mobileDrawerOpenerPin='',inspectorDismissed=false;

  function greeting(){
    var phrases=['Be informed','Stay ahead','See the full picture',"Know what's changing",'Make informed moves','Lead with clarity','Decide with confidence'];
    var today=new Date(),dayKey=today.getFullYear()*372+today.getMonth()*31+today.getDate(),phrase=phrases[((dayKey%phrases.length)+phrases.length)%phrases.length];
    var name=String(WD.userName()||'').trim().split(/\s+/)[0]||'';
    if(!name||name==='there'||name.indexOf('@')>-1) return phrase;
    return phrase+', '+name;
  }
  function safeCssUrl(url){return String(url||'').replace(/[\\"')]/g,'');}
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

  // Appeal calendar. Mirrors appeal-deadline-rules.json (alternate_calendar_counties
  // and baseline_month_day). The renderer never fetches, so the two baselines live
  // here. Per that file's display_policy we show the statutory baseline only, never
  // a countdown, and always tell the member to verify against their notice.
  var APPEAL_ALT_COUNTIES=['BURLINGTON','GLOUCESTER','MONMOUTH'];
  function countyKey(c){return String(c||'').trim().toUpperCase().replace(/\s+COUNTY$/,'');}
  function nextBaseline(month,day){var now=new Date(),y=now.getFullYear();if(now>new Date(y,month-1,day,23,59,59))y+=1;return new Date(y,month-1,day);}
  function shortDate(dt){try{return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(_e){return'';}}
  function appealBaseline(props){
    var alt=false,trad=false;
    props.forEach(function(p){var k=countyKey(p.county);if(!k)return;if(APPEAL_ALT_COUNTIES.indexOf(k)>-1)alt=true;else trad=true;});
    var dates=[];if(alt)dates.push(shortDate(nextBaseline(1,15)));if(trad)dates.push(shortDate(nextBaseline(4,1)));
    return dates.filter(Boolean).length?{dates:dates,mixed:alt&&trad}:null;
  }

  function heroState(st){
    if(!st.count)return'empty';
    if(st.over>0)return'review';
    var measured=WD.filtered().some(function(p){return WD.gapFor(p)!=null;});
    return measured?'clear':'watch';
  }
  function heroOverMarketAlert(st){
    if(!st.over)return'';
    var noun=st.over===1?'property is':'properties are';
    var description=st.over+' '+noun+' assessed at least 5% above market evidence';
    return'<button class="wdd-h27-alert" type="button" data-act="show-overmarket-evidence" title="'+esc(description)+'" aria-label="'+esc(description+'. Show assessed versus market evidence')+'"><i class="fas fa-bell" aria-hidden="true"></i><span>'+st.over.toLocaleString()+'</span></button>';
  }
  function heroSince(st){
    if(!st.count)return'';
    var bits=[],base=appealBaseline(WD.filtered());
    bits.push('<li><i class="fas fa-wave-square" aria-hidden="true"></i><span><b>'+st.changes30+'</b> '+(st.changes30===1?'change':'changes')+' in the last 30 days</span></li>');
    if(base)bits.push('<li><i class="fas fa-calendar-day" aria-hidden="true"></i><span>Next appeal baseline <b>'+base.dates.map(esc).join('</b> or <b>')+'</b>'+(base.mixed?' by county':'')+' · verify on your assessment notice</span></li>');
    return'<ul class="wdd-h27-since">'+bits.join('')+'</ul>';
  }

  function paintStanding(){
    var st=WD.stats(),state=heroState(st);
    var host=H.el('wdd-standing');
    // Keep the score panel node across repaints so its arc animates from the
    // previous value instead of flashing empty and redrawing from zero.
    var keep=host.querySelector('.wdd-h27-score');if(keep)keep.remove();
    host.innerHTML=
      '<div class="wdd-appbar">'+
        '<form class="wdd-command" id="wdd-command" role="search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>'+
          '<input id="wdd-command-input" data-watchdog-address-search type="search" autocomplete="off" placeholder="Search any New Jersey property address..." aria-label="Search New Jersey property addresses">'+
          '<button class="wdd-command-voice" type="button" data-act="voice-search" aria-label="Search by voice" title="Search by voice"><i class="fas fa-microphone" aria-hidden="true"></i></button>'+
          '<kbd>⌘ K</kbd></form>'+
      '</div>'+
      '<div class="wdd-h27" id="wdd-hero" data-state="'+state+'">'+
        '<div class="wdd-h27-main">'+
          '<div class="wdd-h27-who"><div class="wdd-h27-who-text">'+
            '<div class="wdd-h27-eyebrow"><span>'+(st.count?st.count.toLocaleString()+' '+(st.count===1?'property':'properties')+' watched':'No properties yet')+'</span></div>'+
            '<h1>'+esc(greeting())+'</h1></div></div>'+
          heroOverMarketAlert(st)+
          heroSince(st)+
        '</div>'+
        '<div class="wdd-h27-slot" id="wdd-hero-score"></div>'+
      '</div>';
    if(keep)H.el('wdd-hero-score').appendChild(keep);
    if(typeof w.WatchdogNJAddressAutocompleteRefresh==='function')w.setTimeout(w.WatchdogNJAddressAutocompleteRefresh,0);
  }

  function paintSignals(){
    var st=WD.stats(),review=st.warn+st.bad;
    var avgTax=st.count&&st.tax?st.tax/st.count:0;
    var items=[
      {k:'Properties',icon:'fa-house',v:st.count.toLocaleString(),n:'Saved properties'},
      {k:'Market Estimate',icon:'fa-coins',v:st.value?H.money(st.value):'—',n:st.value?'Current governed estimate':'Needs market evidence'},
      {k:'Annual Tax',icon:'fa-file-invoice-dollar',v:st.tax?H.money(st.tax):'—',n:avgTax?H.dollars(avgTax)+' avg per property':'No tax total yet'},
      {c:'is-review',k:'Worth Reviewing',icon:'fa-flag',v:review.toLocaleString(),n:review+' of '+st.count+' properties',t:st.bad?'bad':st.warn?'warn':'ok'}
    ];
    var cards=items.map(function(i){
      return '<article class="wdd-signal '+(i.c||'')+'"><div class="wdd-signal-top"><div class="wdd-signal-k">'+esc(i.k)+'</div><span class="wdd-signal-icon"><i class="fas '+i.icon+'" aria-hidden="true"></i></span></div>'+
        '<div class="wdd-signal-v'+(i.t?' wdd-'+i.t:'')+'">'+(i.raw?i.v:esc(i.v))+'</div><div class="wdd-signal-n">'+esc(i.n)+'</div></article>';
    }).join('');
    cards+='<a class="wdd-signal wdd-sponsor-signal" href="https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=dashboard_kpi" target="_blank" rel="noopener sponsored" aria-label="Advertisement: Greentree Mortgage. Explore purchase, refinance, and home equity options with John Varano, NMLS 142739.">'+
      '<div class="wdd-sponsor-top"><span class="wdd-ad-label">Advertisement</span><img src="/johnvarano.jpg" alt="" loading="lazy"></div>'+
      '<strong>Greentree Mortgage</strong><span>Know the full monthly number before you start making offers. Get a quick estimate for purchase, refinance, or home equity options.</span><em>John Varano · NMLS #142739</em>'+
      '<span class="wdd-sponsor-cta">Start a quick estimate <i class="fas fa-arrow-right" aria-hidden="true"></i></span></a>';
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
      var pin=String(p.pams_pin||''),selected=pin===selectedPropertyPin;
      return '<tr data-pin="'+esc(pin)+'" class="'+(selected?'is-selected':'')+'">'+
        '<td><div class="wdd-property-cell"><span class="wdd-property-thumb"'+thumbStyle(p)+' aria-hidden="true"><i class="fas fa-house"></i></span><button class="wdd-select-property" type="button" data-select-pin="'+esc(pin)+'" aria-current="'+(selected?'true':'false')+'"><span>'+esc(p.address||p.pams_pin||'Saved property')+'</span><small>'+esc([H.titleCase(p.town),H.titleCase(p.county)].filter(Boolean).join(' · ')||'New Jersey')+'</small></button></div></td>'+
        '<td class="wdd-r wdd-fig" data-label="Assessed">'+(p.assessed?H.money(p.assessed):'—')+'</td>'+
        '<td class="wdd-r wdd-fig" data-label="Market est.">'+(p.watchdog_value?H.money(p.watchdog_value):'—')+'</td>'+
        '<td class="wdd-r" data-label="Gap"><span class="wdd-fig'+gapTone+'">'+(g==null?'—':(g.pct>0?'+':'')+g.pct.toFixed(1)+'%')+'</span>'+(g&&g.dollars?'<span class="wdd-sub">'+esc(H.dollars(g.dollars))+'/yr</span>':'')+'</td>'+
        '<td class="wdd-r wdd-fig" data-label="Annual tax">'+(p.last_year_tax?H.money(p.last_year_tax):'—')+(p.last_year_tax_year?'<span class="wdd-sub">'+esc(String(p.last_year_tax_year))+(p.municipal_tax_live?' municipal':'')+'</span>':'')+'</td>'+
        '<td class="wdd-r" data-label="Score"><span class="wdd-scorecell wdd-'+WD.categoryFor(p)+'"><b>'+(sc==null?'—':sc)+'</b></span></td>'+
        '<td data-label="Status"><span class="wdd-status-pill '+status.cls+'">'+status.label+'</span></td>'+
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
  function inspectorContent(p,suffix){
    if(!p)return '<div class="wdd-property-inspector-empty"><i class="fas fa-house" aria-hidden="true"></i><p>Select a property to see its quick details.</p></div>';
    var place=[H.titleCase(p.town),H.titleCase(p.county)].filter(Boolean).join(', ');
    var taxYear=p.last_year_tax_year||null;
    var open='/property/home?pin='+encodeURIComponent(p.pams_pin||'');
    return '<div class="wdd-inspector-heading"><div><p class="wdd-inspector-kicker">Property snapshot</p><h3 id="wdd-property-detail-title-'+suffix+'">'+esc(p.address||p.pams_pin||'Saved property')+'</h3><p class="wdd-inspector-place">'+esc(place||'New Jersey')+(p.pams_pin?' · PIN '+esc(p.pams_pin):'')+'</p></div>'+(suffix==='desktop'?'<button class="wdd-inspector-close" type="button" data-inspector-close aria-label="Close property details"><i class="fas fa-xmark" aria-hidden="true"></i></button>':'')+'</div>'+
      '<dl class="wdd-inspector-values"><div><dt>Assessed value'+(p.assessment_year?' · '+esc(String(p.assessment_year)):'')+'</dt><dd>'+(p.assessed?esc(H.money(p.assessed)):'Not available')+'</dd></div><div><dt>Market estimate</dt><dd>'+(p.watchdog_value?esc(H.money(p.watchdog_value)):'Not available')+'</dd></div><div><dt>Annual tax'+(taxYear?' · '+esc(String(taxYear)):'')+'</dt><dd>'+(p.last_year_tax?esc(H.money(p.last_year_tax)):'Not available')+'</dd></div></dl>'+
      taxHistoryContent(p)+
      '<section class="wdd-inspector-section"><h4>Owner</h4><p>Owner details are not available in this dashboard.</p></section>'+
      '<section class="wdd-inspector-section"><h4>Connections &amp; activity</h4><p>CRM/BoldTrail links and property activity are not available in this dashboard.</p></section>'+
      '<a class="wdd-inspector-open" href="'+open+'">Open property <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>';
  }
  function externalHttpsUrl(value){try{var parsed=new URL(String(value||''),location.origin);return parsed.protocol==='https:'?parsed.href:'';}catch(_e){return'';}}
  function taxHistoryContent(p){
    var annual=p.municipal_tax_live===true&&p.municipal_tax_annual&&typeof p.municipal_tax_annual==='object'?p.municipal_tax_annual:null;
    var years=annual?Object.keys(annual).filter(function(year){return /^\d{4}$/.test(year);}).sort(function(a,b){return Number(b)-Number(a);}):[];
    if(!p.municipal_tax_live)return '<section class="wdd-inspector-section wdd-tax-history"><h4>Annual tax history</h4><p>Not available in this dashboard because no exact municipal match is loaded.</p></section>';
    if(!years.length)return '<section class="wdd-inspector-section wdd-tax-history"><h4>Annual tax history</h4><p>No annual tax rows were returned for this exact municipal match.</p>'+taxSourceNote(p)+'</section>';
    function hasNumber(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));}
    function taxMoney(value){return hasNumber(value)?Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}):'—';}
    var rows=years.map(function(year){var row=annual[year]||{};var rate=hasNumber(row.tax_rate)?Number(row.tax_rate).toLocaleString('en-US',{maximumFractionDigits:4})+'%':'—';return '<tr><th scope="row">'+esc(year)+'</th><td>'+esc(taxMoney(row.property_tax_billed))+'</td><td>'+esc(rate)+'</td><td>'+(hasNumber(row.total_assessed_value)?esc(H.money(row.total_assessed_value)):'—')+'</td></tr>';}).join('');
    return '<section class="wdd-inspector-section wdd-tax-history"><h4>Annual tax history</h4><div class="wdd-tax-history-scroll"><table aria-label="Annual municipal property tax evidence"><thead><tr><th scope="col">Year</th><th scope="col">Billed</th><th scope="col">Rate</th><th scope="col">Assessment</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+taxSourceNote(p)+'</section>';
  }
  function taxSourceNote(p){
    var href=externalHttpsUrl(p.municipal_tax_source),provider=String(p.municipal_tax_provider||'Municipal tax evidence'),semantics=String(p.municipal_tax_semantics||'Exact municipal address match.');
    var checked='';
    if(p.municipal_tax_checked_at){var date=new Date(p.municipal_tax_checked_at);if(Number.isFinite(date.getTime()))checked=' Checked '+date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'.';}
    return '<p class="wdd-tax-history-source">Source: '+(href?'<a href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(provider)+'</a>':esc(provider))+'. '+esc(semantics)+esc(checked)+'</p>';
  }
  function selectedProperty(props){
    if(!props.length){selectedPropertyPin='';return null;}
    if(inspectorDismissed&&!selectedPropertyPin)return null;
    var found=props.find(function(p){return String(p.pams_pin||'')===selectedPropertyPin;});
    if(!found){found=props[0];selectedPropertyPin=String(found.pams_pin||'');}
    return found;
  }
  function propertyInspector(p){
    return '<aside class="wdd-property-inspector" aria-label="Selected property details">'+inspectorContent(p,'desktop')+'</aside>'+
      '<dialog class="wdd-property-dialog" id="wdd-property-dialog" aria-label="Property details">'+
        '<div class="wdd-property-dialog-head"><span>Property details</span><button class="wdd-inspector-close" type="button" data-dialog-close aria-label="Close property details"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>'+
        '<div class="wdd-property-dialog-content">'+inspectorContent(p,'mobile')+'</div>'+
      '</dialog>';
  }
  function paintPositions(){
    var props=WD.filtered(),selected=selectedProperty(props),current=COLS.filter(function(c){return c.key===S.sort.key;})[0]||COLS[0];
    var head=COLS.map(function(c){
      if(!c.key)return '<th'+(c.r?' class="wdd-r"':'')+'>'+esc(c.label)+'</th>';
      var arrow=S.sort.key===c.key?(S.sort.dir==='asc'?' ↑':' ↓'):'';
      return '<th'+(c.r?' class="wdd-r"':'')+'><button type="button" data-sort="'+c.key+'">'+esc(c.label)+arrow+'</button></th>';
    }).join('');
    var body=props.length?'<div class="wdd-scrollx"><table class="wdd-table"><thead><tr>'+head+'</tr></thead><tbody>'+rows()+'</tbody></table></div>':
      '<div class="wdd-empty"><i class="fas fa-folder-open" aria-hidden="true"></i><p>No saved properties yet. Look one up and it will appear here with assessment, tax and Watchdog status.</p><a href="/property/">Look up an address</a></div>';
    // content-architecture: dynamic — portfolio markup depends on authenticated rows, sort state, and table/map mode.
    H.el('wdd-positions').innerHTML='<div class="wdd-panel"><div class="wdd-panel-head"><div><h2>Your Portfolio</h2><p>'+props.length+' propert'+(props.length===1?'y':'ies')+' · Sorted by '+esc(current.label.toLowerCase())+'</p></div><div class="wdd-fill"></div><div class="wdd-tabs" role="tablist"><button type="button" role="tab" data-tab="ledger" aria-selected="'+(S.tab==='ledger')+'">Table</button><button type="button" role="tab" data-tab="map" aria-selected="'+(S.tab==='map')+'">Map</button></div></div>'+
      (S.tab==='map'?'<div id="wdd-map"></div>':'<div class="wdd-properties-layout"><div class="wdd-property-list">'+body+'</div>'+propertyInspector(selected)+'</div>')+'</div>';
    bindPropertyDialog();
    if(S.tab==='map')drawMap();
  }
  function bindPropertyDialog(){
    var dialog=H.el('wdd-property-dialog');if(!dialog)return;
    var close=dialog.querySelector('[data-dialog-close]');
    if(close)close.addEventListener('click',function(){dialog.close();});
    dialog.addEventListener('close',function(){
      var pin=mobileDrawerOpenerPin||selectedPropertyPin;mobileDrawerOpenerPin='';
      if(pin)w.setTimeout(function(){var trigger=d.querySelector('[data-select-pin="'+String(pin).replace(/["\\]/g,'\\$&')+'"]');if(trigger)trigger.focus();},0);
    },{once:true});
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
    if(!vals.length)return'<div class="wdd-gap-empty" role="status">No assessed-to-market comparisons are available for this filtered selection.</div>';
    var bins=[0,0,0,0,0,0,0,0,0,0,0,0],step=5;
    vals.forEach(function(v){var idx=Math.min(bins.length-1,Math.max(0,Math.floor((v+30)/step)));bins[idx]+=1;});
    var max=Math.max.apply(null,bins.concat([1]));
    var below=bins.slice(0,5).reduce(function(sum,count){return sum+count;},0),near=bins[5]+bins[6],above=bins.slice(7).reduce(function(sum,count){return sum+count;},0);
    function bound(value){return value===0?'0%':(value<0?'−':'+')+Math.abs(value)+'%';}
    var bars=bins.map(function(v,i){
      var low=-30+i*step,high=low+step,group=i<5?'below':(i>6?'above':'near');
      var range=i===0?'Below −25%, including values at or below −30% (left edge clipped)':(i===bins.length-1?'+25% and above, including values at or above +30% (right edge clipped)':bound(low)+' to under '+bound(high));
      var groupText=group==='below'?'assessed below market by more than 5%':(group==='above'?'assessed above market by at least 5%':'between −5% and under +5% of market');
      var detail=range+': '+v+' '+(v===1?'property':'properties')+'; '+groupText+'.';
      var h=Math.max(8,(v/max)*76);
      var mobileRange=i===0?'Below −25% (clipped at −30%)':(i===bins.length-1?'+25% and above (clipped at +30%)':bound(low)+' to under '+bound(high));
      var barLength=((v/max)*100).toFixed(0);
      return '<button class="wdd-gap-bin is-'+group+(selectedGapBin===i?' is-selected':'')+'" type="button" data-gap-bin="'+i+'" data-gap-detail="'+detail+'" title="'+detail+'" aria-label="'+detail.replace(/"/g,'&quot;')+'" aria-pressed="'+(selectedGapBin===i?'true':'false')+'"><span class="wdd-gap-range-label">'+mobileRange+'</span><span class="wdd-gap-count">'+v+'</span><span class="wdd-gap-bar" style="--bar-height:'+h.toFixed(0)+'%;--bar-length:'+barLength+'%"></span></button>';
    }).join('');
    var total=below+near+above;
    return '<div class="wdd-gap-chart" role="group" aria-labelledby="wdd-gap-heading"><p class="wdd-gap-caption" id="wdd-gap-heading">Properties by assessed-to-market difference <span>· '+total+' with comparable data</span></p><div class="wdd-gap-legend" aria-label="Chart groups"><span class="is-below">Below market &lt;−5% <b>'+below+'</b></span><span class="is-near">−5% to under +5% <b>'+near+'</b></span><span class="is-above">Above market ≥+5% <b>'+above+'</b></span></div><div class="wdd-gap-plot"><span class="wdd-gap-zero-line" aria-hidden="true"></span><span class="wdd-gap-zero-badge" aria-hidden="true">0% market</span><div class="wdd-gap-bars">'+bars+'</div></div><div class="wdd-gap-axis" aria-hidden="true"><span>−30%</span><span>−20%</span><span>−10%</span><span>0%</span><span>+10%</span><span>+20%</span><span>+30%</span></div><p class="wdd-gap-bin-detail" id="wdd-gap-detail">End bins group values below −25% and at or above +25%; values beyond the ±30% scale stay in those bins. Choose a bar to see its count and range.</p></div>';
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
    selectedGapBin=-1;
    var feed=recent.length?recent.map(function(r){
      var tone=feedTone(r);return '<div class="wdd-feed-item '+tone+'"><span class="wdd-feed-source '+tone+'"><i class="fas '+feedIcon(r)+'" aria-hidden="true"></i></span><div><b>'+esc(r.title||H.pretty(r.event_type))+'</b><small>'+esc(addressFor(r.pams_pin)||r.pams_pin||'Saved property')+' · '+esc(H.ago(r.occurred_at))+'</small></div></div>';
    }).join(''):'<div class="wdd-empty" style="padding:24px 14px"><p>Nothing has changed on your properties in the last 120 days.</p></div>';
    // content-architecture: dynamic — rail modules combine live saved-property counts, map state, events, and calculated portfolio distribution.
    H.el('wdd-rail').innerHTML=
      '<section class="wdd-panel wdd-portfolio-map-card"><div class="wdd-panel-head"><div><h2>Your Portfolio</h2></div><a class="wdd-panel-link" href="#" data-tab-link="map">View map →</a></div><div class="wdd-map-wrap"><div id="wdd-rail-map"></div><span class="wdd-map-stat"><i class="fas fa-location-dot"></i>'+st.count+' properties</span></div></section>'+
      '<section class="wdd-panel" id="wdd-activity"><div class="wdd-panel-head"><div><h2>Recent Changes</h2><p>'+(st.changes30?st.changes30+' in the last 30 days':'Last 120 days')+'</p></div><a class="wdd-panel-link" href="/property/pulse">View all →</a></div>'+feed+'</section>'+
      '<section class="wdd-panel wdd-analysis-card" id="wdd-analysis-card"><div class="wdd-panel-head"><div><h2 id="wdd-analysis-heading" tabindex="-1">Portfolio Analysis</h2></div></div><div class="wdd-analysis-tabs" role="tablist" aria-label="Portfolio analysis views"><button class="wdd-analysis-tab" id="wdd-analysis-tab-assessed" role="tab" aria-controls="wdd-analysis-assessed" aria-selected="'+(analysisTab==='assessed')+'" data-analysis-tab="assessed" type="button">Assessed vs Market</button><button class="wdd-analysis-tab" id="wdd-analysis-tab-tax" role="tab" aria-controls="wdd-analysis-tax" aria-selected="'+(analysisTab==='tax')+'" data-analysis-tab="tax" type="button">Tax Distribution</button></div><div class="wdd-analysis-panel" id="wdd-analysis-assessed" role="tabpanel" aria-labelledby="wdd-analysis-tab-assessed"'+(analysisTab==='assessed'?'':' hidden')+'>'+railHistogram()+'<div class="wdd-analysis-copy">'+analysisCopy()+'</div></div><div class="wdd-analysis-panel" id="wdd-analysis-tax" role="tabpanel" aria-labelledby="wdd-analysis-tab-tax"'+(analysisTab==='tax'?'':' hidden')+'>'+taxDistribution()+'</div></section>';
    H.el('wdd-rail').insertAdjacentHTML('beforeend',appealCalendar(WD.filtered()));
    drawRailMap();
  }
  function appealCalendar(props){
    var alt=false,trad=false;
    props.forEach(function(p){var key=countyKey(p.county);if(!key)return;if(APPEAL_ALT_COUNTIES.indexOf(key)>-1)alt=true;else trad=true;});
    var items=[];
    if(alt)items.push({date:nextBaseline(1,15),area:'Burlington, Gloucester & Monmouth counties'});
    if(trad)items.push({date:nextBaseline(4,1),area:'Other known counties'});
    items.sort(function(a,b){return a.date-b.date;});
    var focusDate=items.length?items[0].date:new Date(),year=focusDate.getFullYear(),month=focusDate.getMonth(),first=new Date(year,month,1),daysInMonth=new Date(year,month+1,0).getDate(),offset=first.getDay(),cellCount=Math.ceil((offset+daysInMonth)/7)*7;
    var weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(day){return '<span>'+day+'</span>';}).join('');
    var cells=[];
    for(var cell=0;cell<cellCount;cell++){
      var day=cell-offset+1;
      if(day<1||day>daysInMonth){cells.push('<span class="is-outside" aria-hidden="true"></span>');continue;}
      var markers=items.filter(function(item){return item.date.getFullYear()===year&&item.date.getMonth()===month&&item.date.getDate()===day;});
      var title=markers.length?'County baseline '+new Date(year,month,day).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+' · '+markers.map(function(item){return item.area;}).join('; '):'';
      cells.push('<span class="wdd-calendar-day'+(markers.length?' is-baseline':'')+'"'+(title?' role="img" aria-label="'+esc(title)+'" title="'+esc(title)+'"':'')+'><time datetime="'+year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')+'">'+day+'</time></span>');
    }
    var monthLabel=focusDate.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    var content=items.length?items.map(function(item){var dt=item.date;return '<li><time datetime="'+dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')+'"><b>'+esc(dt.toLocaleDateString('en-US',{month:'short'}))+'</b><strong>'+dt.getDate()+'</strong></time><span><b>County baseline</b><small>'+esc(item.area)+' · '+dt.getFullYear()+'</small></span></li>';}).join(''):'<li class="wdd-calendar-empty">County baseline dates appear when a county is available for a saved property.</li>';
    return '<section class="wdd-panel wdd-appeal-calendar" aria-labelledby="wdd-appeal-calendar-title"><div class="wdd-panel-head"><div><h2 id="wdd-appeal-calendar-title">Appeal calendar</h2><p>County baselines for your portfolio</p></div><i class="fas fa-calendar-days" aria-hidden="true"></i></div><div class="wdd-calendar-month"><div class="wdd-calendar-month-title">'+esc(monthLabel)+'</div><div class="wdd-calendar-grid" role="group" aria-label="'+esc(monthLabel)+(items.length?'; county baseline dates shown':'')+'"><div class="wdd-calendar-weekdays">'+weekdays+'</div><div class="wdd-calendar-days">'+cells.join('')+'</div></div><div class="wdd-calendar-legend"><span aria-hidden="true"></span>County baseline</div></div><ul>'+content+'</ul><p class="wdd-calendar-note">These are county baselines, not parcel-specific deadlines. Verify your deadline on the assessment notice.</p></section>';
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
    var inspectorClose=ev.target.closest('[data-inspector-close]');if(inspectorClose){selectedPropertyPin='';inspectorDismissed=true;paintPositions();return;}
    var selectButton=ev.target.closest('[data-select-pin]');
    if(selectButton){
      selectedPropertyPin=selectButton.getAttribute('data-select-pin')||'';
      inspectorDismissed=false;
      var openOnMobile=w.matchMedia&&w.matchMedia('(max-width: 760px)').matches;
      mobileDrawerOpenerPin=openOnMobile?selectedPropertyPin:'';
      paintPositions();
      if(openOnMobile){var dialog=H.el('wdd-property-dialog');if(dialog&&typeof dialog.showModal==='function')dialog.showModal();else if(dialog)dialog.setAttribute('open','');}
      else{var focusedButton=d.querySelector('[data-select-pin="'+String(selectedPropertyPin).replace(/["\\]/g,'\\$&')+'"]');if(focusedButton)focusedButton.focus({preventScroll:true});}
      return;
    }
    var gapBin=ev.target.closest('[data-gap-bin]');if(gapBin){selectedGapBin=Number(gapBin.getAttribute('data-gap-bin'));var gapDetail=H.el('wdd-gap-detail');if(gapDetail)gapDetail.textContent=gapBin.getAttribute('data-gap-detail')||'';Array.prototype.forEach.call(d.querySelectorAll('[data-gap-bin]'),function(button){var selected=Number(button.getAttribute('data-gap-bin'))===selectedGapBin;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',selected?'true':'false');});return;}
    var alert=ev.target.closest('[data-act="show-overmarket-evidence"]');if(alert){analysisTab='assessed';var assessedTab=H.el('wdd-analysis-tab-assessed');Array.prototype.forEach.call(d.querySelectorAll('[data-analysis-tab]'),function(button){button.setAttribute('aria-selected',button===assessedTab?'true':'false');});Array.prototype.forEach.call(d.querySelectorAll('.wdd-analysis-panel'),function(panel){panel.hidden=panel.id!=='wdd-analysis-assessed';});var heading=H.el('wdd-analysis-heading'),card=H.el('wdd-analysis-card'),behavior=w.matchMedia&&!w.matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto';if(heading)heading.focus({preventScroll:true});if(card)card.scrollIntoView({behavior:behavior,block:'start'});return;}
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
    var row=ev.target.closest('tr[data-pin]');if(row&&row.getAttribute('data-pin')){
      selectedPropertyPin=row.getAttribute('data-pin');
      inspectorDismissed=false;
      var mobile=w.matchMedia&&w.matchMedia('(max-width: 760px)').matches;
      mobileDrawerOpenerPin=mobile?selectedPropertyPin:'';
      paintPositions();
      if(mobile){var propertyDialog=H.el('wdd-property-dialog');if(propertyDialog&&typeof propertyDialog.showModal==='function')propertyDialog.showModal();else if(propertyDialog)propertyDialog.setAttribute('open','');}
      return;
    }
    var act=ev.target.closest('[data-act]');if(!act)return;var a=act.getAttribute('data-act');
    if(a==='export')exportCsv();else if(a==='county')cycleCounty();else if(a==='mobile-more')openMoreMenu();else if(a==='voice-search')startVoiceSearch(act);else if(a==='focus-search'){var fi=H.el('wdd-command-input');if(fi){fi.focus();fi.scrollIntoView({behavior:'smooth',block:'center'});}}
  }
  function onSubmit(ev){
    if(ev.target&&ev.target.id==='wdd-command'){ev.preventDefault();var input=H.el('wdd-command-input'),q=String(input&&input.value||'').trim();location.href='/property/'+(q?'?address='+encodeURIComponent(q):'');}
  }
  function onGapExplore(ev){
    if(!ev.target||!ev.target.closest)return;
    var button=ev.target.closest('[data-gap-bin]');if(!button)return;
    var detail=H.el('wdd-gap-detail');if(detail)detail.textContent=button.getAttribute('data-gap-detail')||'';
  }
  function onKeydown(ev){
    if(ev.key==='Escape'){
      var dialog=H.el('wdd-property-dialog');if(dialog&&dialog.open)return;
      if(selectedPropertyPin){selectedPropertyPin='';inspectorDismissed=true;paintPositions();return;}
    }
    if((ev.metaKey||ev.ctrlKey)&&String(ev.key).toLowerCase()==='k'){var input=H.el('wdd-command-input');if(input){ev.preventDefault();input.focus();}}
  }
  function paintAll(){paintStanding();paintSignals();paintQueue();paintPositions();paintRail();paintFoot();}
  d.addEventListener('click',onClick);d.addEventListener('focusin',onGapExplore);d.addEventListener('pointerover',onGapExplore);d.addEventListener('submit',onSubmit);d.addEventListener('keydown',onKeydown);WD.onRepaint(paintAll);paintAll();
}
if(w.WD&&w.WD.S&&w.WD.S.user)start();else d.addEventListener('wd:ready',start,{once:true});
})(window,document);



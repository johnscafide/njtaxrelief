/* Pro+ Town CO & fire certificate: the person-checked town resale certificate and smoke / CO alarm
   certificate rules for this parcel's town, with fees and who to call. Rows come from
   watchdog_town_certificates, which checks the plan on the server. Nothing here is inferred. */
(function(){'use strict';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function key(r){return String((r&&(r.pams_pin||r.id))||'property').replace(/[^a-z0-9]/gi,'');}
  function townCode(r){var pin=String(r&&r.pams_pin||'').replace(/[^0-9_]/g,''),c=pin.split('_')[0]||'';return /^\d{4}$/.test(c)?c:'';}
  function url(u){u=String(u||'');return /^https?:\/\//i.test(u)?u:'';}
  function date(v){var d=new Date(String(v||'').slice(0,10)+'T12:00:00');return isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';}
  // Phone numbers and emails inside already-escaped text become tap-to-call / mail links.
  function linkify(h){return h.replace(/\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b(?:\s*(?:ext\.?|x|extension)\s*(\d{1,6}))?/gi,function(m,a,b,c,x){return '<a href="tel:+1'+a+b+c+(x?','+x:'')+'">'+m+'</a>';}).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,function(m){return '<a href="mailto:'+m+'">'+m+'</a>';});}
  // Key lines (who issues it, who to call, how to apply) come first in each row; the rest are inspection items.
  function lineKind(v){if(/^(Not confirmed yet|Issuing office not confirmed)/.test(v))return'flag';if(/^Not required for sales/.test(v))return'ok';if(/^(Contact|Fire official in the NJ state directory)\b|^[^:]{1,80} contact:/.test(v))return'contact';if(/^(Issued by|Apply|How to apply|Valid for|State rule|Also):/.test(v)||/^[^:]{1,80}(: issued by |, apply: |, how to apply: )/.test(v))return'info';return'';}
  var ICON={flag:'fa-triangle-exclamation',ok:'fa-circle-check',contact:'fa-phone',info:'fa-circle-info'};
  function status(row){if(row.requirement_key==='smoke_fire_cert'||row.requirement_state==='explicit_required')return['req','Required'];if(row.requirement_state==='official_process_found')return['ok','Not required (town says so)'];return['flag','Not confirmed, call the office'];}
  function links(row){
    var seen={},names={},out=[];
    [[row.application_url,'Application'],[row.department_url,'Office page']].concat((row.source_urls||[]).map(function(s){return[s&&s.url,s&&s.label||'Official source'];})).forEach(function(x){var u=url(x[0]),n=x[1];if(u&&!seen[u]&&out.length<5){seen[u]=1;names[n]=(names[n]||0)+1;if(names[n]>1)n=n.replace(/^Official source/,'Official source '+names[n]);out.push('<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(n)+' <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>');}});
    return out.length?'<div class="tcx-links">'+out.join('')+'</div>':'';
  }
  function card(row,label){
    var st=status(row),lines=(row.requirements||[]).map(String),fees=row.fees||[];
    var keyLines=lines.filter(lineKind),items=lines.filter(function(l){return!lineKind(l);});
    // content-architecture: dynamic, every line, fee and link is the town's checked data for this parcel.
    var keys='<ul class="tcx-key">'+keyLines.map(function(l){var k=lineKind(l);return '<li class="'+k+'"><i class="fas '+ICON[k]+'" aria-hidden="true"></i><span>'+linkify(esc(l))+'</span></li>';}).join('')+'</ul>';
    // content-architecture: dynamic, fee labels and amounts are quoted from the town or fire office.
    var feeHtml=fees.length?'<div class="tcx-fees">'+fees.map(function(f){return '<div><span>'+esc(f.label)+'</span><b>'+esc(f.amount)+'</b></div>';}).join('')+'</div>':'<p class="tcx-muted">No fee published online.</p>';
    var itemHtml=items.length?'<details class="tcx-items"><summary>What the inspection checks ('+items.length+')</summary><ul>'+items.map(function(l){return '<li>'+linkify(esc(l))+'</li>';}).join('')+'</ul></details>':'';
    return '<article class="tcx-card '+st[0]+'"><div class="tcx-card-head"><span class="tcx-label">'+esc(label)+'</span><span class="tcx-chip '+st[0]+'">'+esc(st[1])+'</span></div><h4>'+esc(row.title||label)+'</h4>'+keys+feeHtml+itemHtml+links(row)+'</article>';
  }
  function message(icon,text,retry){return '<div class="tcx-msg"><i class="fas '+icon+'" aria-hidden="true"></i><p>'+esc(text)+'</p>'+(retry?'<button type="button" onclick="tcxRetry(\''+esc(retry)+'\')">Try again</button>':'')+'</div>';}
  function render(k,data){
    var host=document.getElementById('tcx-body-'+k);if(!host)return;
    if(!data||data.status==='error'){host.innerHTML=message('fa-circle-exclamation','Watchdog couldn’t load the town certificate details.',k);return;}
    if(data.status==='locked'){host.innerHTML=message('fa-lock','Town certificate details come with Pro+.');return;}
    if(data.status!=='ok'){host.innerHTML=message('fa-hourglass-half','Watchdog hasn’t checked this town’s certificate rules yet. Towns are being added county by county.');return;}
    var rows=data.rows||[],co=rows.filter(function(x){return x.requirement_key==='resale_cco';})[0],fire=rows.filter(function(x){return x.requirement_key==='smoke_fire_cert';})[0];
    var checked=date(rows[0]&&rows[0].last_verified_at),flag=rows.some(function(x){return x.needs_lookup;});
    // content-architecture: dynamic, town name, check date and red-flag state come from the checked rows.
    host.innerHTML='<p class="tcx-when">'+esc(data.municipality_name||'This town')+' · checked by Watchdog from official town and fire sources'+(checked?' on '+esc(checked):'')+'. Rules and fees can change, so confirm with the office before closing.'+(flag?' <b>Some details still need a call to the office.</b>':'')+'</p><div class="tcx-grid">'+(co?card(co,'Town resale certificate'):'')+(fire?card(fire,'Fire certificate'):'')+'</div>';
  }
  var cache={},records={};
  function load(k,force){
    var r=records[k],code=townCode(r);
    if(!code){var host=document.getElementById('tcx-body-'+k);if(host)host.innerHTML=message('fa-map-location-dot','Watchdog couldn’t match this parcel to a town.');return;}
    if(cache[code]&&!force){render(k,cache[code]);return;}
    var rt=window.NJPTRSupabaseRuntime,client=null;try{client=rt&&rt.createClient?rt.createClient():null;}catch(_){}
    if(!client){render(k,{status:'error'});return;}
    client.rpc('watchdog_town_certificates',{p_municipality_code:code}).then(function(res){var d=res&&!res.error&&res.data?res.data:{status:'error'};if(d.status!=='error')cache[code]=d;render(k,d);},function(){render(k,{status:'error'});});
  }
  // content-architecture: dynamic, the loading row replaces a failed request for this parcel's town.
  function retry(k){var host=document.getElementById('tcx-body-'+k);if(host)host.innerHTML='<div class="tcx-loading"><span class="pl-spin"></span> Loading town certificate details</div>';load(k,true);}
  function tool(r){
    var k=key(r);records[k]=r;setTimeout(function(){load(k,false);},0);
    // content-architecture: dynamic, the body is filled from the parcel's town rows after the server plan check.
    return '<section class="tcx-tool" id="tcx-'+k+'"><div class="tcx-intro"><span class="tcx-badge">Pro+ · Closing</span><h3>Town CO &amp; fire certificate</h3><p>What this town requires before closing, what it costs and who to call.</p></div><div id="tcx-body-'+k+'"><div class="tcx-loading"><span class="pl-spin"></span> Loading town certificate details</div></div></section>';
  }
  Object.assign(window,{toolTownCertificates:tool,tcxRetry:retry});
})();
export {};

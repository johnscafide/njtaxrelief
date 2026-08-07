(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);},q=new URLSearchParams(location.search);
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function label(v){return String(v||'').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
  Promise.all([
    window.njptrAccessReady || Promise.resolve({developer:false}),
    fetch('/property/data/marker-registry.json?v=20260806a').then(function(r){return r.json();}),
    fetch('/property/data/marker-content.json?v=20260805a').then(function(r){return r.json();}).catch(function(){return{markers:{}};}),
    fetch('/property/data/source-registry.json?v=20260805a').then(function(r){return r.json();}).catch(function(){return{datasets:[]};}),
    fetch('/property/data/derived-marker-formulas.json?v=20260806a').then(function(r){return r.json();}).catch(function(){return{markers:{}};}),
    fetch('/property/data/marker-refresh-policy.json?v=20260806a').then(function(r){return r.json();}).catch(function(){return{markers:[]};})
  ]).then(function(x){
    var access=x[0]||{},reg=x[1],rich=(x[2].markers||{})[q.get('id')]||{},sources=x[3].datasets||[],formula=(x[4].markers||{})[q.get('id')],refresh=(x[5].markers||[]).find(function(v){return v.marker_id===q.get('id');}),m=reg.markers.find(function(v){return v.id===q.get('id');});
    if(!m)throw Error('Unknown marker');
    if(m.tier!=='standard'&&!access.developer){location.replace('/property/dashboard.html?access=restricted');return;}
    document.title=m.label+' | Watchdog Data';$('mk-title').textContent=m.label;$('mk-crumb').textContent=label(m.category)+' · '+label(m.scope);
    $('mk-intro').textContent=rich.plain||m.description||'A Watchdog data marker with plan, profession and provenance metadata.';
    $('mk-why').textContent=rich.why||('This '+label(m.scope).toLowerCase()+' marker is used in Watchdog '+label(m.category).toLowerCase()+' analysis and can be selected in the Pro+ Data Center.');
    $('mk-method').textContent=rich.method||(formula?(formula.formula+(formula.range?' Range: '+formula.range+'.':'')):(m.origin==='watchdog-derived'?'Watchdog-derived marker. The formula documentation is being expanded as part of the marker editorial program.':'Reported or calculated from the public source identified in the marker registry.'));
    if(rich.caution){$('mk-caution').hidden=false;$('mk-caution').innerHTML='<b>Important:</b> '+esc(rich.caution);}
    $('mk-badges').innerHTML='<span class="tier">'+esc(m.tier==='pro_plus'?'Pro+':label(m.tier))+'</span><span>'+esc(m.origin==='public'?'Public source':'Watchdog proprietary')+'</span><span>'+esc(label(m.scope))+'</span>'+m.professions.slice(0,5).map(function(p){var v=reg.professions.find(function(z){return z.id===p;});return'<span>'+esc(v?v.label:p)+'</span>';}).join('');
    var value=q.get('value'),note=q.get('note');if(value){$('mk-reading').hidden=false;$('mk-reading').innerHTML='<div><span>Current reading</span><b>'+esc(value)+'</b></div>'+(note?'<div><span>Context</span><small>'+esc(note)+'</small></div>':'');}
    var sourceList=(rich.sources||[]).slice(),registered=sources.find(function(s){return s.id===m.source_id;});if(registered&&registered.source_url)sourceList.push({label:registered.label||registered.agency,url:registered.source_url,note:registered.warning||registered.cadence});
    $('mk-sources').innerHTML=(sourceList.length?sourceList.map(function(s){return'<div class="mk-source"><i class="fas fa-building-columns"></i><div><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.label)+'</a>'+(s.note?'<p>'+esc(s.note)+'</p>':'')+'</div></div>';}).join(''):'<p class="mk-empty">Source identifier: <b>'+esc(m.source_id||'Watchdog model registry')+'</b>. '+(formula?'The public input lineage is documented in the formula above and the source registry used by the underlying component markers.':'A direct public-document link is being added during marker editorial review.')+'</p>')+(refresh?'<div class="mk-source"><i class="fas fa-clock-rotate-left"></i><div><b>Refresh contract: '+esc(label(refresh.cadence))+'</b><p>'+esc(refresh.rule)+' Trigger: '+esc(refresh.trigger.replace(/_/g,' '))+'.</p></div></div>':'');
    $('mk-related').innerHTML=(rich.related||[]).map(function(id){var z=reg.markers.find(function(v){return v.id===id;});return'<a href="/property/marker.html?id='+encodeURIComponent(id)+'">'+esc(z?z.label:id)+'</a>';}).join('')||'<span class="mk-empty">Related-marker guidance is being curated.</span>';
    var pin=q.get('pin');if(pin)$('mk-back').href='/property/home.html?pin='+encodeURIComponent(pin);
  }).catch(function(e){$('mk-title').textContent='Data marker not found';$('mk-intro').textContent='The marker identifier is missing or no longer available.';console.error(e);});
})();

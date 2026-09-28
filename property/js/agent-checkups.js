/* Agent Desk: annual tax checkups. Lists the agent's past clients and sphere
   homes (agent_farm_properties, own rows only) with a checkup link and a
   ready-to-send note for each. The agent sends it from their own email or
   CRM; Watchdog never stores or emails the client. */
(function(){
  'use strict';
  var root=document.getElementById('ad-checkups');
  if(!root)return;
  var ORIGIN='https://www.watchdogindex.com';
  var cleanHost=/^(www\.)?watchdogindex\.com$/i.test(location.hostname);
  var SHOW=8;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function titleCase(s){return String(s||'').toLowerCase().replace(/\b([a-z])/g,function(m){return m.toUpperCase();});}
  function link(pin,slug){return ORIGIN+'/checkup?pin='+encodeURIComponent(pin)+(slug?'&agent='+encodeURIComponent(slug):'');}
  function openLink(pin,slug){return (cleanHost?'/checkup':'/api/watchdog-checkup')+'?pin='+encodeURIComponent(pin)+(slug?'&agent='+encodeURIComponent(slug):'');}
  function note(row,slug,name){
    return 'Hi! I put together a quick property tax checkup for '+titleCase(row.address)+': your assessment, how it compares with your town, and the appeal deadline.\n\n'+
      link(row.pams_pin,slug)+'\n\nHappy to help if anything looks off.'+(name?'\n\n'+name:'');
  }
  function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  function copy(text,btn){
    function done(){var old=btn.textContent;btn.textContent='Copied';setTimeout(function(){btn.textContent=old;},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,function(){prompt('Copy this note',text);});
    else prompt('Copy this note',text);
  }

  function render(rows,slug,name){
    var profile=cleanHost?'/account/professional-profile':'/account/professional-profile/';
    var head='<header class="ad27-card-head"><h2 id="ad-checkups-title">Tax checkups</h2></header>'+
      '<p class="adh-help">Every February the new assessments come out. Send each past client a checkup for their home: whether the assessment holds up and the appeal deadline. It comes from you, from your own email or CRM.</p>';
    if(!rows.length){
      root.innerHTML=head+'<p class="adh-help">Add past clients or sphere homes above, matched to a parcel, and their checkups show up here.</p>';
      return;
    }
    var warn=slug?'':'<p class="ad-ck-warn">Pick your page address so your contact card shows on each checkup. <a href="'+esc(profile)+'">Pick my page address</a></p>';
    var list=rows.map(function(r,i){
      return '<li class="ad-ck-row"'+(i>=SHOW?' hidden':'')+'><div class="ad-ck-copy"><b>'+esc(titleCase(r.address))+'</b><small>'+esc([titleCase(r.municipality||''),r.relationship==='past_client'?'Past client':'Sphere',r.contact_ref||''].filter(Boolean).join(' · '))+'</small></div>'+
        '<div class="ad-ck-actions"><button type="button" class="ad27-btn" data-ck-copy="'+i+'"><i class="fas fa-copy" aria-hidden="true"></i> Copy note</button><a class="ad27-btn" href="'+esc(openLink(r.pams_pin,slug))+'" target="_blank" rel="noopener">Open</a></div></li>';
    }).join('');
    root.innerHTML=head+warn+
      '<p class="ad-ck-count"><b>'+rows.length+'</b> '+(rows.length===1?'home':'homes')+' ready</p>'+
      '<ul class="ad-ck-list">'+list+'</ul>'+
      '<div class="ad-ck-foot">'+(rows.length>SHOW?'<button type="button" class="ad27-btn" data-ck-all>Show all '+rows.length+'</button>':'')+
      '<button type="button" class="ad27-btn primary" data-ck-csv><i class="fas fa-file-arrow-down" aria-hidden="true"></i> Download for your CRM</button></div>';
    root.querySelectorAll('[data-ck-copy]').forEach(function(b){b.addEventListener('click',function(){copy(note(rows[Number(b.getAttribute('data-ck-copy'))],slug,name),b);});});
    var all=root.querySelector('[data-ck-all]');
    if(all)all.addEventListener('click',function(){root.querySelectorAll('.ad-ck-row[hidden]').forEach(function(li){li.hidden=false;});all.remove();});
    root.querySelector('[data-ck-csv]').addEventListener('click',function(){
      var lines=[['contact_ref','address','town','relationship','checkup_link','note'].join(',')].concat(rows.map(function(r){
        return [r.contact_ref||'',titleCase(r.address),titleCase(r.municipality||''),r.relationship,link(r.pams_pin,slug),note(r,slug,name)].map(csvCell).join(',');
      }));
      var a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
      a.download='watchdog-tax-checkups.csv';document.body.appendChild(a);a.click();
      setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
    });
  }

  Promise.resolve(window.njptrAccessReady).then(function(ctx){
    var db=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;
    var user=ctx&&ctx.user;
    if(!db||!user){root.hidden=true;return;}
    return Promise.all([
      db.from('agent_farm_properties').select('id,address,municipality,pams_pin,relationship,contact_ref').eq('user_id',user.id).in('relationship',['past_client','sphere']).not('pams_pin','is',null).order('address').limit(1000),
      db.from('profiles').select('display_name,full_name,vanity_slug').eq('id',user.id).maybeSingle()
    ]).then(function(r){
      if(r[0].error){root.innerHTML='<header class="ad27-card-head"><h2 id="ad-checkups-title">Tax checkups</h2></header><p class="adh-help">Checkups could not load. Refresh to try again.</p>';return;}
      var p=r[1]&&!r[1].error&&r[1].data||{};
      render(r[0].data||[],p.vanity_slug||null,p.full_name||p.display_name||'');
    });
  }).catch(function(){root.hidden=true;});
})();

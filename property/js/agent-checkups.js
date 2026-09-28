/* Agent Desk: annual tax checkups. Fills the "Tax checkups" card (markup and
   copy live in agent-desk/index.html) with the agent's own past-client and
   sphere homes (agent_farm_properties) and a checkup link and ready-to-send
   note for each. The agent sends it from their own email or CRM; Watchdog
   never stores or emails the client. */
(function(){
  'use strict';
  var root=document.getElementById('ad-checkups');
  var tpl=document.getElementById('ad-ck-row');
  if(!root||!tpl)return;
  var ORIGIN='https://www.watchdogindex.com';
  var cleanHost=/^(www\.)?watchdogindex\.com$/i.test(location.hostname);
  var SHOW=8;
  function q(sel){return root.querySelector(sel);}
  function state(name){root.querySelectorAll('[data-ck-state]').forEach(function(el){el.hidden=el.getAttribute('data-ck-state')!==name;});}
  function titleCase(s){return String(s||'').toLowerCase().replace(/\b([a-z])/g,function(m){return m.toUpperCase();});}
  function link(pin,slug){return ORIGIN+'/checkup?pin='+encodeURIComponent(pin)+(slug?'&agent='+encodeURIComponent(slug):'');}
  function openLink(pin,slug){return (cleanHost?'/checkup':'/api/watchdog-checkup')+'?pin='+encodeURIComponent(pin)+(slug?'&agent='+encodeURIComponent(slug):'');}
  function note(row,slug,name){
    return 'Hi! I put together a quick property tax checkup for '+titleCase(row.address)+': your assessment, how it compares with your town, and the appeal deadline.\n\n'+
      link(row.pams_pin,slug)+'\n\nHappy to help if anything looks off.'+(name?'\n\n'+name:'');
  }
  function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  function copy(text,btn){
    function done(){var old=btn.lastChild.textContent;btn.lastChild.textContent=' Copied';setTimeout(function(){btn.lastChild.textContent=old;},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,function(){prompt('Copy this note',text);});
    else prompt('Copy this note',text);
  }

  function render(rows,slug,name){
    if(!rows.length){state('empty');return;}
    state('ready');
    q('[data-ck-noslug]').hidden=Boolean(slug);
    if(!cleanHost)q('[data-ck-noslug] a').setAttribute('href','/account/professional-profile/');
    q('[data-ck-count]').textContent=String(rows.length);
    var list=q('[data-ck-list]');list.replaceChildren();
    rows.forEach(function(r,i){
      var li=tpl.content.firstElementChild.cloneNode(true);
      li.hidden=i>=SHOW;
      li.querySelector('[data-ck-address]').textContent=titleCase(r.address);
      li.querySelector('[data-ck-meta]').textContent=[titleCase(r.municipality||''),r.relationship==='past_client'?'Past client':'Sphere',r.contact_ref||''].filter(Boolean).join(' · ');
      li.querySelector('[data-ck-open]').setAttribute('href',openLink(r.pams_pin,slug));
      var b=li.querySelector('[data-ck-copy]');b.addEventListener('click',function(){copy(note(r,slug,name),b);});
      list.appendChild(li);
    });
    var all=q('[data-ck-all]');
    all.hidden=rows.length<=SHOW;
    all.textContent='Show all '+rows.length;
    all.onclick=function(){list.querySelectorAll('.ad-ck-row[hidden]').forEach(function(li){li.hidden=false;});all.hidden=true;};
    q('[data-ck-csv]').onclick=function(){
      var lines=[['contact_ref','address','town','relationship','checkup_link','note'].join(',')].concat(rows.map(function(r){
        return [r.contact_ref||'',titleCase(r.address),titleCase(r.municipality||''),r.relationship,link(r.pams_pin,slug),note(r,slug,name)].map(csvCell).join(',');
      }));
      var a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
      a.download='watchdog-tax-checkups.csv';document.body.appendChild(a);a.click();
      setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},2000);
    };
  }

  Promise.resolve(window.njptrAccessReady).then(function(ctx){
    var db=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;
    var user=ctx&&ctx.user;
    if(!db||!user){root.hidden=true;return;}
    return Promise.all([
      db.from('agent_farm_properties').select('id,address,municipality,pams_pin,relationship,contact_ref').eq('user_id',user.id).in('relationship',['past_client','sphere']).not('pams_pin','is',null).order('address').limit(1000),
      db.from('profiles').select('display_name,full_name,vanity_slug').eq('id',user.id).maybeSingle()
    ]).then(function(r){
      if(r[0].error){state('error');return;}
      var p=r[1]&&!r[1].error&&r[1].data||{};
      render(r[0].data||[],p.vanity_slug||null,p.full_name||p.display_name||'');
    });
  }).catch(function(){state('error');});
})();

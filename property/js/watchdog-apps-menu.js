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
(function(){
  var KEY='wd_home_apps_v1';
  var ICON='/property/assets/menu-icons/';
  var SHORT={dashboard:'Dashboard',lookup:'Lookup',home:'My Home',pulse:'Pulse',anchor:'ANCHOR','town-compare':'Compare Towns',co:'CO Rules',robust:'Watchdog Score',games:'Games','data-center':'Data Center',pro:'Pricing',account:'Account'};
  var EXTRA=[
    {key:'tax-estimator',label:'Tax Estimator',href:'/property-tax-estimator'},
    {key:'appeal-savings',label:'Appeal Savings',href:'/appeal-savings-estimator'},
    {key:'senior-benefit',label:'Senior Benefits',href:'/senior-benefit-estimator'},
    {key:'mortgage',label:'Mortgage',href:'/mortgage-calculator'},
    {key:'transfer-fee',label:'Transfer Fee',href:'/realty-transfer-fee-calculator'},
    {key:'buying-cost',label:'Buying Costs',href:'/home-buying-cost-calculator'},
    {key:'tax-calendar',label:'Tax Calendar',href:'/nj-property-tax-calendar'},
    {key:'insights',label:'Insights',href:'/insights'},
    {key:'fairness',label:'Fairness',href:'/fairness'},
    {key:'glossary',label:'Glossary',href:'/glossary'},
    {key:'help',label:'Help',href:'/support'},
    {key:'pro',label:'Pricing',href:'/pro'}
  ];
  var HAS_ICON={dashboard:1,lookup:1,home:1,pulse:1,anchor:1,'town-compare':1,co:1,robust:1,games:1,'data-center':1,pro:1,account:1,'agent-desk':1,clients:1,farm:1,marketing:1,research:1,scan:1,transaction:1,'data-workbench':1};
  var TOOLS={developer:'Developer','developer-recaps':'Recaps','developer-marketing':'Campaign','developer-analytics':'Analytics','developer-logs':'Build Logs','developer-data':'Data Ops','sales-desk':'Sales Desk'};
  EXTRA.forEach(function(x){HAS_ICON[x.key]=1;});
  Object.keys(TOOLS).forEach(function(k){HAS_ICON[k]=1;});
  var editing=false,known={},knownOrder=[],recent=[],trigger=null;
  if(window.__wdAppsMenu)return;
  window.__wdAppsMenu=true;
  if(!document.querySelector('link[href^="/property/css/watchdog-apps-menu.css"]')){
    var css=document.createElement('link');css.rel='stylesheet';css.href='/property/css/watchdog-apps-menu.css?v=20261007a';
    (document.head||document.documentElement).appendChild(css);
  }
  function route(p){try{return window.WatchdogUniversalMenu&&window.WatchdogUniversalMenu.route?window.WatchdogUniversalMenu.route(p):p;}catch(_){return p;}}

  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function load(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(v)?v:null;}catch(_){return null;}}
  function save(list){try{localStorage.setItem(KEY,JSON.stringify(list));}catch(_){}push(list);}

  var META='watchdog_home_apps',user=null,timer=null;
  function db(){try{return window.NJPTRSupabaseRuntime?window.NJPTRSupabaseRuntime.createClient():null;}catch(_){return null;}}
  function push(list){
    if(!user)return;
    clearTimeout(timer);
    timer=setTimeout(function(){
      var c=db();if(!c)return;
      var data={};data[META]=list;
      c.auth.updateUser({data:data}).then(function(r){if(r&&r.data&&r.data.user)user=r.data.user;}).catch(function(){});
    },600);
  }
  function adopt(u){
    user=u||null;
    if(!user)return;
    var meta=user.user_metadata||{},remote=meta[META];
    if(Array.isArray(remote)){
      try{localStorage.setItem(KEY,JSON.stringify(remote));}catch(_){}
      var sheet=document.getElementById('wd-main-sheet');
      if(sheet&&sheet.classList.contains('open')&&!editing)render(sheet);
    }else{
      var local=load();
      if(local)push(local);
    }
  }
  function sync(){
    var c=db();if(!c)return;
    try{
      c.auth.getSession().then(function(r){adopt(r&&r.data&&r.data.session?r.data.session.user:null);}).catch(function(){});
      c.auth.onAuthStateChange(function(ev,session){if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')adopt(session?session.user:null);});
    }catch(_){}
  }

  function catalog(sheet){
    var out=[],seen={};
    var links=sheet.querySelectorAll('.wd-universal-nav-links a.wd-universal-link[data-wd-nav]:not(.wd-universal-locked)');
    Array.prototype.forEach.call(links,function(a){
      var key=a.getAttribute('data-wd-nav');
      if(seen[key])return;
      var span=a.querySelector('span');
      var text=span&&span.firstChild&&span.firstChild.nodeType===3?span.firstChild.nodeValue:(span?span.textContent:key);
      var icon=a.querySelector('i');
      seen[key]=1;
      out.push({key:key,label:SHORT[key]||text.trim(),href:a.getAttribute('href'),fa:icon?icon.className:''});
    });
    Array.prototype.forEach.call(sheet.querySelectorAll('a.wd-universal-developer-tool[data-wd-developer-tool]'),function(a){
      var key=a.getAttribute('data-wd-developer-tool');
      if(seen[key])return;
      seen[key]=1;
      var b=a.querySelector('b');
      out.push({key:key,label:TOOLS[key]||(b?b.textContent:key),href:a.getAttribute('href')});
    });
    if(!out.length){
      Object.keys(SHORT).forEach(function(key){seen[key]=1;out.push({key:key,label:SHORT[key],href:route(key==='lookup'?'/':'/'+(key==='robust'?'robust/':key==='anchor'?'anchor/applications/':key))});});
    }
    EXTRA.forEach(function(x){if(!seen[x.key]){seen[x.key]=1;out.push({key:x.key,label:x.label,href:route(x.href)});}});
    out.forEach(function(x){if(!known[x.key])knownOrder.push(x.key);known[x.key]=x;});
    knownOrder.forEach(function(k){if(!seen[k])out.push(known[k]);});
    return out;
  }

  function tile(item,mode){
    var icon=HAS_ICON[item.key]?'<img src="'+ICON+item.key+'.svg" alt="" width="46" height="46" draggable="false">':'<i class="'+esc(item.fa||'fas fa-circle')+'" aria-hidden="true"></i>';
    var badge='';
    if(mode==='fav')badge='<button type="button" class="wsh-app-badge wsh-app-rm" data-wsh-remove="'+esc(item.key)+'" aria-label="Remove '+esc(item.label)+' from favorites">&minus;</button>';
    if(mode==='more')badge='<button type="button" class="wsh-app-badge wsh-app-add" data-wsh-add="'+esc(item.key)+'" aria-label="Add '+esc(item.label)+' to favorites">+</button>';
    return '<div class="wsh-app-cell" data-wsh-key="'+esc(item.key)+'"><a class="wsh-app" href="'+esc(item.href)+'"'+(editing?' tabindex="-1" aria-disabled="true"':'')+'><span class="wsh-app-ic">'+icon+'</span><span class="wsh-app-label">'+esc(item.label)+'</span></a>'+badge+'</div>';
  }

  function render(sheet){
    var all=catalog(sheet);
    var byKey={};all.forEach(function(x){byKey[x.key]=x;});
    var stored=load();
    var favKeys=(stored||Object.keys(SHORT).concat(all.filter(function(x){return !SHORT[x.key]&&!TOOLS[x.key]&&!EXTRA.some(function(e){return e.key===x.key;});}).map(function(x){return x.key;}))).filter(function(k){return byKey[k];});
    var favSet={};favKeys.forEach(function(k){favSet[k]=1;});
    var more=all.filter(function(x){return !favSet[x.key];});
    recent=recent.filter(function(k){return !favSet[k]&&byKey[k];});
    more.sort(function(a,b){var i=recent.indexOf(a.key),j=recent.indexOf(b.key);return (i<0?1e3:i)-(j<0?1e3:j);});
    var box=document.getElementById('wsh-apps');
    if(!box){box=document.createElement('div');box.id='wsh-apps';}
    if(box.parentNode!==sheet)sheet.appendChild(box);
    box.className=editing?'wsh-apps wd-apps-root editing':'wsh-apps wd-apps-root';
    box.innerHTML='<div class="wsh-apps-fav"><div class="wsh-apps-hd"><h2>'+(editing?'Edit favorites':'Your favorites')+'</h2>'+
      (editing?'<button type="button" class="wsh-apps-done" data-wsh-done>Done</button>':'<button type="button" class="wsh-apps-pen" data-wsh-edit aria-label="Edit favorites"><i class="fas fa-pen" aria-hidden="true"></i></button>')+
      '</div><div class="wsh-apps-grid" data-wsh-fav>'+favKeys.map(function(k){return tile(byKey[k],editing?'fav':'');}).join('')+'</div></div>'+
      (more.length?'<h2 class="wsh-apps-sec">More from Watchdog</h2><div class="wsh-apps-grid">'+more.map(function(x){return tile(x,editing?'more':'');}).join('')+'</div>':'');
    box._favKeys=favKeys;
    fit(sheet,box);
  }

  function fit(sheet,box){
    var fav=box.querySelector('.wsh-apps-fav');
    var sec=box.querySelector('.wsh-apps-sec');
    if(!fav||!sec){sheet.style.removeProperty('max-height');return;}
    var pad=parseFloat(getComputedStyle(sheet).paddingTop)+parseFloat(getComputedStyle(sheet).paddingBottom);
    var want=fav.offsetHeight+sec.offsetHeight+46+pad;
    var room=window.innerHeight-(sheet.getBoundingClientRect().top||66)-14;
    sheet.style.setProperty('max-height',Math.round(Math.min(want,room))+'px','important');
  }

  function place(sheet){
    var vw=window.innerWidth,t=trigger;
    if(!t||!document.contains(t)||sheet.contains(t))t=document.querySelector('#wd-menu-trigger,[data-wd-universal="open"],.wd-public-trigger');
    var top=66,left=null,right=14,w=Math.min(340,vw-28);
    if(t){
      var r=t.getBoundingClientRect();
      if(r.width&&r.bottom>0&&r.bottom<window.innerHeight/2){
        top=Math.round(r.bottom+8);
        if(r.left+r.width/2<vw/2){left=Math.max(10,Math.round(r.left));right=null;}
        else right=Math.max(10,Math.round(vw-r.right));
      }
    }
    if(vw<=600){left=10;right=null;w=vw-20;}
    sheet.style.setProperty('top',top+'px','important');
    sheet.style.setProperty('width',w+'px','important');
    if(left===null){sheet.style.setProperty('left','auto','important');sheet.style.setProperty('right',right+'px','important');}
    else{sheet.style.setProperty('left',left+'px','important');sheet.style.setProperty('right','auto','important');}
  }

  function currentFav(box){
    return Array.prototype.map.call(box.querySelectorAll('[data-wsh-fav] .wsh-app-cell'),function(a){return a.getAttribute('data-wsh-key');});
  }

  function bind(sheet){
    if(sheet._wshBound)return;
    sheet._wshBound=true;
    sheet.addEventListener('click',function(e){
      var box=document.getElementById('wsh-apps');
      if(!box||!box.contains(e.target))return;
      var t=e.target.closest('[data-wsh-edit],[data-wsh-done],[data-wsh-remove],[data-wsh-add],.wsh-app');
      if(!t)return;
      if(t.hasAttribute('data-wsh-edit')){editing=true;render(sheet);var d=sheet.querySelector('[data-wsh-done]');if(d)d.focus();return;}
      if(t.hasAttribute('data-wsh-done')){editing=false;render(sheet);var p=sheet.querySelector('[data-wsh-edit]');if(p)p.focus();return;}
      if(t.hasAttribute('data-wsh-remove')){e.preventDefault();var rk=t.getAttribute('data-wsh-remove');var f=currentFav(box).filter(function(k){return k!==rk;});recent=[rk].concat(recent.filter(function(k){return k!==rk;}));save(f);render(sheet);return;}
      if(t.hasAttribute('data-wsh-add')){e.preventDefault();var g=currentFav(box);g.push(t.getAttribute('data-wsh-add'));save(g);render(sheet);return;}
      if(editing)e.preventDefault();
    });
    var drag=null;
    sheet.addEventListener('pointerdown',function(e){
      if(!editing||e.target.closest('.wsh-app-badge'))return;
      var a=e.target.closest('[data-wsh-fav] .wsh-app-cell');
      if(!a)return;
      var r=a.getBoundingClientRect();
      var ghost=a.cloneNode(true);
      ghost.className='wsh-app-cell wsh-app-ghost wd-apps-root';
      ghost.removeAttribute('data-wsh-key');
      ghost.style.width=r.width+'px';
      ghost.style.left=r.left+'px';
      ghost.style.top=r.top+'px';
      document.body.appendChild(ghost);
      drag={el:a,ghost:ghost,dx:e.clientX-r.left,dy:e.clientY-r.top,moved:false};
      a.classList.add('dragging');
      try{a.setPointerCapture(e.pointerId);}catch(_){}
    });
    sheet.addEventListener('pointermove',function(e){
      if(!drag)return;
      drag.ghost.style.left=(e.clientX-drag.dx)+'px';
      drag.ghost.style.top=(e.clientY-drag.dy)+'px';
      drag.ghost.style.visibility='hidden';
      var over=document.elementFromPoint(e.clientX,e.clientY);
      drag.ghost.style.visibility='';
      var target=over&&over.closest('[data-wsh-fav] .wsh-app-cell');
      if(!target||target===drag.el)return;
      var r=target.getBoundingClientRect();
      var after=e.clientX>r.left+r.width/2;
      target.parentNode.insertBefore(drag.el,after?target.nextSibling:target);
      drag.moved=true;
    });
    function end(){
      if(!drag)return;
      drag.el.classList.remove('dragging');
      if(drag.ghost.parentNode)drag.ghost.parentNode.removeChild(drag.ghost);
      if(drag.moved){var box=document.getElementById('wsh-apps');if(box)save(currentFav(box));}
      drag=null;
    }
    sheet.addEventListener('dragstart',function(e){if(editing)e.preventDefault();});
    sheet.addEventListener('pointerup',end);
    sheet.addEventListener('pointercancel',end);
  }

  function refresh(){
    var sheet=document.getElementById('wd-main-sheet');
    if(!sheet)return;
    bind(sheet);
    if(!sheet.classList.contains('wd-apps-menu'))sheet.classList.add('wd-apps-menu');
    if(!sheet.classList.contains('open')){if(editing){editing=false;}return;}
    place(sheet);
    render(sheet);
    var a=document.activeElement;
    if(!a||a===document.body||(sheet.contains(a)&&!a.offsetParent)){var pen=sheet.querySelector('[data-wsh-edit]');if(pen)pen.focus({preventScroll:true});}
  }

  document.addEventListener('pointerdown',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');
    var sheet=document.getElementById('wd-main-sheet');
    if(b&&!(sheet&&sheet.contains(b)))trigger=b;
  },true);

  function watch(){
    var sheet=document.getElementById('wd-main-sheet');
    if(!sheet){
      if(!watch.waiting&&document.body){watch.waiting=new MutationObserver(function(){if(document.getElementById('wd-main-sheet')){watch.waiting.disconnect();watch();}});watch.waiting.observe(document.body,{childList:true});}
      return;
    }
    var wasOpen=sheet.classList.contains('open');
    new MutationObserver(function(){
      var open=sheet.classList.contains('open');
      var box=document.getElementById('wsh-apps');
      var lost=!box||box.parentNode!==sheet;
      if(!sheet.classList.contains('wd-apps-menu'))sheet.classList.add('wd-apps-menu');
      if(open!==wasOpen||(open&&lost)){wasOpen=open;refresh();}
    }).observe(sheet,{attributes:true,attributeFilter:['class'],childList:true});
    refresh();
    sync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();

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
  EXTRA.forEach(function(x){HAS_ICON[x.key]=1;});
  var editing=false;

  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function load(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(v)?v:null;}catch(_){return null;}}
  function save(list){try{localStorage.setItem(KEY,JSON.stringify(list));}catch(_){}}

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
    if(!out.length){
      Object.keys(SHORT).forEach(function(key){seen[key]=1;out.push({key:key,label:SHORT[key],href:key==='lookup'?'/':'/'+(key==='robust'?'robust/':key==='anchor'?'anchor/applications/':key)});});
    }
    EXTRA.forEach(function(x){if(!seen[x.key])out.push(x);});
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
    var favKeys=(stored||Object.keys(SHORT).concat(all.filter(function(x){return !SHORT[x.key]&&!EXTRA.some(function(e){return e.key===x.key;});}).map(function(x){return x.key;}))).filter(function(k){return byKey[k];});
    var favSet={};favKeys.forEach(function(k){favSet[k]=1;});
    var more=all.filter(function(x){return !favSet[x.key];});
    var box=document.getElementById('wsh-apps');
    if(!box){box=document.createElement('div');box.id='wsh-apps';}
    if(box.parentNode!==sheet)sheet.appendChild(box);
    if(!sheet.classList.contains('wsh-has-apps'))sheet.classList.add('wsh-has-apps');
    box.className=editing?'wsh-apps editing':'wsh-apps';
    box.innerHTML='<div class="wsh-apps-fav"><div class="wsh-apps-hd"><h2>'+(editing?'Edit favorites':'Your favorites')+'</h2>'+
      (editing?'<button type="button" class="wsh-apps-done" data-wsh-done>Done</button>':'<button type="button" class="wsh-apps-pen" data-wsh-edit aria-label="Edit favorites"><i class="fas fa-pen" aria-hidden="true"></i></button>')+
      '</div><div class="wsh-apps-grid" data-wsh-fav>'+favKeys.map(function(k){return tile(byKey[k],editing?'fav':'');}).join('')+'</div></div>'+
      (more.length?'<h2 class="wsh-apps-sec">More from Watchdog</h2><div class="wsh-apps-grid">'+more.map(function(x){return tile(x,editing?'more':'');}).join('')+'</div>':'');
    box._favKeys=favKeys;
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
      if(t.hasAttribute('data-wsh-remove')){e.preventDefault();var f=currentFav(box).filter(function(k){return k!==t.getAttribute('data-wsh-remove');});save(f);render(sheet);return;}
      if(t.hasAttribute('data-wsh-add')){e.preventDefault();var g=currentFav(box);g.push(t.getAttribute('data-wsh-add'));save(g);render(sheet);return;}
      if(editing)e.preventDefault();
    });
    var drag=null;
    sheet.addEventListener('pointerdown',function(e){
      if(!editing||e.target.closest('.wsh-app-badge'))return;
      var a=e.target.closest('[data-wsh-fav] .wsh-app-cell');
      if(!a)return;
      drag={el:a,moved:false};
      a.classList.add('dragging');
      try{a.setPointerCapture(e.pointerId);}catch(_){}
    });
    sheet.addEventListener('pointermove',function(e){
      if(!drag)return;
      var over=document.elementFromPoint(e.clientX,e.clientY);
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
    if(!sheet.classList.contains('open')){if(editing){editing=false;}return;}
    render(sheet);
  }

  function watch(){
    var sheet=document.getElementById('wd-main-sheet');
    if(!sheet)return;
    var wasOpen=sheet.classList.contains('open');
    new MutationObserver(function(){
      var open=sheet.classList.contains('open');
      var box=document.getElementById('wsh-apps');
      var lost=!box||box.parentNode!==sheet;
      if(open!==wasOpen||(open&&lost)){wasOpen=open;setTimeout(refresh,0);}
    }).observe(sheet,{attributes:true,attributeFilter:['class'],childList:true});
    refresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
})();

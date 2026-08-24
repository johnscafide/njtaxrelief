(function(){
  'use strict';
  if(window.__WATCHDOG_MENU_INTERACTION_GUARD__)return;
  window.__WATCHDOG_MENU_INTERACTION_GUARD__=true;

  var STYLE_ID='wd-menu-interaction-guard-style';
  var PUBLIC_SHEETS='#wd-main-sheet,#wd-profile-sheet';

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    var style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=[
      '#wd-public-backdrop{pointer-events:none!important}',
      '#wd-public-backdrop.open{pointer-events:auto!important;z-index:12000!important}',
      '#wd-main-sheet,#wd-profile-sheet{pointer-events:none!important}',
      '#wd-main-sheet.open,#wd-profile-sheet.open{pointer-events:auto!important;z-index:12010!important;-webkit-overflow-scrolling:touch!important;isolation:isolate!important}',
      '#wd-main-sheet.open a,#wd-main-sheet.open button,#wd-profile-sheet.open a,#wd-profile-sheet.open button{pointer-events:auto!important;touch-action:manipulation!important}',
      '#wd-profile-sheet.open .wd-universal-profile,#wd-profile-sheet.open .wd-universal-profile>nav{pointer-events:auto!important}',
      '#wd-profile-sheet.open .wd-universal-profile-close{pointer-events:auto!important;z-index:20!important}',
      '#wd6-profile a,#wd6-profile button,#hm27-profile-pop a,#hm27-profile-pop button{pointer-events:auto!important;touch-action:manipulation!important}'
    ].join('');
    (document.head||document.documentElement).appendChild(style);
  }

  function closePublic(){
    if(window.WatchdogPublicNav&&typeof window.WatchdogPublicNav.close==='function'){
      window.WatchdogPublicNav.close();
      return;
    }
    ['wd-main-sheet','wd-profile-sheet'].forEach(function(id){
      var sheet=document.getElementById(id);
      if(sheet){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');}
    });
    var backdrop=document.getElementById('wd-public-backdrop');
    if(backdrop)backdrop.classList.remove('open');
    if(document.body)document.body.classList.remove('wd-public-menu-open');
  }

  function normalizeState(){
    if(!document.body)return;
    var open=document.querySelector('#wd-main-sheet.open,#wd-profile-sheet.open');
    var backdrop=document.getElementById('wd-public-backdrop');
    if(!open){
      document.body.classList.remove('wd-public-menu-open');
      if(backdrop)backdrop.classList.remove('open');
    }
  }

  function installDelegates(){
    if(document.documentElement.dataset.wdMenuInteractionGuard==='1')return;
    document.documentElement.dataset.wdMenuInteractionGuard='1';

    document.addEventListener('click',function(ev){
      var target=ev.target&&ev.target.closest?ev.target.closest('#wd-main-sheet.open a[href],#wd-profile-sheet.open a[href]'):null;
      if(!target)return;
      closePublic();
    },true);

    document.addEventListener('pointerup',function(ev){
      if(ev.pointerType&&ev.pointerType!=='touch'&&ev.pointerType!=='pen')return;
      var close=ev.target&&ev.target.closest?ev.target.closest('#wd-main-sheet.open .wd-public-close,#wd-profile-sheet.open .wd-public-close,#wd-profile-sheet.open [data-wd-universal="close"]'):null;
      if(!close)return;
      ev.preventDefault();
      ev.stopPropagation();
      closePublic();
    },true);

    window.addEventListener('pageshow',normalizeState);
    window.addEventListener('popstate',normalizeState);
  }

  function boot(){ensureStyle();installDelegates();normalizeState();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  if(typeof MutationObserver!=='undefined'&&document.documentElement){
    new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var nodes=records[i].addedNodes||[];
        for(var j=0;j<nodes.length;j++){
          var node=nodes[j];
          if(node&&node.nodeType===1&&((node.matches&&node.matches(PUBLIC_SHEETS))||(node.querySelector&&node.querySelector(PUBLIC_SHEETS)))){
            ensureStyle();normalizeState();return;
          }
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }

  window.WatchdogMenuInteractionGuard={repair:function(){ensureStyle();normalizeState();}};
})();

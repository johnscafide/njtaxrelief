(function(){
'use strict';
if(!document.body || document.body.getAttribute('data-sidebar-page')!=='account')return;

var client=null,user=null,entitlement={};
var lifetimeMode=false,busy=false,enhanceTimer=null,activeThemeToggle=null,pendingThemeKey=null,pendingThemeOriginalKey=null;
var THEMES=[
  {key:'watchdog',label:'Watchdog',kind:'color',bg:'linear-gradient(112deg,#0f274b 0%,#123d58 56%,#087f78 100%)'},
  {key:'midnight',label:'Midnight',kind:'color',bg:'linear-gradient(115deg,#07182d 0%,#152c4b 58%,#314c72 100%)'},
  {key:'ocean',label:'Ocean',kind:'color',bg:'linear-gradient(115deg,#073958 0%,#075e73 48%,#0d8d8c 100%)'},
  {key:'forest',label:'Forest',kind:'color',bg:'linear-gradient(115deg,#102f2c 0%,#18534a 50%,#2b7561 100%)'},
  {key:'indigo',label:'Indigo',kind:'color',bg:'linear-gradient(115deg,#1c2450 0%,#354283 52%,#5c5f9e 100%)'},
  {key:'slate',label:'Slate',kind:'color',bg:'linear-gradient(115deg,#1d2a36 0%,#34495a 52%,#557386 100%)'},
  {key:'copper',label:'Copper',kind:'color',bg:'linear-gradient(115deg,#3a2421 0%,#70463a 52%,#9a6c54 100%)'},
  {key:'plum',label:'Plum',kind:'color',bg:'linear-gradient(115deg,#291d3d 0%,#523760 50%,#7b5270 100%)'},
  {key:'graphite',label:'Graphite',kind:'color',bg:'linear-gradient(115deg,#151b24 0%,#303944 52%,#53606d 100%)'},
  {key:'blueprint',label:'Blueprint',kind:'color',bg:'linear-gradient(115deg,#08284b 0%,#12558c 52%,#1882a7 100%)'},
  {key:'modern-home',label:'Modern home',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.88),rgba(7,27,51,.48)),url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'architecture',label:'Architecture',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.88),rgba(7,27,51,.44)),url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'shore',label:'Shore',kind:'image',bg:"linear-gradient(90deg,rgba(6,31,56,.88),rgba(6,31,56,.42)),url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'neighborhood',label:'Neighborhood',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.89),rgba(7,27,51,.46)),url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'workspace',label:'Workspace',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.48)),url('https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'city-lights',label:'City lights',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.42)),url('https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'glass-towers',label:'Glass towers',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.40)),url('https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'front-door',label:'Front door',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.45)),url('https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'skyline',label:'Skyline',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.91),rgba(7,27,51,.40)),url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'blue-hour-home',label:'Blue hour',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.42)),url('https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=2000&q=82') center/cover"},
  {key:'aurora-motion',label:'Aurora',kind:'motion',bg:'radial-gradient(circle at 15% 35%,rgba(74,232,215,.72),transparent 34%),radial-gradient(circle at 78% 38%,rgba(91,116,255,.60),transparent 36%),linear-gradient(120deg,#07172c,#103d55 48%,#073c43)'},
  {key:'signal-grid',label:'Signal Grid',kind:'motion',bg:'linear-gradient(rgba(92,233,219,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(92,233,219,.12) 1px,transparent 1px),radial-gradient(circle at 72% 45%,rgba(36,181,197,.42),transparent 30%),linear-gradient(120deg,#07192d,#0b3045)'},
  {key:'tidal-motion',label:'Tidal',kind:'motion',bg:'radial-gradient(ellipse at 20% 110%,rgba(44,205,194,.58),transparent 42%),radial-gradient(ellipse at 82% -5%,rgba(57,118,239,.54),transparent 40%),linear-gradient(120deg,#071b31,#0e4251 58%,#0b293d)'},
  {key:'spectrum-motion',label:'Spectrum',kind:'motion',bg:'linear-gradient(120deg,#091b35 0%,#0c6d78 20%,#5a48a8 42%,#c84f86 60%,#1ba7a1 80%,#0a2440 100%)'},
  {key:'orbit-motion',label:'Orbit',kind:'motion',bg:'radial-gradient(circle at 50% 50%,transparent 0 18%,rgba(116,231,218,.22) 19% 20%,transparent 21% 31%,rgba(105,141,255,.18) 32% 33%,transparent 34%),radial-gradient(circle at 15% 20%,rgba(79,221,213,.50),transparent 24%),linear-gradient(135deg,#07182c,#132a4c 54%,#0b4f54)'}
];
var LIFETIME={
  agent:{label:'Agent',value:'$1,499',amount:149900},
  pro:{label:'Pro',value:'$3,499',amount:349900},
  pro_plus:{label:'Pro+',value:'$9,999',amount:999900}
};

function getClient(){
  if(client)return client;
  try{if(window.NJPTRSupabaseRuntime)client=window.NJPTRSupabaseRuntime.createClient();}catch(_){}
  return client;
}
function themeByKey(key){return THEMES.find(function(t){return t.key===key;})||THEMES[0];}
function currentTheme(){
  var meta=user&&user.user_metadata||{};
  return themeByKey(meta.watchdog_account_hero_theme||'watchdog');
}
function applyThemeVisual(node,theme){
  if(!node||!theme)return;
  if(theme.kind==='motion'){
    node.style.removeProperty('background');
    node.dataset.motionTheme=theme.key;
  }else{
    delete node.dataset.motionTheme;
    node.style.setProperty('background',theme.bg,'important');
  }
}
function applyTheme(key){
  var hero=document.querySelector('.ac-profile-hero');if(!hero)return;
  var theme=themeByKey(key);
  hero.dataset.accountHeroTheme=theme.key;
  applyThemeVisual(hero,theme);
}
function themeButton(theme){
  var button=document.createElement('button');
  button.type='button';button.className='ac-theme-choice '+theme.kind;button.dataset.heroTheme=theme.key;
  if(theme.kind==='motion')button.dataset.motionTheme=theme.key;
  button.setAttribute('aria-label','Preview '+theme.label+' profile background');button.setAttribute('aria-pressed','false');
  button.style.setProperty('--theme-preview',theme.bg);
  button.innerHTML='<span class="ac-theme-preview"></span><span class="ac-theme-name">'+theme.label+'</span><i class="fas fa-check" aria-hidden="true"></i>';
  return button;
}
function syncThemePreviewIdentity(){
  var panel=document.getElementById('ac-theme-popover'),hero=document.querySelector('.ac-profile-hero');if(!panel||!hero)return;
  var sourceName=hero.querySelector('.ac-hero-copy h1'),sourceSub=hero.querySelector('.ac-hero-copy>p'),sourceAvatar=hero.querySelector('.ac-avatar'),sourceWrap=hero.querySelector('.ac-avatar-wrap'),sourceVerify=hero.querySelector('.ac-pro-badge');
  var name=panel.querySelector('#ac-theme-preview-name'),sub=panel.querySelector('#ac-theme-preview-sub'),avatar=panel.querySelector('#ac-theme-preview-avatar'),verify=panel.querySelector('#ac-theme-preview-verified');
  if(name){name.textContent=sourceName?sourceName.textContent:'Your Watchdog profile';name.title=sourceName&&sourceName.title||'';}
  if(sub)sub.textContent=sourceSub?sourceSub.textContent:'Watchdog member';
  if(verify){verify.hidden=!sourceVerify;verify.title=sourceVerify&&sourceVerify.title||'';}
  if(avatar){
    avatar.replaceChildren();avatar.classList.toggle('has-broker-brand',!!(sourceWrap&&sourceWrap.classList.contains('has-broker-brand')));
    if(sourceWrap){avatar.style.setProperty('--broker-primary',sourceWrap.style.getPropertyValue('--broker-primary')||'#0B8B85');avatar.style.setProperty('--broker-secondary',sourceWrap.style.getPropertyValue('--broker-secondary')||'#F15A24');}
    var image=sourceAvatar&&sourceAvatar.querySelector('img');
    if(image){var clone=document.createElement('img');clone.src=image.src;clone.alt='';avatar.appendChild(clone);}
    else{avatar.textContent=(sourceName&&sourceName.textContent?sourceName.textContent:'W').trim().charAt(0).toUpperCase()||'W';}
  }
}
function updateThemePreview(key){
  var theme=themeByKey(key),panel=document.getElementById('ac-theme-popover');pendingThemeKey=theme.key;
  if(!panel)return;
  var banner=panel.querySelector('#ac-theme-preview-banner');if(banner)applyThemeVisual(banner,theme);
  panel.querySelectorAll('.ac-theme-choice').forEach(function(button){
    button.setAttribute('aria-pressed',button.dataset.heroTheme===theme.key?'true':'false');
  });
  var selected=panel.querySelector('#ac-theme-selected-name');if(selected)selected.textContent=theme.label;
  var apply=panel.querySelector('[data-apply-theme]');if(apply){apply.disabled=false;apply.textContent=theme.key===pendingThemeOriginalKey?'Keep this background':'Apply background';}
}
function renderThemeGrid(panel,kind){
  if(!panel)return;
  var grid=panel.querySelector('#ac-theme-browser-grid');if(!grid)return;
  grid.replaceChildren();
  THEMES.filter(function(theme){return theme.kind===kind;}).forEach(function(theme){grid.appendChild(themeButton(theme));});
}
function setThemeTab(panel,kind){
  if(!panel)return;
  if(['color','image','motion'].indexOf(kind)<0)kind='color';
  panel.dataset.themeTab=kind;
  panel.querySelectorAll('[data-theme-tab]').forEach(function(tab){
    tab.setAttribute('aria-selected',tab.dataset.themeTab===kind?'true':'false');
  });
  renderThemeGrid(panel,kind);
  panel.querySelectorAll('.ac-theme-choice').forEach(function(button){
    button.setAttribute('aria-pressed',button.dataset.heroTheme===pendingThemeKey?'true':'false');
  });
}
function closeThemePanel(){
  var panel=document.getElementById('ac-theme-popover'),backdrop=document.getElementById('ac-theme-backdrop');
  if(panel)panel.hidden=true;if(backdrop)backdrop.hidden=true;document.body.classList.remove('ac-theme-open');
  pendingThemeKey=null;pendingThemeOriginalKey=null;
  if(activeThemeToggle){activeThemeToggle.setAttribute('aria-expanded','false');activeThemeToggle.focus();activeThemeToggle=null;}
}
function ensureThemePanel(){
  var panel=document.getElementById('ac-theme-popover');if(panel)return panel;
  var backdrop=document.createElement('div');backdrop.id='ac-theme-backdrop';backdrop.className='ac-theme-backdrop';backdrop.hidden=true;
  panel=document.createElement('section');panel.id='ac-theme-popover';panel.className='ac-theme-popover';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','ac-theme-title');
  panel.innerHTML='<header><div><h3 id="ac-theme-title">Choose your background</h3></div><button type="button" data-close-theme aria-label="Close background chooser"><i class="fas fa-xmark"></i></button></header>'+
    '<section class="ac-theme-live"><div class="ac-theme-live-head"><b>Live preview</b><span>This is how your profile hero will look.</span></div><div class="ac-theme-live-banner" id="ac-theme-preview-banner"><div class="ac-theme-live-avatar" id="ac-theme-preview-avatar">W</div><div class="ac-theme-live-copy"><div class="ac-theme-live-name-row"><strong id="ac-theme-preview-name">Your Watchdog profile</strong><span class="ac-theme-live-verified" id="ac-theme-preview-verified" hidden><i class="fas fa-circle-check"></i></span></div><small id="ac-theme-preview-sub">Watchdog member</small></div><div class="ac-theme-live-badge"><i class="fas fa-eye"></i><span id="ac-theme-selected-name">Watchdog</span></div></div></section>'+
    '<nav class="ac-theme-tabs" aria-label="Background categories"><button type="button" data-theme-tab="color" aria-selected="true">Gradients <em>'+THEMES.filter(function(t){return t.kind==='color';}).length+'</em></button><button type="button" data-theme-tab="image" aria-selected="false">Photos <em>'+THEMES.filter(function(t){return t.kind==='image';}).length+'</em></button><button type="button" data-theme-tab="motion" aria-selected="false">Motion <em>'+THEMES.filter(function(t){return t.kind==='motion';}).length+'</em></button></nav>'+
    '<div class="ac-theme-browser"><div class="ac-theme-grid" id="ac-theme-browser-grid"></div></div>'+
    '<footer class="ac-theme-actions"><button type="button" class="secondary" data-cancel-theme>Cancel</button><span><i class="fas fa-cloud"></i> Saved only when you apply</span><button type="button" class="primary" data-apply-theme>Apply background</button></footer>';
  document.body.appendChild(backdrop);document.body.appendChild(panel);
  renderThemeGrid(panel,'color');
  backdrop.addEventListener('click',closeThemePanel);panel.querySelector('[data-close-theme]').addEventListener('click',closeThemePanel);
  panel.addEventListener('click',function(event){
    var tab=event.target.closest('[data-theme-tab]');if(tab){setThemeTab(panel,tab.dataset.themeTab);return;}
    var choice=event.target.closest('[data-hero-theme]');if(choice){updateThemePreview(choice.dataset.heroTheme);return;}
    if(event.target.closest('[data-cancel-theme]')){closeThemePanel();return;}
    if(event.target.closest('[data-apply-theme]')){saveTheme(pendingThemeKey||pendingThemeOriginalKey);return;}
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!panel.hidden)closeThemePanel();});
  return panel;
}
function openThemePanel(toggle){
  var panel=ensureThemePanel(),backdrop=document.getElementById('ac-theme-backdrop'),saved=currentTheme();
  activeThemeToggle=toggle;pendingThemeOriginalKey=saved.key;pendingThemeKey=saved.key;
  panel.hidden=false;if(backdrop)backdrop.hidden=false;document.body.classList.add('ac-theme-open');toggle.setAttribute('aria-expanded','true');
  syncThemePreviewIdentity();setThemeTab(panel,saved.kind);updateThemePreview(saved.key);
  var close=panel.querySelector('[data-close-theme]');if(close)close.focus();
}
async function saveTheme(key){
  var db=getClient(),theme=themeByKey(key),panel=document.getElementById('ac-theme-popover'),apply=panel&&panel.querySelector('[data-apply-theme]');
  if(!db||!user||!theme)return;
  var oldText=apply?apply.textContent:'Apply background';
  if(apply){apply.disabled=true;apply.textContent='Saving…';}
  try{
    var result=await db.auth.updateUser({data:{watchdog_account_hero_theme:theme.key}});
    if(result.error)throw result.error;
    user=result.data&&result.data.user||user;applyTheme(theme.key);pendingThemeOriginalKey=theme.key;
    toast('Profile background updated.');closeThemePanel();
  }catch(error){
    toast('Background preference could not be saved.');
    if(apply){apply.disabled=false;apply.textContent=oldText;}
  }
}
function mountThemePicker(){
  var hero=document.querySelector('.ac-profile-hero');if(!hero)return;applyTheme(currentTheme().key);ensureThemePanel();
  var control=hero.querySelector('.ac-hero-style-control');
  if(!control){
    control=document.createElement('div');control.className='ac-hero-style-control';
    control.innerHTML='<button class="ac-hero-style-toggle" type="button" aria-expanded="false"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Customize</span></button>';
    hero.appendChild(control);
    control.querySelector('button').addEventListener('click',function(event){event.stopPropagation();openThemePanel(event.currentTarget);});
  }
}

function normalizePlan(value){return String(value||'standard').toLowerCase().replace('pro+','pro_plus');}
function currentPlan(){return normalizePlan(entitlement.plan_tier||entitlement.billing_tier||'standard');}
function hasRecurring(){
  return Boolean(entitlement.provider_subscription_id)&&['active','trialing','past_due','paused'].indexOf(String(entitlement.subscription_status||''))>=0;
}
function hasLifetime(){return entitlement.billing_interval==='lifetime'&&String(entitlement.subscription_status||'')==='active';}
function directButton(card){
  return Array.prototype.find.call(card.children,function(node){return node&&node.tagName==='BUTTON';})||card.querySelector('button');
}
function clearBillingAttrs(button){
  ['data-billing-plan','data-billing-cadence','data-billing-portal','data-account-lifetime-plan'].forEach(function(name){button.removeAttribute(name);});
}
function setLifetimeMode(){
  lifetimeMode=true;document.body.classList.add('ac-lifetime-mode');
  var section=document.getElementById('membership-options');if(!section)return;
  var group=section.querySelector('.ac-cadence');
  if(group)group.querySelectorAll('button').forEach(function(button){
    var on=button.hasAttribute('data-account-lifetime');
    button.setAttribute('aria-pressed',on?'true':'false');
  });
  Object.keys(LIFETIME).forEach(function(key){
    var card=section.querySelector('.ac-price-card[data-plan="'+key+'"]');if(!card)return;
    var offer=LIFETIME[key],price=card.querySelector('.ac-price b'),unit=card.querySelector('.ac-price span'),note=card.querySelector(':scope > small'),button=directButton(card);
    if(price)price.textContent=offer.value;
    if(unit)unit.textContent=' once';
    if(note)note.textContent='One payment · no renewal';
    var eyebrow=card.querySelector('.ac-price-head>div>span');if(eyebrow)eyebrow.textContent='FOUNDING LIFETIME';
    if(!button)return;
    clearBillingAttrs(button);button.disabled=false;
    if(entitlement.account_role==='developer'){
      button.disabled=true;button.textContent='Developer access includes this';return;
    }
    if(hasLifetime()){
      button.disabled=true;button.textContent=currentPlan()===key?'Current Lifetime':'Lifetime already active';return;
    }
    if(hasRecurring()){
      button.setAttribute('data-billing-portal','');button.textContent='Manage subscription first';return;
    }
    button.dataset.accountLifetimePlan=key;button.innerHTML='Get '+offer.label+' Lifetime';
  });
  var note=section.querySelector('.ac-lifetime-terms');
  if(!note){
    note=document.createElement('div');note.className='ac-lifetime-terms';
    note.innerHTML='<i class="fas fa-circle-info"></i><div><b>Founding Lifetime</b> is a one-time purchase for the same plan limits. Usage-based services, direct mail, third-party data and overages remain separate.</div>';
    var header=section.querySelector('.ac-pricing-header');
    if(header)header.insertAdjacentElement('afterend',note);
  }
}
function addLifetimeTab(){
  var section=document.getElementById('membership-options');if(!section)return;
  var group=section.querySelector('.ac-cadence');if(!group)return;
  if(!group.querySelector('[data-account-lifetime]')){
    var button=document.createElement('button');button.type='button';button.setAttribute('data-account-lifetime','');button.setAttribute('aria-pressed','false');
    button.innerHTML='Lifetime <em>One-time</em>';
    group.appendChild(button);
  }
  if(lifetimeMode)setLifetimeMode();
}
async function lifetimeCheckout(plan){
  if(busy||!LIFETIME[plan])return;busy=true;
  try{
    var billing=window.WatchdogBilling,db=getClient();
    if(!billing||typeof billing.invoke!=='function'||!db)throw new Error('Secure billing is unavailable. Please refresh and try again.');
    var sessionResult=await db.auth.getSession(),session=sessionResult&&sessionResult.data&&sessionResult.data.session;
    if(!session){
      if(window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.openOnboarding)window.NJPTRSupabaseRuntime.openOnboarding(location.pathname+location.search+location.hash);
      return;
    }
    var result=await billing.invoke('create-lifetime-checkout',{tier:plan});
    if(!result||!result.url)throw new Error('Secure checkout did not return a destination.');
    location.href=result.url;
  }catch(error){
    var message=String(error&&error.message||'Lifetime checkout could not be opened.');
    if(error&&error.code==='LIFETIME_ACTIVE_SUBSCRIPTION')message='Manage your current recurring subscription before switching to Lifetime.';
    if(error&&error.code==='LIFETIME_ALREADY_ACTIVE')message='Founding Lifetime is already active on this account.';
    if(error&&error.code==='WATCHDOG_TEST_NO_REAL_SPEND')message='This test account cannot create a real charge.';
    toast(message);
  }finally{busy=false;}
}
function toast(message){
  var node=document.getElementById('ac-account-toast');
  if(!node){node=document.createElement('div');node.id='ac-account-toast';node.className='ac-account-toast';node.setAttribute('role','status');document.body.appendChild(node);}
  node.textContent=message;node.hidden=false;clearTimeout(window.__acAccountToast);window.__acAccountToast=setTimeout(function(){node.hidden=true;},7000);
}

function fallbackCleanup(){
  var pageTop=document.querySelector('body[data-sidebar-page="account"] .top');
  if(pageTop){pageTop.querySelectorAll('.top-eyebrow').forEach(function(node){node.remove();});var pageTitle=pageTop.querySelector('h1');if(pageTitle&&pageTitle.parentElement){Array.prototype.slice.call(pageTitle.parentElement.children).forEach(function(node){if(node!==pageTitle&&['SPAN','P','SMALL'].indexOf(node.tagName)>=0)node.remove();});}}
  var header=document.querySelector('.acp-profile-hub .acp-header');
  if(header){
    var eyebrow=header.querySelector('div>span');if(eyebrow&&eyebrow.textContent.trim()==='PROFILE')eyebrow.remove();
    var p=header.querySelector('div>p');if(p)p.remove();
  }
  var signin=document.getElementById('ac-signin-security');
  if(signin){
    var signHeader=signin.querySelector('header');
    if(signHeader){var span=signHeader.querySelector('span');if(span)span.remove();var p2=signHeader.querySelector('p');if(p2)p2.remove();}
    var note=signin.querySelector('#ac-signin-note');
    if(note&&/Watchdog never posts/.test(note.textContent||''))note.textContent='';
  }
  var self=document.getElementById('ac-self-service');
  if(self){
    var h=self.querySelector('header h2');if(h)h.textContent='Watchdog Account';
    var s=self.querySelector('header span');if(s)s.remove();
    var p3=self.querySelector('header p');if(p3)p3.remove();
  }
}
function enhance(){
  fallbackCleanup();mountThemePicker();addLifetimeTab();
}
async function loadState(){
  var db=getClient();if(!db)return;
  try{
    var auth=await db.auth.getUser();user=auth&&auth.data&&auth.data.user||user;
    var ent=await db.rpc('get_my_entitlement');
    entitlement=(Array.isArray(ent.data)?ent.data[0]:ent.data)||entitlement||{};
  }catch(_){}
  enhance();
}
function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,20);}
document.addEventListener('watchdog:account-rendered',function(){lifetimeMode=false;document.body.classList.remove('ac-lifetime-mode');loadState();});
document.addEventListener('click',function(event){
  var copyId=event.target.closest('[data-copy-account-id]');
  if(copyId){event.preventDefault();var id=copyId.dataset.copyAccountId||'';var done=function(){var icon=copyId.querySelector('i');if(icon){icon.className='fas fa-check';setTimeout(function(){icon.className='fas fa-copy';},1200);}};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(id).then(done).catch(function(){toast('Account ID could not be copied.');});else{var ta=document.createElement('textarea');ta.value=id;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(_){toast('Account ID could not be copied.');}ta.remove();}return;}
  var lifetime=event.target.closest('[data-account-lifetime]');
  if(lifetime){event.preventDefault();event.stopPropagation();setLifetimeMode();return;}
  var checkout=event.target.closest('[data-account-lifetime-plan]');
  if(checkout){event.preventDefault();event.stopPropagation();lifetimeCheckout(checkout.dataset.accountLifetimePlan);return;}
  if(event.target.closest('[data-cadence]')){lifetimeMode=false;document.body.classList.remove('ac-lifetime-mode');}
},true);

function start(){
  var app=document.getElementById('ac-app');
  if(app){var observer=new MutationObserver(scheduleEnhance);observer.observe(app,{childList:true,subtree:false});}
  loadState();scheduleEnhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

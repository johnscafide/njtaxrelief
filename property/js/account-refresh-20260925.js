(function(){
'use strict';
if(!document.body || document.body.getAttribute('data-sidebar-page')!=='account')return;

var client=null,user=null,entitlement={};
var lifetimeMode=false,busy=false,enhanceTimer=null;
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
  {key:'workspace',label:'Workspace',kind:'image',bg:"linear-gradient(90deg,rgba(7,27,51,.90),rgba(7,27,51,.48)),url('https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2000&q=82') center/cover"}
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
function applyTheme(key){
  var hero=document.querySelector('.ac-profile-hero');if(!hero)return;
  var theme=themeByKey(key);
  hero.dataset.accountHeroTheme=theme.key;
  hero.style.setProperty('background',theme.bg,'important');
  hero.querySelectorAll('.ac-theme-choice').forEach(function(button){
    button.setAttribute('aria-pressed',button.dataset.heroTheme===theme.key?'true':'false');
  });
}
function themeButton(theme){
  var button=document.createElement('button');
  button.type='button';button.className='ac-theme-choice';button.dataset.heroTheme=theme.key;
  button.setAttribute('aria-label','Use '+theme.label+' profile background');
  button.setAttribute('aria-pressed','false');
  button.style.setProperty('--theme-preview',theme.bg);
  button.innerHTML='<span>'+theme.label+'</span>';
  return button;
}
async function saveTheme(key){
  var db=getClient();if(!db||!user)return;
  applyTheme(key);
  try{
    var result=await db.auth.updateUser({data:{watchdog_account_hero_theme:key}});
    if(result.error)throw result.error;
    user=result.data&&result.data.user||user;
  }catch(error){
    toast('Background preference could not be saved.');
  }
}
function mountThemePicker(){
  var hero=document.querySelector('.ac-profile-hero');if(!hero)return;
  applyTheme(currentTheme().key);
  if(hero.querySelector('.ac-hero-style-control'))return;
  var control=document.createElement('div');control.className='ac-hero-style-control';
  control.innerHTML='<button class="ac-hero-style-toggle" type="button" aria-expanded="false"><i class="fas fa-palette"></i> Background</button>'+
    '<div class="ac-hero-style-panel" hidden><header><b>Profile background</b><button type="button" data-close-theme aria-label="Close"><i class="fas fa-xmark"></i></button></header>'+
    '<div class="ac-theme-group" data-theme-kind="color"><span>Colors & gradients</span><div class="ac-theme-grid"></div></div>'+
    '<div class="ac-theme-group" data-theme-kind="image"><span>Unsplash photos</span><div class="ac-theme-grid"></div></div></div>';
  hero.appendChild(control);
  THEMES.forEach(function(theme){
    var grid=control.querySelector('[data-theme-kind="'+theme.kind+'"] .ac-theme-grid');
    if(grid)grid.appendChild(themeButton(theme));
  });
  var toggle=control.querySelector('.ac-hero-style-toggle'),panel=control.querySelector('.ac-hero-style-panel');
  function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
  toggle.addEventListener('click',function(event){event.stopPropagation();panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',panel.hidden?'false':'true');});
  control.querySelector('[data-close-theme]').addEventListener('click',close);
  control.addEventListener('click',function(event){
    var choice=event.target.closest('[data-hero-theme]');if(!choice)return;
    saveTheme(choice.dataset.heroTheme);close();
  });
  document.addEventListener('click',function(event){if(!control.contains(event.target))close();});
  document.addEventListener('keydown',function(event){if(event.key==='Escape')close();});
  applyTheme(currentTheme().key);
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

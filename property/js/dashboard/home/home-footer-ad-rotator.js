/* Property Home rotating ad banner.
   Mirrors the public Property Lookup rotation treatment while keeping its own slot analytics. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_FOOTER_ADS__)return;
window.__WATCHDOG_HOME_FOOTER_ADS__=true;

var SLOT='property_home_footer';
var GREENTREE='Advertisement. Greentree Mortgage, an HMA Company, is a separate company and is not affiliated with Opus Elite Real Estate. You are never required to use any particular lender, and you are free to shop for a mortgage. Nothing here is a loan commitment, an offer of credit, or a guarantee of terms.';
var JOHN='Advertisement. John Scafide is a licensed New Jersey real estate agent, NJ License #2079591, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
var HEATHER='Advertisement. Heather Scafide is a licensed New Jersey real estate agent, NJ License #2192318, with The McKenty Team at Opus Elite Real Estate. If a property shown on Watchdog is listed by another brokerage, this is not a solicitation of that listing.';
var RELIEF='Advertisement for NJPropertyTaxRelief.com. This website is not affiliated with the State of New Jersey or any government agency. Estimates are informational and final eligibility depends on the official program rules and application.';
var ADS=[
 {id:'greentree-payment-before-house',advertiser:'Greentree Mortgage',campaign:'financing_context',eyebrow:'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',headline:'Know the payment before you fall in love with the house.',sub:'Taxes are only part of the monthly number. Review principal, interest, taxes, insurance and escrow before you make a move.',cta:'Talk Financing',href:'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_payment',photo:'/johnvarano.jpg',alt:'John Varano, Branch Manager, Greentree Mortgage an HMA Company',disclosure:GREENTREE,theme:'greentree'},
 {id:'greentree-full-monthly-number',advertiser:'Greentree Mortgage',campaign:'financing_context',eyebrow:'Greentree Mortgage, an HMA Company · John Varano, Branch Manager',headline:'Know the full monthly number before you start making offers.',sub:'A payment conversation can put taxes, insurance and escrow into context before the home search gets serious.',cta:'Run the Numbers',href:'https://johnvarano.com/?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=greentree_financing&utm_content=property_home_full_payment',photo:'/johnvarano.jpg',alt:'John Varano, Branch Manager, Greentree Mortgage an HMA Company',disclosure:GREENTREE,theme:'greentree'},
 {id:'john-buyer-mls',advertiser:'John Scafide Realtor',campaign:'realtor_buyer',eyebrow:'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Found a property worth watching? See what is actually for sale.',sub:'Public records explain the property. MLS access shows what you can buy right now across New Jersey.',cta:'Search Homes',href:'/search-homes.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_buyer&utm_content=property_home_mls',photo:'/johnprofile.jpg',alt:'John Scafide, licensed New Jersey real estate agent',disclosure:JOHN,theme:'john'},
 {id:'john-seller-value',advertiser:'John Scafide Realtor',campaign:'realtor_seller',eyebrow:'John Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Your tax record is one piece of your home’s story. Market value is another.',sub:'If selling is on your radar, start with a current value estimate and a practical conversation about the market.',cta:'Check Home Value',href:'/home-value.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=john_seller&utm_content=property_home_value',photo:'/johnprofile.jpg',alt:'John Scafide, licensed New Jersey real estate agent',disclosure:JOHN,theme:'john'},
 {id:'heather-buyer-guidance',advertiser:'Heather Scafide Realtor',campaign:'realtor_buyer',eyebrow:'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Buying a home should feel informed, not rushed.',sub:'Move from property research to a focused South Jersey home search with a licensed professional on your side.',cta:'Ask Heather',href:'mailto:heather@heatherscafide.com?subject=Watchdog%20Buyer%20Inquiry',photo:'/heatherheadshot.png',alt:'Heather Scafide, licensed New Jersey real estate agent',disclosure:HEATHER,theme:'heather'},
 {id:'heather-seller-strategy',advertiser:'Heather Scafide Realtor',campaign:'realtor_seller',eyebrow:'Heather Scafide · Licensed NJ Real Estate Agent · Opus Elite Real Estate',headline:'Thinking about selling? Start with the facts, then build the plan.',sub:'Turn property data, timing and your goals into a practical selling strategy.',cta:'Talk About Selling',href:'mailto:heather@heatherscafide.com?subject=Watchdog%20Seller%20Inquiry',photo:'/heatherheadshot.png',alt:'Heather Scafide, licensed New Jersey real estate agent',disclosure:HEATHER,theme:'heather'},
 {id:'relief-check-benefit',advertiser:'NJ Property Tax Relief',campaign:'relief_estimator',eyebrow:'NJ Property Tax Relief · Free estimator',headline:'Your property tax relief may be worth a few minutes to check.',sub:'See how ANCHOR, Stay NJ and Senior Freeze may fit your household before you assume you do or do not qualify.',cta:'Estimate My Relief',href:'/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=property_home_check',photo:'/favicon.svg',alt:'NJ Property Tax Relief',disclosure:RELIEF,theme:'relief',logo:true},
 {id:'relief-dont-leave-money',advertiser:'NJ Property Tax Relief',campaign:'relief_estimator',eyebrow:'NJ Property Tax Relief · Free estimator',headline:'Before you leave property tax relief on the table, run the estimate.',sub:'New Jersey relief programs can overlap. Answer a few questions for a plain-language starting point.',cta:'Start the Estimator',href:'/anchor-estimator.html?utm_source=watchdog&utm_medium=internal_ad&utm_campaign=relief_estimator&utm_content=property_home_start',photo:'/favicon.svg',alt:'NJ Property Tax Relief',disclosure:RELIEF,theme:'relief',logo:true}
];
var state={current:-1,queue:[],timer:0,visible:false,tracked:false};
function q(s,r){return (r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function theme(name){
 if(name==='john')return{bg:'linear-gradient(120deg,#0b1732,#15345f 58%,#24547e)',shadow:'rgba(8,27,56,.28)',accent:'#e6c355',sub:'#d7e3f2',button:'linear-gradient(135deg,#e0bb52,#b8972a)',buttonText:'#17203a'};
 if(name==='heather')return{bg:'linear-gradient(120deg,#17243b,#294866 58%,#3b647e)',shadow:'rgba(17,44,68,.28)',accent:'#f0cf74',sub:'#d9e7ef',button:'linear-gradient(135deg,#efd07c,#c6a347)',buttonText:'#17203a'};
 if(name==='relief')return{bg:'linear-gradient(120deg,#0b3640,#0d6870 58%,#168d96)',shadow:'rgba(8,77,83,.28)',accent:'#f0d16c',sub:'#d3eef0',button:'linear-gradient(135deg,#f0d16c,#c5a23d)',buttonText:'#102d35'};
 return{bg:'linear-gradient(120deg,#14361f,#1e6b3a 58%,#2b8a4d)',shadow:'rgba(16,60,32,.28)',accent:'#e6c355',sub:'#bfe0cb',button:'linear-gradient(135deg,#e0bb52,#b8972a)',buttonText:'#17203a'};
}
function promotion(ad){return{creative_name:ad.id,creative_slot:SLOT,promotion_id:ad.id,promotion_name:ad.campaign,items:[{item_id:ad.id,item_name:ad.headline,item_brand:ad.advertiser,item_category:'watchdog_internal_ad'}]}}
function track(name,ad){if(!ad||typeof window.gtag!=='function')return;try{window.gtag('event',name,{ad_id:ad.id,advertiser:ad.advertiser,campaign:ad.campaign,creative_slot:SLOT,destination:ad.href});if(name==='watchdog_ad_impression')window.gtag('event','view_promotion',promotion(ad));if(name==='watchdog_ad_click')window.gtag('event','select_promotion',promotion(ad))}catch(_e){}}
function trackVisible(){if(!state.visible||state.tracked||state.current<0)return;state.tracked=true;track('watchdog_ad_impression',ADS[state.current])}
function render(index){
 var banner=q('.hm-footer-ad .gt-banner');if(!banner||!ADS[index])return;
 var ad=ADS[index],t=theme(ad.theme),inner=q('.gt-banner-inner',banner),image=q('.gt-photo img',banner),photo=q('.gt-photo',banner),eyebrow=q('.gt-eyebrow',banner),headline=q('.gt-headline',banner),sub=q('.gt-sub',banner),cta=q('.gt-cta',banner),disc=q('.gt-disc',banner);
 state.current=index;state.tracked=false;banner.dataset.adId=ad.id;banner.href=ad.href;banner.setAttribute('aria-label',ad.advertiser+': '+ad.headline);
 if(/^https?:\/\//i.test(ad.href)){banner.target='_blank';banner.rel='noopener sponsored'}else{banner.removeAttribute('target');banner.removeAttribute('rel')}
 if(photo)photo.style.display='';
 if(image){image.src=ad.photo;image.alt=ad.alt;image.style.display='block';image.style.objectFit=ad.logo?'contain':'cover';image.style.background=ad.logo?'#fff':'transparent';image.style.padding=ad.logo?'10px':'0';image.style.borderColor=t.accent}
 if(eyebrow){eyebrow.textContent=ad.eyebrow;eyebrow.style.color=t.accent}
 if(headline)headline.textContent=ad.headline;
 if(sub){sub.textContent=ad.sub;sub.style.color=t.sub}
 if(cta){cta.innerHTML=esc(ad.cta)+' <i class="fas fa-arrow-right"></i>';cta.style.background=t.button;cta.style.color=t.buttonText}
 if(disc)disc.textContent=ad.disclosure;
 if(inner){inner.style.background=t.bg;inner.style.boxShadow='0 20px 50px '+t.shadow;inner.style.borderColor=t.accent+'59'}
 trackVisible();
}
function shuffle(){var order=ADS.map(function(_a,i){return i});for(var i=order.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),tmp=order[i];order[i]=order[j];order[j]=tmp}if(state.current>=0&&order.length>1&&order[0]===state.current){var s=order[0];order[0]=order[1];order[1]=s}state.queue=order}
function next(){if(!state.queue.length)shuffle();render(state.queue.shift())}
function schedule(){clearTimeout(state.timer);state.timer=setTimeout(function(){if(document.visibilityState!=='hidden')next();schedule()},20000+Math.floor(Math.random()*10001))}
function boot(){var banner=q('.hm-footer-ad .gt-banner');if(!banner||banner.dataset.wdAdRotator==='1')return;banner.dataset.wdAdRotator='1';banner.addEventListener('click',function(){if(state.current>=0)track('watchdog_ad_click',ADS[state.current])});if('IntersectionObserver'in window){new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.target!==banner)return;state.visible=entry.isIntersecting&&entry.intersectionRatio>=.25;trackVisible()})},{threshold:[0,.25,.5,1]}).observe(banner)}else state.visible=true;shuffle();next();schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

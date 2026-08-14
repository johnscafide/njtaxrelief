(function(){'use strict';
const VARIANTS={
 seller_value_postcard:{eyebrow:'HOME VALUE',accent:'dark',visual:'house',badge:'Seller'},
 equity_opportunity_postcard:{eyebrow:'PROPERTY EQUITY',accent:'warm',visual:'equity',badge:'Equity'},
 tax_review_postcard:{eyebrow:'PROPERTY TAX REVIEW',accent:'blue',visual:'tax',badge:'Tax'},
 high_tax_letter:{eyebrow:'PROPERTY TAX',accent:'paper',visual:'letter',badge:'Letter'},
 new_homeowner_postcard:{eyebrow:'WELCOME HOME',accent:'green',visual:'keys',badge:'Welcome'},
 lending_review_postcard:{eyebrow:'PROPERTY FINANCE',accent:'navy',visual:'finance',badge:'Lending'},
 investor_opportunity_postcard:{eyebrow:'INVESTOR OPPORTUNITY',accent:'charcoal',visual:'chart',badge:'Investor'},
 local_market_postcard:{eyebrow:'LOCAL MARKET',accent:'sand',visual:'map',badge:'Market'},
 professional_intro_letter:{eyebrow:'LOCAL PROFESSIONAL',accent:'paper',visual:'letter',badge:'Letter'},
 second_touch_postcard:{eyebrow:'FOLLOW-UP',accent:'slate',visual:'mail',badge:'Follow-up'}
};
const icon={house:'⌂',equity:'↗',tax:'%',letter:'≡',keys:'⌘',finance:'$',chart:'▥',map:'⌖',mail:'✉'};
function enhance(){document.querySelectorAll('.msc-template[data-template]').forEach(btn=>{if(btn.dataset.visualized==='1')return;btn.dataset.visualized='1';const key=btn.dataset.template||'',v=VARIANTS[key]||{eyebrow:'WATCHDOG CAMPAIGN',accent:'dark',visual:'mail',badge:'Creative'};const title=btn.querySelector('b')?.textContent||'Campaign creative';const type=btn.querySelector('span')?.textContent||'postcard';const desc=btn.querySelector('small')?.textContent||'';btn.classList.add('msc-visual-template','tone-'+v.accent);btn.innerHTML=`<div class="msvg-thumb ${type==='letter'?'is-letter':'is-postcard'}"><div class="msvg-art"><span class="msvg-eyebrow">${v.eyebrow}</span><strong>${title}</strong><i aria-hidden="true">${icon[v.visual]||'✉'}</i><div class="msvg-lines"><span></span><span></span><span></span></div><em>YOUR BRAND</em></div>${type==='letter'?'<div class="msvg-paper-shadow"></div>':'<div class="msvg-mailback"><span></span><span></span></div>'}</div><div class="msvg-meta"><span class="msvg-badge">${v.badge}</span><b>${title}</b><small>${desc}</small><div class="msvg-actions"><span>Preview</span><span>Use template →</span></div></div>`;});}
function addStudioHeader(){const shell=document.querySelector('#creative-studio');if(!shell||shell.querySelector('.msvg-intro'))return;const body=shell.querySelector('#msc-body');if(!body)return;const intro=document.createElement('div');intro.className='msvg-intro';intro.innerHTML='<div><span class="ms-eyebrow">VISUAL CAMPAIGN LIBRARY</span><h3>See the campaign before you send it.</h3><p>Browse realistic postcard and letter concepts, then customize the message, brand and call to action. Final provider proofs remain a separate approval step.</p></div><div class="msvg-device"><div></div><span></span></div>';body.before(intro)}
let timer;function run(){clearTimeout(timer);timer=setTimeout(()=>{addStudioHeader();enhance()},80)}
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
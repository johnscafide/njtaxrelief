(function(){'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
let mounted=false;
function clickTenure(values){$$('[data-msar-tenure]').forEach(b=>{const should=values.includes(b.dataset.msarTenure);if(b.classList.contains('on')!==should)b.click()})}
function setValue(id,value){const el=$(id);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}}
function clearRange(ids){ids.forEach(id=>setValue(id,''))}
function apply(){setTimeout(()=>$('#msar-filter-apply')?.click(),0)}
function preset(key){
 if(key==='long'){clickTenure(['15_20','20_plus']);apply();return}
 if(key==='recent'){clickTenure(['0_5']);apply();return}
 if(key==='older'){clearRange(['#msar-year-min']);setValue('#msar-year-max','1979');apply();return}
 if(key==='acre'){setValue('#msar-acres-min','1');apply();return}
 if(key==='units'){setValue('#msar-units-min','2');apply();return}
 if(key==='tax'){setValue('#msar-tax-min','10000');apply();return}
 if(key==='clear'){$('#msar-filter-reset')?.click()}
}
function addPresets(panel){
 if(!panel||panel.querySelector('.msar-quick-presets'))return;
 const head=$('.msar-filter-head',panel);if(!head)return;
 const eyebrow=head.querySelector('span');if(eyebrow)eyebrow.textContent='FILTERS';
 const title=head.querySelector('h3');if(title)title.textContent='Narrow the audience.';
 const copy=head.querySelector('p');if(copy)copy.textContent='Property and Watchdog data only.';
 const bar=document.createElement('div');bar.className='msar-quick-presets';
 bar.innerHTML='<span>Quick filters</span><button type="button" data-msar-preset="long">15+ years owned</button><button type="button" data-msar-preset="recent">Recent sale</button><button type="button" data-msar-preset="older">Built before 1980</button><button type="button" data-msar-preset="acre">1+ acre</button><button type="button" data-msar-preset="units">2+ units</button><button type="button" data-msar-preset="tax">$10k+ tax</button><button type="button" class="clear" data-msar-preset="clear">Clear all</button>';
 head.after(bar);bar.addEventListener('click',e=>{const b=e.target.closest('[data-msar-preset]');if(b)preset(b.dataset.msarPreset)});
}
function criticalStyle(){
 if($('#msar-filter-critical-style'))return;
 const style=document.createElement('style');style.id='msar-filter-critical-style';style.textContent='.msar-filter-panel{box-sizing:border-box!important}.msar-filter-panel fieldset{box-sizing:border-box!important}.msar-filter-panel input{box-sizing:border-box!important}.msar-filter-panel button{font-family:inherit}.msar-filter-panel[hidden]{display:none!important}';document.head.appendChild(style);
}
function mount(){if(document.body.dataset.msWizard!=='audience-review')return;criticalStyle();const panel=$('#msar-filter-panel');if(panel)addPresets(panel);mounted=!!panel}
function init(){mount();new MutationObserver(()=>mount()).observe(document.documentElement,{childList:true,subtree:true});setInterval(()=>{if(!mounted)mount()},1200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

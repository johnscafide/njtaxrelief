(function(){'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
let desiredSide='front',guarding=false,lastReport=null;
function waitFrames(n=2){return new Promise(resolve=>{const step=()=>{if(--n<=0)return resolve();requestAnimationFrame(step)};requestAnimationFrame(step)})}
function visible(el){if(!el)return false;const cs=getComputedStyle(el);const r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>0&&r.height>0}
function applySide(next,source='guard'){
  const side=next==='back'?'back':'front';desiredSide=side;
  const canvas=$('.ms3-canvas');if(!canvas)return false;
  canvas.classList.toggle('show-front',side==='front');canvas.classList.toggle('show-back',side==='back');canvas.dataset.wddSide=side;
  $$('[data-ms3-side]').forEach(b=>{const on=b.dataset.ms3Side===side;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
  document.body.dataset.wddStudioSide=side;
  window.dispatchEvent(new CustomEvent('watchdog:studio-side-change',{detail:{side,source}}));
  return true;
}
function captureClick(e){const b=e.target.closest?.('[data-ms3-side]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();applySide(b.dataset.ms3Side,'user')}
function keepStable(){const canvas=$('.ms3-canvas');if(canvas&&!guarding){guarding=true;applySide(desiredSide,'mutation');queueMicrotask(()=>guarding=false)}}
function rect(el){const r=el?.getBoundingClientRect?.();return r?{width:+r.width.toFixed(3),height:+r.height.toFixed(3),x:+r.x.toFixed(3),y:+r.y.toFixed(3)}:null}
function sample(side){const wrap=$('.ms3-canvas-wrap'),canvas=$('.ms3-canvas'),front=$('.ms3-front'),back=$('.ms3-back');return{side,wrap:rect(wrap),canvas:rect(canvas),front:rect(front),back:rect(back),frontVisible:visible(front),backVisible:visible(back)}}
function drift(a,b,key){if(!a?.[key]||!b?.[key])return Infinity;return Math.max(Math.abs(a[key].width-b[key].width),Math.abs(a[key].height-b[key].height))}
async function run(){
  const sequence=['front','back','front','back','front'],samples=[];let error=null;
  if(!$('.ms3-canvas'))return{ok:false,error:'Studio canvas is not mounted.',sequence,samples};
  try{for(const side of sequence){applySide(side,'acceptance');await waitFrames(2);samples.push(sample(side))}}catch(e){error=String(e?.message||e)}
  const baseline=samples[0];let maxCanvasDrift=0,maxWrapDrift=0;for(const s of samples){maxCanvasDrift=Math.max(maxCanvasDrift,drift(baseline,s,'canvas'));maxWrapDrift=Math.max(maxWrapDrift,drift(baseline,s,'wrap'))}
  const visibilityFailures=samples.filter(s=>s.side==='front'?(!s.frontVisible||s.backVisible):(!s.backVisible||s.frontVisible)).map(s=>s.side);
  const ok=!error&&samples.length===sequence.length&&maxCanvasDrift<=1&&maxWrapDrift<=1&&visibilityFailures.length===0;
  lastReport={ok,error,sequence,samples,maxCanvasDrift:+maxCanvasDrift.toFixed(3),maxWrapDrift:+maxWrapDrift.toFixed(3),visibilityFailures,thresholdPx:1,checkedAt:new Date().toISOString()};
  window.dispatchEvent(new CustomEvent('watchdog:wdd-geometry-acceptance',{detail:lastReport}));
  return lastReport;
}
function init(){document.addEventListener('click',captureClick,true);new MutationObserver(keepStable).observe(document.documentElement,{childList:true,subtree:true});setInterval(keepStable,1000);keepStable();window.WDDGeometryAcceptance={run,setSide:applySide,get side(){return desiredSide},get lastReport(){return lastReport}}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

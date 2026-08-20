#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl=String(process.env.VISUAL_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const supabaseUrl=String(process.env.STAGING_SUPABASE_URL||'').replace(/\/$/,'');
const supabaseKey=String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY||'');
const email=String(process.env.WATCHDOG_TEST_DEVELOPER_EMAIL||'');
const password=String(process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD||'');
const evidenceDir=process.env.VISUAL_EVIDENCE_DIR||'visual-acceptance-evidence';
const productionProjectRef=['uvkva','xljhhng','ydvlrzom'].join('');
if(!supabaseUrl||!supabaseKey||!email||!password)throw new Error('Staging Supabase and Developer test credentials are required.');
if(new RegExp(productionProjectRef,'i').test(supabaseUrl))throw new Error('Refusing WDD geometry acceptance against production Supabase.');
const projectRef=new URL(supabaseUrl).hostname.split('.')[0],storageKey=`sb-${projectRef}-auth-token`;
async function signIn(){const r=await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const b=await r.json().catch(()=>({}));if(!r.ok||!b?.access_token)throw new Error(`Developer staging login failed (${r.status}).`);return b}
await mkdir(evidenceDir,{recursive:true});
const session=await signIn(),browser=await chromium.launch({headless:true});
let evidence;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});const page=await context.newPage(),pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(String(e?.message||e).slice(0,500)));
 await page.addInitScript(({key,authSession})=>localStorage.setItem(key,JSON.stringify(authSession)),{key:storageKey,authSession:session});
 const response=await page.goto(`${baseUrl}/property/marketing-studio/customize/`,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.WDDGeometryAcceptance,{timeout:15000});
 const fixtureUsed=await page.evaluate(()=>{
   if(document.querySelector('.ms3-canvas'))return false;
   const host=document.createElement('section');host.id='wdd-geometry-acceptance-fixture';host.style.cssText='width:1000px;max-width:95vw;margin:24px auto;padding:20px;background:#eef1f5';
   host.innerHTML='<div class="ms3-viewbar"><button type="button" data-ms3-side="front">Front</button><button type="button" data-ms3-side="back">Back</button></div><div class="ms3-canvas-wrap" style="--ms3-ratio:1.4166666667;--ms3-zoom:1"><div class="ms3-canvas show-front"><section class="ms3-face ms3-front"><div>FRONT ACCEPTANCE FACE</div></section><section class="ms3-face ms3-back"><div class="wddc-back"><div class="wddc-marketing">BACK ACCEPTANCE FACE</div><div class="wddc-mail">MAIL AREA</div></div></section></div></div>';
   document.body.classList.add('wdd-composer-v2');document.body.appendChild(host);window.WDDGeometryAcceptance.setSide('front','fixture');return true;
 });
 const sequence=['front','back','front','back','front'],samples=[];
 for(const side of sequence){await page.locator(`[data-ms3-side="${side}"]`).first().click();await page.waitForTimeout(80);samples.push(await page.evaluate(s=>{const c=document.querySelector('.ms3-canvas'),w=document.querySelector('.ms3-canvas-wrap'),f=document.querySelector('.ms3-front'),b=document.querySelector('.ms3-back');const rect=e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height}};const vis=e=>{const cs=getComputedStyle(e),r=e.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};return{side:s,canvas:rect(c),wrap:rect(w),frontVisible:vis(f),backVisible:vis(b)}} ,side));}
 const runtimeReport=await page.evaluate(()=>window.WDDGeometryAcceptance.run());
 const base=samples[0],drift=(a,b,k)=>Math.max(Math.abs(a[k].width-b[k].width),Math.abs(a[k].height-b[k].height));
 const maxCanvasDrift=Math.max(...samples.map(s=>drift(base,s,'canvas'))),maxWrapDrift=Math.max(...samples.map(s=>drift(base,s,'wrap')));
 const visibilityFailures=samples.filter(s=>s.side==='front'?(!s.frontVisible||s.backVisible):(!s.backVisible||s.frontVisible));
 const screenshot='wdd-authenticated-front-back-front.png';await page.screenshot({path:path.join(evidenceDir,screenshot),fullPage:true});
 const passed=(response?.status()??200)<400&&pageErrors.length===0&&maxCanvasDrift<=1&&maxWrapDrift<=1&&visibilityFailures.length===0&&runtimeReport?.ok===true;
 evidence={passed,authenticated:true,environment:'staging-local-hosted-render',staging_project_ref:projectRef,fixture_used:fixtureUsed,sequence,samples,max_canvas_drift_px:maxCanvasDrift,max_wrap_drift_px:maxWrapDrift,visibility_failures:visibilityFailures,runtime_report:runtimeReport,page_errors:pageErrors,screenshot,checked_at:new Date().toISOString()};
 await context.close();
}finally{await browser.close()}
await writeFile(path.join(evidenceDir,'wdd-geometry-acceptance.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
if(!evidence?.passed){console.error('WDD authenticated geometry acceptance failed:',JSON.stringify(evidence));process.exit(1)}
console.log(`WDD authenticated geometry acceptance PASS (${evidence.fixture_used?'canonical fixture':'live Studio canvas'}; max canvas drift ${evidence.max_canvas_drift_px}px).`);

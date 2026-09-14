#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const page=read('lender/index.html');
const agent=read('agent/index.html');
const sharedCss=read('agent/agent.css');
const lenderCss=read('lender/lender.css');
const sharedJs=read('agent/agent.js');
const middleware=read('middleware.js');
const billing=read('property/js/billing-client.js');

function expect(value,message){if(!value)throw new Error(message)}

expect(page.includes('<title>Watchdog for New Jersey Lenders — Founding Lifetime</title>'),'lender landing title missing');
expect(page.includes('<link rel="canonical" href="https://www.watchdogindex.com/lender">'),'canonical Watchdog lender route missing');
expect(page.includes('<link rel="stylesheet" href="/agent/agent.css">'),'lender must attach the polished Agent CSS directly');
expect(page.includes('<link rel="stylesheet" href="/lender/lender.css">'),'lender pricing refinement CSS missing');
expect(page.includes('<script src="/agent/agent.js" defer></script>'),'lender must attach the polished Agent JS directly');
expect(!page.includes('agent-paid-landing.css')&&!page.includes('lender-paid-landing.css'),'old paid-landing CSS must not be attached');
expect(!page.includes('lender-paid-landing.js'),'old lender-specific landing JS must not be attached');
expect(!page.includes('apl-'),'old APL landing markup must not remain');
expect(!page.includes('class="eyebrow"'),'lender page must not add eyebrow text');

for(const className of ['site-header container','hero','hero-background','hero-inner container','hero-copy','product-preview','dashboard','trust-band','why-band','why-inner container','features','founding-band','founding-background','founding-inner container','price-card','bottom-trust container','site-footer container','annual-dialog','tour-dialog','image-dialog']){
  expect(page.includes(`class="${className}"`)||page.includes(`class="${className} `),`Agent layout class missing from lender: ${className}`);
  expect(agent.includes(`class="${className}"`)||agent.includes(`class="${className} `),`reference Agent layout class unexpectedly missing: ${className}`);
}

for(const asset of ['/agent/assets/watchdog-logo.svg','/agent/assets/property-house.webp','/agent/assets/annual-home.webp','/agent/assets/platform-live.png','/agent/assets/watchdog-beagle.webp']){
  expect(page.includes(asset),`shared Agent graphic missing from lender: ${asset}`);
  expect(agent.includes(asset),`reference Agent graphic unexpectedly missing: ${asset}`);
}
expect(sharedCss.includes("url('/agent/assets/hero-coast.webp')"),'shared Agent hero coast graphic missing');
expect(sharedCss.includes("url('/agent/assets/founding-coast.webp')"),'shared Agent founding coast graphic missing');
expect(sharedJs.includes("'/agent/assets/platform-live.png'")&&sharedJs.includes("'/agent/assets/platform-illustrative.png'"),'shared Agent product-tour graphics missing');

expect(page.includes('<h1 id="hero-title">Lend smarter<br><span><em>know</em> the property.</span></h1>'),'lender-specific two-word hero headline missing');
expect(page.includes('Watchdog gives New Jersey mortgage lenders and loan officers'),'lender-specific hero copy missing');
expect(page.includes('Built for the way<br>New Jersey lenders work.'),'lender-specific positioning missing');
expect(page.includes('Lender Founding Lifetime'),'lender Founding Lifetime heading missing');
expect(page.includes('$3,499')&&page.includes('$9,999'),'Pro and Pro+ lifetime prices missing');
expect(page.includes('250-property capacity')&&page.includes('2,500-property capacity'),'Pro and Pro+ capacities missing');
expect((page.match(/data-lender-lifetime-checkout/g)||[]).length===2,'lender page must expose exactly two lifetime checkout choices');
expect(page.includes('data-tier="pro"')&&page.includes('data-tier="pro_plus"'),'both governed lifetime tiers must be present');
expect(page.includes('lender-proplus-card')&&page.includes('<span class="price-ribbon">Recommended</span>'),'Pro+ must be the primary recommended Lifetime card');
expect(page.indexOf('data-tier="pro_plus"')<page.indexOf('data-tier="pro"'),'Pro+ must appear before Pro in the lender offer hierarchy');
expect(page.includes('lender-pro-card'),'secondary Pro Lifetime box missing');
expect(page.includes('10× Pro capacity'),'Pro+ capacity difference callout missing');
expect(lenderCss.includes('background: #fff0a6'),'yellow plan-difference highlight missing');
expect(lenderCss.includes('grid-template-columns: minmax(300px, 1fr) 190px'),'desktop main/secondary pricing hierarchy missing');
expect(page.includes('Usage-based services, direct mail, third-party data and overages'),'lifetime exclusions missing');
expect(page.includes('$1,290')&&page.includes('data-lender-annual-checkout data-tier="pro"'),'Pro annual alternative missing');

expect(page.includes("billing.invoke('create-lifetime-checkout', { tier })"),'lender lifetime checkout must reuse server-owned checkout');
expect(page.includes("billing.checkout(tier, { cadence: 'yearly' })"),'lender annual checkout must reuse shared governed checkout');
expect(page.includes("sessionStorage.setItem('watchdog:lifetime:pending', tier)"),'signed-out lender lifetime selection must survive sign-in');
expect(billing.includes("sessionStorage.getItem('watchdog:lifetime:pending')"),'billing client cannot resume pending Lifetime checkout');
expect(middleware.includes("'/agent', '/lender'"),'Watchdog root static route allowlist must include /lender next to /agent');
expect(sharedCss.includes('@media(max-width:960px)'),'shared Agent mobile breakpoint missing');

console.log('lender exact Agent-parity contract: ok');

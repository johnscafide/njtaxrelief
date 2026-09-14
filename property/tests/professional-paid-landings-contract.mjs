#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const attorney=read('attorney/index.html');
const investor=read('investor/index.html');
const sharedCss=read('agent/agent.css');
const pricingCss=read('lender/lender.css');
const sharedJs=read('agent/agent.js');
const checkout=read('property/js/professional-lifetime-landing.js');
const middleware=read('middleware.js');

function expect(value,message){if(!value)throw new Error(message)}

const pages=[
  {name:'attorney',html:attorney,hero:'Advise smarter',canonical:'https://www.watchdogindex.com/attorney',audience:'New Jersey property tax attorneys',founding:'Tax Attorney Founding Lifetime'},
  {name:'investor',html:investor,hero:'Invest smarter',canonical:'https://www.watchdogindex.com/investor',audience:'New Jersey real estate investors',founding:'Investor Founding Lifetime'}
];

for(const page of pages){
  expect(page.html.includes(`<link rel="canonical" href="${page.canonical}">`),`${page.name} canonical missing`);
  expect(page.html.includes(`<h1 id="hero-title">${page.hero}<br><span><em>know</em> the property.</span></h1>`),`${page.name} hero missing`);
  expect(page.html.includes(page.audience),`${page.name} audience copy missing`);
  expect(page.html.includes(page.founding),`${page.name} Founding heading missing`);
  expect(page.html.includes('<link rel="stylesheet" href="/agent/agent.css">'),`${page.name} must use Agent CSS`);
  expect(page.html.includes('<link rel="stylesheet" href="/lender/lender.css">'),`${page.name} must use lender pricing hierarchy CSS`);
  expect(page.html.includes('<script src="/agent/agent.js" defer></script>'),`${page.name} must use Agent JS`);
  expect(page.html.includes('<script src="/property/js/professional-lifetime-landing.js" defer></script>'),`${page.name} shared checkout runtime missing`);
  expect(page.html.includes('$9,999')&&page.html.includes('$3,499'),`${page.name} Lifetime prices missing`);
  expect(page.html.includes('2,500-property capacity')&&page.html.includes('250-property capacity'),`${page.name} capacities missing`);
  expect(page.html.includes('10× Pro capacity'),`${page.name} Pro+ difference callout missing`);
  expect(page.html.includes('<span class="price-ribbon">Recommended</span>'),`${page.name} Pro+ recommendation missing`);
  expect(page.html.indexOf('data-tier="pro_plus"')<page.html.indexOf('data-tier="pro"'),`${page.name} Pro+ must lead Pro`);
  expect((page.html.match(/data-professional-lifetime-checkout/g)||[]).length===2,`${page.name} must expose two Lifetime choices`);
  expect(page.html.includes('data-professional-annual-checkout data-tier="pro"'),`${page.name} Pro annual alternative missing`);
  expect(!page.html.includes('class="eyebrow"'),`${page.name} must not add eyebrow text`);
}

expect(sharedCss.includes("url('/agent/assets/hero-coast.webp')"),'shared Agent hero imagery missing');
expect(sharedCss.includes("url('/agent/assets/founding-coast.webp')"),'shared Agent Founding imagery missing');
expect(sharedJs.includes("'/agent/assets/platform-live.png'")&&sharedJs.includes("'/agent/assets/platform-illustrative.png'"),'shared Agent tour imagery missing');
expect(pricingCss.includes('background: #fff0a6'),'yellow Pro/Pro+ difference highlight missing');
expect(checkout.includes("billing.invoke('create-lifetime-checkout', { tier })"),'professional Lifetime checkout must remain server-owned');
expect(checkout.includes("billing.checkout(tier, { cadence: 'yearly' })"),'professional annual checkout must use shared billing client');
expect(checkout.includes("sessionStorage.setItem('watchdog:lifetime:pending', tier)"),'signed-out Lifetime selection must survive sign-in');
expect(middleware.includes("'/lender', '/attorney', '/investor'"),'root static-page allowlist must contain lender, attorney and investor');

console.log('professional paid landings contract: ok');

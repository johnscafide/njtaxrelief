#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const attorney=read('attorney/index.html');
const investor=read('investor/index.html');
// 43276962 split the shared Agent stylesheet: agent.css now @imports agent-base.css, which holds the
// hero/founding imagery. Read the stylesheet the way the browser resolves it.
const agentCss=read('agent/agent.css');
const sharedCss=agentCss+'\n'+(agentCss.includes("@import url('/agent/agent-base.css');")?read('agent/agent-base.css'):'');
const pricingCss=read('lender/lender.css');
const sharedJs=read('agent/agent.js');
const checkout=read('property/js/professional-lifetime-landing.js');
const middleware=read('middleware.js');

function expect(value,message){if(!value)throw new Error(message)}

const pages=[
  {name:'attorney',html:attorney,hero:'Advise better',canonical:'https://www.watchdogindex.com/attorney',audience:'New Jersey property tax attorneys',founding:'Tax Attorney Founding Lifetime'},
  {name:'investor',html:investor,hero:'Invest better',canonical:'https://www.watchdogindex.com/investor',audience:'New Jersey real estate investors',founding:'Investor Founding Lifetime'}
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
  expect(page.html.includes('$999')&&!page.html.includes('$3,499'),`${page.name} Professional Lifetime price missing`);
  expect(page.html.includes('2,500-property capacity'),`${page.name} capacity missing`);
  expect(page.html.includes('<span class="price-ribbon">Recommended</span>'),`${page.name} Professional recommendation missing`);
  expect(!page.html.includes('data-tier="pro"'),`${page.name} must not sell the retired Pro plan`);
  expect((page.html.match(/data-professional-lifetime-checkout/g)||[]).length===1,`${page.name} must expose one Lifetime choice`);
  expect(page.html.includes('data-professional-annual-checkout data-tier="pro_plus"')&&page.html.includes('$479'),`${page.name} Professional annual alternative missing`);
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

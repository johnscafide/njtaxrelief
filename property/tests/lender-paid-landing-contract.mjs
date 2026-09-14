#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const page=read('lender/index.html');
const sharedCss=read('property/css/agent-paid-landing.css');
const lenderCss=read('property/css/lender-paid-landing.css');
const js=read('property/js/lender-paid-landing.js');
const billing=read('property/js/billing-client.js');

function expect(value,message){if(!value)throw new Error(message)}

expect(page.includes('<title>Watchdog for New Jersey Mortgage Lenders | Property Intelligence</title>'),'lender landing title missing');
expect(page.includes('<link rel="canonical" href="https://www.watchdogindex.com/lender/">'),'root lender canonical missing');
expect(page.includes('/property/branding/watchdog-logo-horizontal.svg'),'Watchdog logo is not the lender landing brand asset');
expect(page.includes('property="og:image" content="https://www.watchdogindex.com/property/branding/watchdog-logo-horizontal.svg"'),'social share image must use the Watchdog logo');
expect(page.includes('/property/for/real-estate-agents/agent-control-capture.svg'),'approved Agent product graphic is not reused');
expect(page.includes('/property/for/real-estate-agents/agent-home-illustration.svg'),'approved Agent exit graphic is not reused');
expect(sharedCss.includes("/property/for/real-estate-agents/nj-shore-scene.svg"),'approved NJ shore hero scene is not reused');
expect(sharedCss.includes("/property/for/real-estate-agents/atlantic-city-scene.svg"),'approved Atlantic City founding scene is not reused');
expect(page.includes('Pro or Pro+ Founding Lifetime'),'lender founding offer heading missing');
expect(page.includes('$3,499')&&page.includes('$9,999'),'Pro and Pro+ lifetime prices missing');
expect((page.match(/data-lender-lifetime-checkout/g)||[]).length===2,'lender landing must expose exactly two lifetime checkout options');
expect(page.includes('data-tier="pro"')&&page.includes('data-tier="pro_plus"'),'both governed lifetime tiers must be present');
expect(page.includes('250-property capacity')&&page.includes('2,500-property capacity'),'governed Pro/Pro+ capacities missing');
expect(page.includes('Usage-based services, direct mail, third-party data and overages'),'lifetime exclusions missing');
expect(page.includes('id="apl-exit"')&&page.includes('$1,290')&&page.includes('data-lender-annual-checkout'),'annual Pro exit offer missing');
expect(js.includes("if(path!=='/lender')return"),'lender JS is not scoped to the root /lender route');
expect(js.includes("pro:349900")&&js.includes("pro_plus:999900"),'lender JS governed lifetime amounts changed unexpectedly');
expect(js.includes("billing.invoke('create-lifetime-checkout',{tier:tier})"),'lender lifetime checkout is not server-owned');
expect(js.includes("billing.checkout('pro',{cadence:'yearly'})"),'annual exit offer is not wired to governed yearly Pro checkout');
expect(js.includes("sessionStorage.setItem('watchdog:lifetime:pending',tier)"),'signed-out lender lifetime intent is not preserved');
expect(js.includes('watchdog:lender-paid-attribution'),'lender paid acquisition attribution is not preserved');
expect(js.includes('lender_annual_exit_offer_view'),'lender exit offer analytics missing');
expect(js.includes("document.addEventListener('mouseout',onExitIntent)"),'desktop lender exit intent trigger missing');
expect(sharedCss.includes('@media(max-width:720px)'),'shared mobile landing breakpoint missing');
expect(lenderCss.includes('@media(max-width:720px)'),'dual-offer lender mobile breakpoint missing');
expect(billing.includes("sessionStorage.getItem('watchdog:lifetime:pending')"),'billing client cannot resume pending Lifetime checkout');
expect(billing.includes("invoke('create-lifetime-checkout',{tier:tier})"),'billing client Lifetime resume is not server-authoritative');

console.log('lender paid landing contract: ok');

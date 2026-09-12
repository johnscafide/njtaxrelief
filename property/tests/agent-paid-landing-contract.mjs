#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const page=read('property/for/real-estate-agents/index.html');
const css=read('property/css/agent-paid-landing.css');
const js=read('property/js/agent-paid-landing.js');
const billing=read('property/js/billing-client.js');

function expect(value,message){if(!value)throw new Error(message)}

expect(page.includes('<title>Watchdog for New Jersey Real Estate Agents | Property Intelligence</title>'),'agent landing title missing');
expect(page.includes('/property/branding/watchdog-logo-horizontal.svg'),'Watchdog logo is not the landing-page brand asset');
expect(page.includes('property="og:image" content="https://www.watchdogindex.com/property/branding/watchdog-logo-horizontal.svg"'),'social share image must use the Watchdog logo');
expect(page.includes('/property/for/real-estate-agents/agent-control-capture.webp'),'Agent Control product capture missing');
expect(page.includes('Representative Agent Control view'),'product capture disclosure missing');
expect(page.includes('Agent Founding Lifetime')&&page.includes('$1,499'),'Founding Lifetime offer missing');
expect((page.match(/data-agent-lifetime-checkout/g)||[]).length===1,'Founding Lifetime should have one primary checkout CTA');
expect(page.includes('25-property Agent capacity'),'Agent capacity disclosure missing');
expect(page.includes('Usage-based services, direct mail, third-party data and overages'),'lifetime exclusions missing');
expect(page.includes('id="apl-exit"')&&page.includes('$590')&&page.includes('data-agent-annual-checkout'),'annual exit offer missing');
expect(!page.includes('Prefer monthly or annual billing?'),'recurring pricing leaked into main page');
expect(!page.includes('apl-faq'),'formulaic FAQ block returned');
expect(!page.includes('testimonial'),'unverified testimonial block returned');
expect(js.includes("billing.invoke('create-lifetime-checkout',{tier:'agent'})"),'lifetime checkout is not server-owned');
expect(js.includes("billing.checkout('agent',{cadence:'yearly'})"),'annual exit offer is not wired to governed yearly Agent checkout');
expect(js.includes("sessionStorage.setItem('watchdog:lifetime:pending','agent')"),'signed-out lifetime intent is not preserved');
expect(js.includes('watchdog:agent-paid-attribution'),'paid acquisition attribution is not preserved');
expect(js.includes('agent_annual_exit_offer_view'),'exit offer analytics missing');
expect(js.includes("document.addEventListener('mouseout',onExitIntent)"),'desktop exit intent trigger missing');
expect(css.includes('@media(max-width:720px)'),'mobile landing breakpoint missing');
expect(billing.includes("sessionStorage.getItem('watchdog:lifetime:pending')"),'billing client cannot resume pending Lifetime checkout');
expect(billing.includes("invoke('create-lifetime-checkout',{tier:tier})"),'billing client Lifetime resume is not server-authoritative');

console.log('agent paid landing final contract: ok');

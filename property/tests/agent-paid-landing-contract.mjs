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
expect(page.includes('Agent Founding Lifetime')&&page.includes('$1,499'),'Founding Lifetime must be the primary Agent offer');
expect((page.match(/data-agent-lifetime-checkout/g)||[]).length>=3,'lifetime checkout CTA should repeat through the conversion page');
expect(page.includes('Agent Opportunity Desk'),'Opportunity Desk capability missing');
expect(page.includes('Saved property monitoring'),'saved monitoring capability missing');
expect(page.includes('Usage-based services, direct mail, third-party data and overages'),'lifetime exclusions missing');
expect(js.includes("billing.invoke('create-lifetime-checkout',{tier:'agent'})"),'agent landing does not use the server-owned lifetime checkout');
expect(js.includes("sessionStorage.setItem('watchdog:lifetime:pending','agent')"),'signed-out lifetime intent is not preserved');
expect(js.includes('watchdog:agent-paid-attribution'),'paid acquisition attribution is not preserved');
expect(css.includes('@media(max-width:680px)'),'mobile conversion breakpoint missing');
expect(billing.includes("sessionStorage.getItem('watchdog:lifetime:pending')"),'billing client cannot resume a pending lifetime checkout');
expect(billing.includes("invoke('create-lifetime-checkout',{tier:tier})"),'billing client lifetime resume is not server-authoritative');

console.log('agent paid landing contract: ok');

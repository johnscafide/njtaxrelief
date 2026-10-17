import fs from 'node:fs';

const html = fs.readFileSync('email-templates/anchor-watchdog-autoreply.html','utf8');
const estimator = fs.readFileSync('anchor-estimator.html','utf8');

function must(value,message){ if(!value) throw new Error(message); }

must(html.includes('NJ Property Tax Relief'),'Auto-reply must retain NJ Property Tax Relief co-branding.');
must(html.includes('Watchdog'),'Auto-reply must lead with Watchdog property intelligence.');
must(html.includes('{{name}}'),'Auto-reply must personalize the greeting.');
must(html.includes('{{address}}'),'Auto-reply must personalize around the submitted address.');
must(html.includes('https://www.watchdogindex.com/?address={{address}}'),'Auto-reply must deep-link the submitted address into canonical Watchdog.');
must(html.includes('A numeric Watchdog Score is shown only when the underlying canonical evidence supports one.'),'Auto-reply must not imply every property has a governed score.');
must(html.includes('propertytaxrelief.nj.gov'),'Auto-reply must send users to the official NJ source for current forms and deadlines.');
must(!/deadline\s+(?:is|of)\s+[A-Z][a-z]+\s+\d{1,2}/i.test(html),'Auto-reply must not hard-code a benefit-program deadline that can go stale.');
must(html.includes('not an appraisal, legal conclusion, tax-appeal determination, or financial recommendation'),'Watchdog score limitations must remain explicit.');
must(html.includes('For renters, the property record describes the residence entered and does not imply ownership.'),'Renter residence language must not imply ownership.');

must(estimator.includes("address: L.address || 'Not provided'"),'Estimator must continue supplying the address variable to EmailJS.');
must(estimator.includes("name: L.name, email: L.email"),'Estimator must continue supplying the recipient name/email variables to EmailJS.');

console.log('ANCHOR Watchdog auto-reply contract passed.');

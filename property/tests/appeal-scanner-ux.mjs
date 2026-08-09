import fs from 'node:fs';

const js = fs.readFileSync(new URL('../js/scan.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/scan.css', import.meta.url), 'utf8');

const checks = [
  ['saved properties are loaded before the scanner is shown', js.includes("from('saved_properties').select('pams_pin')")],
  ['saved PINs render as Added', js.includes("added ? 'Added'")],
  ['duplicate clicks are blocked in memory', js.includes('savedPins[pin] || savingPins[pin]')],
  ['buttons are disabled while adding or after success', js.includes('button.disabled = added || saving')],
  ['score explanation is portaled to document.body', js.includes('document.body.appendChild(tip)')],
  ['floating explanation is viewport-positioned', js.includes('getBoundingClientRect()') && css.includes('position:fixed')],
  ['floating explanation clears the table stacking context', css.includes('z-index:10050')]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`\n${checks.length} scanner UX contracts passed.`);

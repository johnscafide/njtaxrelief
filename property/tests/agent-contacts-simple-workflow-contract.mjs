import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8');
const loader=read('agent/contacts/crm-companion-install.js');
const ui=read('agent/contacts/simple-workflow.js');
const css=read('agent/contacts/simple-workflow.css');
const intelligence=read('agent/contacts/contact-intelligence.js');

assert.match(loader,/simple-workflow\.js\?v=/,'Agent Contacts must load the simplified workflow layer');
assert.match(ui,/Analyze file/,'Analyze must be the primary short CTA');
assert.match(ui,/Upload<\/span>.*Analyze<\/span>.*Review<\/span>/s,'Simple Upload → Analyze → Review progression must be present');
assert.match(ui,/Check your columns\./,'Mapping copy must be simplified');
assert.match(ui,/Review contacts\./,'Review copy must be simplified');
assert.match(ui,/Choose export\./,'Export copy must be simplified');
assert.match(intelligence,/Property Match/,'Existing Watchdog intelligence concepts must remain intact');
assert.match(css,/\.aci-simple-ready \.aci-tabs\{display:none!important\}/,'Intelligence tabs must stay hidden before analysis');
assert.match(css,/#aci-analyze\{min-width:270px;min-height:64px/,'Analyze CTA must be visually dominant');
assert.match(css,/\.acx-name-flow[\s\S]*display:none!important/,'Name-cleanup diagram must be condensed');
assert.match(css,/@media\(max-width:700px\)/,'Simplified workflow must include mobile behavior');

for(const file of ['agent/contacts/crm-companion-install.js','agent/contacts/simple-workflow.js']){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(r.status,0,`${file} must parse: ${r.stderr}`);
}
console.log('Agent Contacts simplified workflow contract checks passed.');

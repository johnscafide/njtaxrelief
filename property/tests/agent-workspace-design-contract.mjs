import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const css=read('agent/shared/agent-workspace.css');
const js=read('agent/shared/agent-workspace.js');
const template=read('agent/shared/page-template.html');
const guide=read('property/branding/LLM-BRAND-GUIDE.md');

new vm.Script(js,{filename:'agent/shared/agent-workspace.js'});

for(const token of ['.awx-utility{','.awx-header{','.awx-header-actions{','.awx-tabs{','.awx-action-primary{']){
  assert.match(css,new RegExp(token.replace(/[.*+?^$()|[\]\\]/g,'\\$&')),'shared Agent Workspace CSS missing '+token);
}
assert.match(css,/--awx-button:#29353d/,'Agent Workspace primary action must use the restrained charcoal hierarchy');
assert.match(css,/--awx-accent:#1967d2/,'Agent Workspace must preserve a focused blue selection/link accent');
assert.match(css,/@media\(max-width:760px\)/,'Agent Workspace must define mobile reflow');
assert.match(css,/prefers-reduced-motion/,'Agent Workspace must preserve reduced-motion support');
assert.doesNotMatch(css,/gradient|glass|glow|backdrop-filter/i,'Agent Workspace shell must remain flat and restrained');

for(const href of ['/agent/contacts','/transaction/']){
  assert.ok(template.includes('href="'+href+'"'),'Agent page template missing live destination '+href);
}
for(const label of ['Agent Desk','Marketing','Integrations']){
  assert.ok(template.includes(label),'Agent page template missing staged '+label+' destination');
}
assert.match(template,/data-agent-soon="Coming soon for Agents"/,'future Agent destinations must stay intentionally staged');
assert.match(template,/awx-action awx-action-primary/,'template must show canonical primary action styling');
assert.match(js,/data-agent-workspace-final/,'Agent runtime must preserve final page polish after injected feature CSS');
assert.match(js,/Coming soon for Agents/,'Agent runtime must support staged destination feedback');

assert.match(guide,/### Agent Workspace rule/,'Brand guide must contain the Agent Workspace rule');
assert.match(guide,/\/agent\/shared\/agent-workspace\.css/,'Brand guide must name the canonical Agent Workspace CSS');
assert.match(guide,/\/agent\/contacts\//,'Brand guide must name Agent Contacts as the reference implementation');
assert.match(guide,/Agent Desk, Marketing, and Integrations remain visible but staged/,'Brand guide must preserve staged Agent roadmap destinations');

console.log('Agent Workspace design contract passed.');

import fs from 'node:fs';
import vm from 'node:vm';

const files={
  fn:'supabase/functions/intelligence-calibration-diversity/index.ts',
  config:'supabase/config.toml',
  page:'property/intelligence/calibration-review/index.html',
  panel:'property/js/intelligence-calibration-diversity-panel.js',
  css:'property/css/intelligence-calibration-diversity-panel.css'
};
for(const path of Object.values(files))if(!fs.existsSync(path))throw new Error(`${path} must exist`);
const fn=fs.readFileSync(files.fn,'utf8');
const config=fs.readFileSync(files.config,'utf8');
const page=fs.readFileSync(files.page,'utf8');
const panel=fs.readFileSync(files.panel,'utf8');
const css=fs.readFileSync(files.css,'utf8');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};
new vm.Script(panel,{filename:files.panel});

expect(fn.includes('account_role')&&fn.includes('developer'),'Diversity endpoint must require developer role.');
expect(fn.includes('privacy:"aggregate_calibration_structure_only_no_property_identifiers"'),'Diversity response must declare aggregate/no-property-ID boundary.');
expect(fn.includes('score_collapse'),'Diagnostic must detect score collapse.');
expect(fn.includes('prediction_collapse'),'Diagnostic must detect prediction collapse.');
expect(fn.includes('feature_vector_collapse'),'Diagnostic must detect feature-vector collapse.');
expect(fn.includes('all_observed_signals_collapsed'),'Diagnostic must detect complete signal collapse.');
expect(fn.includes('positive_class_insufficient')&&fn.includes('negative_class_insufficient'),'Diagnostic must detect weak class coverage.');
expect(fn.includes('representative_ready:warnings.length===0'),'Representative readiness must fail closed on warnings.');
expect(!fn.includes('property_address'),'Aggregate diversity endpoint must not return property addresses.');
expect(!fn.includes('pams_pin'),'Aggregate diversity endpoint must not return PAMS PINs.');
expect(/\[functions\.intelligence-calibration-diversity\][\s\S]*?verify_jwt = true/.test(config),'Diversity endpoint must require JWT at the gateway.');

expect(page.includes('data-developer-only="true"'),'Calibration review must remain developer-only.');
expect(page.includes('/property/css/intelligence-calibration-diversity-panel.css'),'Calibration review must load diversity styling.');
expect(page.includes('/property/js/intelligence-calibration-diversity-panel.js'),'Calibration review must load diversity diagnostic UI.');
expect(panel.includes("functions.invoke('intelligence-calibration-diversity'"),'Panel must read the governed diversity diagnostic.');
expect(panel.includes('Do not use this set as promotion proof.'),'Panel must visibly block collapsed holdouts from promotion proof.');
expect(panel.includes('Structural diversity passed. Precision, recall, false-positive rate and fresh independent-label requirements still apply.'),'Diversity success must not imply model-quality success.');
expect(panel.includes('Holdout diversity unavailable.')&&panel.includes('Do not assume the set is representative.'),'Diagnostic failure must fail honest.');
expect(css.includes('.cr-diversity.blocked'),'Blocked holdout state must be visually distinct.');

for(const [name,content] of Object.entries({fn,config,page,panel,css}))expect(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Calibration diversity contract passed: developer-only aggregate diagnostic, structural-collapse checks, visible promotion block, honest failure, no property IDs, no ?v=.');

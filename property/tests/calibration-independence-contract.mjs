import fs from 'node:fs';

const page=fs.readFileSync('property/intelligence/calibration/index.html','utf8');
const runtime=fs.readFileSync('property/js/intelligence-calibration-independence.js','utf8');

const must=(cond,msg)=>{if(!cond){console.error(`FAIL: ${msg}`);process.exitCode=1;}};

must(page.includes('/property/js/intelligence-calibration.js'),'Calibration control must load its primary runtime.');
must(page.includes('/property/js/intelligence-calibration-independence.js'),'Calibration control must load the independence guard.');
must(page.indexOf('/property/js/intelligence-calibration-independence.js')>page.indexOf('/property/js/intelligence-calibration.js'),'Independence guard must load after the primary calibration renderer.');
must(runtime.includes("actions.querySelector('button.active')"),'Guard must use the saved human-label state, not model output, to decide when reveal is allowed.');
must(runtime.includes("output.dataset.independenceState='masked'"),'Unreviewed model output must be masked.');
must(runtime.includes('Score, confidence, and predicted class stay concealed'),'Guard must explain which answer-key fields are hidden.');
must(runtime.includes('MutationObserver'),'Guard must protect dynamically rendered cases, not only first paint.');
must(!page.includes('?v='),'Calibration page must not introduce version-query asset URLs.');
must(!runtime.includes('?v='),'Calibration independence runtime must not introduce version-query asset URLs.');

if(!process.exitCode)console.log('Calibration independence contract passed.');

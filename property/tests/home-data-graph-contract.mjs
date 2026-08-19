import fs from 'node:fs';
import vm from 'node:vm';

const files={
  graph:'property/js/dashboard/home/watchdog-data-graph.js',
  css:'property/css/home/watchdog-data-graph.css',
  menu:'property/js/dashboard/home/home-menu-sync.js',
  semantic:'property/js/watchdog-semantic-context.js'
};
const read=k=>fs.readFileSync(files[k],'utf8');
const graph=read('graph'),css=read('css'),menu=read('menu'),semantic=read('semantic');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};
new vm.Script(graph,{filename:files.graph});
new vm.Script(semantic,{filename:files.semantic});

expect(menu.includes('/property/js/dashboard/home/watchdog-data-graph.js'),'Property Home must load the visible Data Graph.');
expect(menu.indexOf('/property/js/watchdog-semantic-context.js')<menu.indexOf('/property/js/dashboard/home/watchdog-data-graph.js'),'Semantic Context must load before the Data Graph.');
expect(graph.includes("window.WatchdogSemanticContext.get"),'Data Graph must use governed Semantic Context rather than browser-invented property counts.');
for(const pack of ['identity','assessment_tax','sale_market','appeal_uniformity','permits_closing','environment_risk','municipal_pressure'])expect(graph.includes(`'${pack}'`),`Data Graph is missing governed semantic pack ${pack}.`);
expect(graph.includes("m&&m.state==='available'"),'Only available markers may be counted as resolved property data.');
expect(graph.includes('registry_total_markers'),'Data Graph must distinguish the governed registry universe.');
expect(graph.includes('selected_marker_count'),'Data Graph must disclose the property-view selection count.');
expect(graph.includes('available_count'),'Data Graph must disclose actual available marker count.');
expect(graph.includes('Registry size is not represented as property-level evidence'),'Registry breadth must never be misrepresented as property-level evidence.');
expect(graph.includes('It never treats a planned, missing or unentitled marker as available data'),'Unavailable/unentitled definitions must remain explicit.');
expect(graph.includes("truth_class||''"),'Data Graph must preserve truth-class separation.');
expect(graph.includes('sourceFacts=truth.source_fact+truth.source_reference'),'Source facts/references must stay distinct from derived signals.');
expect(graph.includes("from('intelligence_findings')"),'Intelligence finding counts must come from persisted user-visible findings.');
expect(graph.includes("from('intelligence_runs')"),'Model counts must follow persisted run lineage rather than inferred labels.');
expect(graph.includes('recommended_actions'),'Action-layer counts must come from governed finding actions.');
expect(graph.includes("new IntersectionObserver"),'The broad graph request must lazy-load near viewport to protect Property Home performance.');
expect(graph.includes("analyst.insertAdjacentElement('afterend',host)"),'Data Graph must live directly after Watchdog Analyst Intel in the property story.');
expect(css.includes('#wd-property-data-graph{grid-column:1/-1!important'),'Data Graph must own the full Home content width.');
expect(css.includes('.wdg-path'),'Data Graph needs a visible source-to-action path.');
expect(css.includes('.wdg-details'),'Data Graph needs an inspectable lineage detail area.');
for(const [key,content] of Object.entries({graph,css,menu,semantic}))expect(!content.includes('?v='),`${files[key]} must not introduce ?v= asset version parameters.`);
console.log('Property Data Graph lineage, truthful counting, lazy-load, placement, and asset contracts passed.');

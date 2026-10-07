// Production bootstrap v046 for Watchdog provider release canaries.
// Adds data_center_batch_oct7_v1 and hands every other scenario to the v045 graph pinned at commit
// 3963238f (catalog_njdep_layers_v2, then the v044 graph it pins). Relative imports inside that graph
// resolve against their own commits.
import { DATA_CENTER_BATCH_OCT7_SCENARIO, handleDataCenterBatchOct7Canary } from './data-center-batch-oct7-canary.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}if(scenario===DATA_CENTER_BATCH_OCT7_SCENARIO)return handleDataCenterBatchOct7Canary(req);return handler(req,info);};if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/3963238fb8250bba346e938654d172c298969f64/supabase/functions/provider-release-canary/production-v045-bootstrap.ts');

// Production bootstrap v044 for Watchdog provider release canaries.
// Adds catalog_njdep_layers_v1 and hands every other scenario to the deployed
// v043 graph, pinned at an immutable GitHub commit. Relative imports inside
// that module (njw294-deterministic-batch-canary.ts) resolve against the same commit.
import { CATALOG_NJDEP_SCENARIO, handleCatalogNjdepLayersCanary } from './catalog-njdep-layers-canary.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}if(scenario===CATALOG_NJDEP_SCENARIO)return handleCatalogNjdepLayersCanary(req);return handler(req,info);};if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/b7679f2578fa79e78191322fd09682153cda529a/supabase/functions/provider-release-canary/production-v043-bootstrap.ts');

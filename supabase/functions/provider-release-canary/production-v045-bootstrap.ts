// Production bootstrap v045 for Watchdog provider release canaries.
// Adds catalog_njdep_layers_v2 and hands every other scenario to the deployed v044 graph
// (live v58 entry production-v044-pinned.ts), pinned at commit 79d59cb1. Relative imports inside
// that graph (catalog-njdep-layers-canary.ts, then the pinned v043 and v042 graphs) resolve
// against their own commits.
import { CATALOG_NJDEP_V2_SCENARIO, handleCatalogNjdepLayersV2Canary } from './catalog-njdep-layers-v2-canary.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}if(scenario===CATALOG_NJDEP_V2_SCENARIO)return handleCatalogNjdepLayersV2Canary(req);return handler(req,info);};if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/79d59cb1df3407112d63ef3bbec4628579fd16dc/supabase/functions/provider-release-canary/production-v044-bootstrap.ts');

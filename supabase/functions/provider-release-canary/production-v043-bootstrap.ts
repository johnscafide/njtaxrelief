import { handleNjw294DeterministicBatchCanary } from './njw294-deterministic-batch-canary.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}if(scenario==='njw294_deterministic_v1')return handleNjw294DeterministicBatchCanary(req);return handler(req,info);};if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('./production-v042-bootstrap.ts');

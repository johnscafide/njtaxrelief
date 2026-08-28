import { runWithUniformityPercentile } from './uniformity-percentile-provider.ts';
const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{if(typeof first==='function'){const handler=first as Deno.ServeHandler;return nativeServe((request,info)=>runWithUniformityPercentile(handler,request,info));}if(typeof second==='function'){const handler=second as Deno.ServeHandler;return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithUniformityPercentile(handler,request,info));}return nativeServe(first as Deno.ServeOptions);}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/30c8cb8d1d029c4534adbc734ec787eb39e447a0/supabase/functions/workbench-hydrate/production-ufb-v040-longitudinal-bootstrap.ts');

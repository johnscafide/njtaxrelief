import { handleUfbV040Canary } from './ufb-v040-canary.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{
    let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}
    if(scenario==='ufb_longitudinal_v040')return handleUfbV040Canary(req);
    return handler(req,info);
  };
  if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/5193dead5ad606093d7c8d8016a00dbde2efdcdd/supabase/functions/provider-release-canary/production-v039-bootstrap.ts');

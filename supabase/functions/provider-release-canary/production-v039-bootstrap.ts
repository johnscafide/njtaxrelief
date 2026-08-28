import { handleUfbV039Canary } from 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/ceaa4cf4386002889b939b60173679b8d8b8c206/supabase/functions/provider-release-canary/ufb-v039-canary.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{
    let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}
    if(scenario==='ufb_v039')return handleUfbV039Canary(req);
    return handler(req,info);
  };
  if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/ceaa4cf4386002889b939b60173679b8d8b8c206/supabase/functions/provider-release-canary/production-v038-bootstrap.ts');

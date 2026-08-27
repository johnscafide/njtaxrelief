import { handleAffordableHousingV037Canary } from 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/7ace84ab1829a27aade7ad911cc7fd4f86368220/supabase/functions/provider-release-canary/affordable-housing-v037-canary.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{
    let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}
    if(scenario==='affordable_housing_v037')return handleAffordableHousingV037Canary(req);
    return handler(req,info);
  };
  if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/7ace84ab1829a27aade7ad911cc7fd4f86368220/supabase/functions/provider-release-canary/production-v036-bootstrap.ts');

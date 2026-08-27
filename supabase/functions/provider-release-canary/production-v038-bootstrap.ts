import { handleDevelopmentTrendsV038Canary } from 'https://raw.githubusercontent.com/johnscafide/njtaxrelief/c325489e3e8c4a26d9c506c86a93e682ec0d1f48/supabase/functions/provider-release-canary/development-trends-v038-canary.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{
    let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}
    if(scenario==='development_trends_v038')return handleDevelopmentTrendsV038Canary(req);
    return handler(req,info);
  };
  if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/c325489e3e8c4a26d9c506c86a93e682ec0d1f48/supabase/functions/provider-release-canary/production-v037-bootstrap.ts');

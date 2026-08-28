import { handleInvestorScreenAliasCanary } from './investor-screen-alias-canary.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(req,info)=>{
    let scenario='';try{scenario=String((await req.clone().json())?.scenario||'')}catch{}
    if(scenario==='investor_screen_alias_v1')return handleInvestorScreenAliasCanary(req);
    return handler(req,info);
  };
  if(typeof first==='function')return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/dbc85a16aeba513a117b01e4257d277cc4e392b5/supabase/functions/provider-release-canary/production-v040-bootstrap.ts');

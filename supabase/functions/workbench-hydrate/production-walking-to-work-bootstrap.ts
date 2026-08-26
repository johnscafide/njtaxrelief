import { enrichWalkingToWork } from './walking-to-work-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
function withWalkingToWork(handler:Deno.ServeHandler):Deno.ServeHandler{
  return async(request,info)=>{
    const mobilityRequest=request.clone();
    const response=await handler(request,info);
    return enrichWalkingToWork(mobilityRequest,response);
  };
}
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function')return nativeServe(withWalkingToWork(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,withWalkingToWork(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

// Compose the exact reviewed Fourth Round production wrapper beneath this new
// mobility enrichment. Its relative Fourth Round provider import resolves to the
// same git-pinned commit, preserving the v62 graph and certified core resolver.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/e1bf9b3dc62884a18190adac54cdc200a7a61e42/supabase/functions/workbench-hydrate/production-fourth-round-bootstrap.ts');

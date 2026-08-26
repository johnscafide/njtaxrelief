import { enrichFourthRoundAffordable } from './fourth-round-affordable-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
function withFourthRound(handler:Deno.ServeHandler):Deno.ServeHandler{
  return async(request,info)=>{
    const sourceRequest=request.clone();
    const response=await handler(request,info);
    return enrichFourthRoundAffordable(sourceRequest,response);
  };
}
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function')return nativeServe(withFourthRound(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,withFourthRound(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

// Preserve the exact current production v60 composition and add only the
// validated DCA Fourth Round enrichment above it.
await import('./production-pilot-agreement-db-bootstrap.ts');

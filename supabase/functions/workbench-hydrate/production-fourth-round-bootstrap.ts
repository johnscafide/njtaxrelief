import { enrichFourthRoundAffordable } from './fourth-round-affordable-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
function withFourthRound(handler:Deno.ServeHandler):Deno.ServeHandler{
  return async(request,info)=>{
    const fourthRoundRequest=request.clone();
    const response=await handler(request,info);
    return enrichFourthRoundAffordable(fourthRoundRequest,response);
  };
}
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function')return nativeServe(withFourthRound(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,withFourthRound(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

// Add the validated DCA Fourth Round municipal calculation family outside the
// exact current production bootstrap. This preserves all certified production
// providers and entitlement checks, and remains independently reversible.
await import('./production-bootstrap.ts');

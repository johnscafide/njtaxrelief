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
// exact pre-change production bootstrap. The remote import is git-pinned so all
// existing City, permit lifecycle, New Home Warranty, CORS, entitlement and
// certified resolver behavior is byte-for-byte the reviewed production graph.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/9146245565b792901fca4216133706c8a17b8801/supabase/functions/workbench-hydrate/production-bootstrap.ts');

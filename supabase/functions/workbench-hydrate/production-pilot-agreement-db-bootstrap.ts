import { enrichPilotAgreementDb } from './pilot-agreement-db-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
function withPilotAgreement(handler:Deno.ServeHandler):Deno.ServeHandler{
  return async(request,info)=>{
    const agreementRequest=request.clone();
    const response=await handler(request,info);
    return enrichPilotAgreementDb(agreementRequest,response);
  };
}
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function')return nativeServe(withPilotAgreement(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,withPilotAgreement(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

// Preserve the exact current production history + observed-PILOT composition,
// then add only the governed row-level PILOT agreement enrichment above it.
await import('./production-history-bootstrap.ts');

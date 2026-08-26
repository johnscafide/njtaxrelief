import { enrichPilotAgreement } from './pilot-agreement-provider.ts';
import { enrichAffordableDashboard } from './affordable-dashboard-provider.ts';

const nativeServe=Deno.serve.bind(Deno);

function withSourceExpansion(handler:Deno.ServeHandler):Deno.ServeHandler{
  return async (request,info)=>{
    const pilotRequest=request.clone();
    const affordableRequest=request.clone();
    let response=await handler(request,info);
    response=await enrichPilotAgreement(pilotRequest,response);
    response=await enrichAffordableDashboard(affordableRequest,response);
    return response;
  };
}

const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function')return nativeServe(withSourceExpansion(first as Deno.ServeHandler));
  if(typeof second==='function')return nativeServe(first as Deno.ServeOptions,withSourceExpansion(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

// Preserve current production Workbench v59 history + existing providers, then add
// only the two new fail-closed source-family enrichers above.
await import('./production-history-bootstrap.ts');

// NJW-294: restore the previously certified observed NJ DCA PILOT provider
// around the current NJW-291 Hydrate chain without changing later provider semantics.
import { enrichPilotObserved } from './pilot-observed-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(request,info)=>{
    const pilotRequest=request.clone();
    const response=await handler(request,info);
    return enrichPilotObserved(pilotRequest,response);
  };
  if(typeof first==='function') return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function') return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/a685dc8cb2102ebb6a23a28084b66331ea18227d/supabase/functions/workbench-hydrate/production-njw291-uniformity-bootstrap.ts');

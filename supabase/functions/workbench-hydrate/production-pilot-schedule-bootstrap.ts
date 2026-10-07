// Workbench Hydrate production entry: the live v92 graph plus the DCA PILOT schedule provider.
// The schedule provider fills the four PILOT forecast markers and PILOT forecast confidence from
// property/data/pilot-schedule.json (built by property/scripts/build_pilot_schedule.py).
// Deploy with production-njdep-attribute-map-pinned.deno.json as the import map, the same one live
// v92 uses, so the rest of the chain resolves exactly as it does today.
import { enrichPilotSchedule } from './pilot-schedule-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(request,info)=>{
    const scheduleRequest=request.clone();
    const response=await handler(request,info);
    return enrichPilotSchedule(scheduleRequest,response);
  };
  if(typeof first==='function') return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function') return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/4560fb8099c3902b0ea2aba8066effeb555a183f/supabase/functions/workbench-hydrate/production-njdep-attribute-map-bootstrap.ts');

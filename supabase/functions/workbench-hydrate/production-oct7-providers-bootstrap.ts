// Workbench Hydrate production entry: the live v92 graph plus three municipal providers.
//   pilot-schedule-provider.ts            DCA PILOT forecast markers (property/data/pilot-schedule.json)
//   federal-housing-context-provider.ts   HUD subsidized units, HUD CHAS low-income cost burden, ACS commute mix
//                                         (property/data/federal-housing-context-v041.json; written in #303, never deployed)
//   acs-rental-provider.ts                ACS 2024 renter households, rental vacancy, rent burden (internal inputs
//                                         for the rental scores; property/data/acs-rental-2024.json)
// Deploy with production-njdep-attribute-map-pinned.deno.json as the import map, the same one live
// v92 uses, so the rest of the chain resolves exactly as it does today.
import { enrichPilotSchedule } from './pilot-schedule-provider.ts';
import { enrichFederalHousingContext } from './federal-housing-context-provider.ts';
import { enrichAcsRental } from './acs-rental-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  const wrap=(handler:Deno.ServeHandler):Deno.ServeHandler=>async(request,info)=>{
    const a=request.clone(),b=request.clone(),c=request.clone();
    const response=await handler(request,info);
    return enrichAcsRental(c,await enrichFederalHousingContext(b,await enrichPilotSchedule(a,response)));
  };
  if(typeof first==='function') return nativeServe(wrap(first as Deno.ServeHandler));
  if(typeof second==='function') return nativeServe(first as Deno.ServeOptions,wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/4560fb8099c3902b0ea2aba8066effeb555a183f/supabase/functions/workbench-hydrate/production-njdep-attribute-map-bootstrap.ts');

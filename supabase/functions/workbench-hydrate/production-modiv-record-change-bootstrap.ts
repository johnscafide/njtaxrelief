// NJW-143 bounded production wrapper for the exact MOD-IV record-change marker.
// It augments only requests for parcel_record_change_count, delegates the full
// existing certified production Workbench graph unchanged, then removes any
// hidden history dependencies not explicitly requested by the caller.
import { runWithModivRecordChange } from './modiv-record-change-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function'){
    const handler=first as Deno.ServeHandler;
    return nativeServe((request,info)=>runWithModivRecordChange(handler,request,info));
  }
  if(typeof second==='function'){
    const handler=second as Deno.ServeHandler;
    return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithModivRecordChange(handler,request,info));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/583048f2c5dae333de1f3867971e027921d585bd/supabase/functions/workbench-hydrate/production-walking-to-work-bootstrap.ts');

// NJW-143 production wrapper for exact DCA Affordable Housing Municipal Status Report v0.37 markers.
// The wrapper preserves the existing certified Workbench graph, respects not_entitled results,
// and only fills the bounded v0.37 municipality markers from the pinned governed source artifact.
import { runWithAffordableHousingV037 } from './affordable-housing-v037-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function'){
    const handler=first as Deno.ServeHandler;
    return nativeServe((request,info)=>runWithAffordableHousingV037(handler,request,info));
  }
  if(typeof second==='function'){
    const handler=second as Deno.ServeHandler;
    return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithAffordableHousingV037(handler,request,info));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/d8083a1ecb7793c860c7b2dc7fd7b57844d75db2/supabase/functions/workbench-hydrate/production-modiv-record-change-bootstrap.ts');

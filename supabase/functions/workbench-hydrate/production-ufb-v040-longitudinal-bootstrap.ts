// NJW-144 production wrapper for exact NJ DCA User Friendly Budget 2015-2025 longitudinal markers.
// Preserves the certified Workbench graph, existing v0.39 UFB fields, and entitlement decisions.
import { runWithUfbV040Longitudinal } from './ufb-v040-longitudinal-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function'){
    const handler=first as Deno.ServeHandler;
    return nativeServe((request,info)=>runWithUfbV040Longitudinal(handler,request,info));
  }
  if(typeof second==='function'){
    const handler=second as Deno.ServeHandler;
    return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithUfbV040Longitudinal(handler,request,info));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/9f3e27f34019a01df7f52ea22f508b4ece58ec95/supabase/functions/workbench-hydrate/production-ufb-v039-bootstrap.ts');

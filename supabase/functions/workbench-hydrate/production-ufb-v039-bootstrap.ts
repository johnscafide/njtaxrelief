// NJW-143 production wrapper for exact NJ DCA User Friendly Budget 2025 municipality markers.
// Preserves the certified Workbench graph and entitlement decisions; only exact DCA source fields
// are filled here. DCA states these municipal submissions are self-reported and unaudited.
import { runWithUfbV039 } from './ufb-v039-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function'){
    const handler=first as Deno.ServeHandler;
    return nativeServe((request,info)=>runWithUfbV039(handler,request,info));
  }
  if(typeof second==='function'){
    const handler=second as Deno.ServeHandler;
    return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithUfbV039(handler,request,info));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/3712a256599800bec561fcab3642a48e2e92328a/supabase/functions/workbench-hydrate/production-development-trends-v038-bootstrap.ts');

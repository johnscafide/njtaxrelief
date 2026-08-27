// NJW-143 production wrapper for exact NJ DCA Development Trends Viewer v0.38 municipality markers.
// Preserves the existing certified Workbench graph, respects not_entitled results, and only fills
// the bounded v0.38 annual/source-series fields plus deterministic five-year arithmetic markers.
import { runWithDevelopmentTrendsV038 } from './development-trends-v038-provider.ts';

const nativeServe=Deno.serve.bind(Deno);
const wrappedServe=((first:unknown,second?:unknown)=>{
  if(typeof first==='function'){
    const handler=first as Deno.ServeHandler;
    return nativeServe((request,info)=>runWithDevelopmentTrendsV038(handler,request,info));
  }
  if(typeof second==='function'){
    const handler=second as Deno.ServeHandler;
    return nativeServe(first as Deno.ServeOptions,(request,info)=>runWithDevelopmentTrendsV038(handler,request,info));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,writable:true,value:wrappedServe});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/160bbf0ab65fba8a395a7adc436d8866c6ba3196/supabase/functions/workbench-hydrate/production-affordable-housing-v037-bootstrap.ts');

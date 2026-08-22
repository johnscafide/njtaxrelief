import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const UPSTREAM="intelligence-semantic-context";
const ALLOWED=new Set([
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

function allowedOrigin(req:Request){
  const value=req.headers.get("origin")||"";
  if(ALLOWED.has(value))return value;
  if(/^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/i.test(value))return value;
  return "https://watchdogindex.com";
}
function cors(req:Request){return{
  "Access-Control-Allow-Origin":allowedOrigin(req),
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
}}
function json(req:Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}})}
function env(j:string,l:string){const raw=Deno.env.get(j)||"";if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}}return Deno.env.get(l)||""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return json(req,401,{error:"Sign in required"});
  const base=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const apikey=req.headers.get("apikey")||env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  if(!base||!apikey)return json(req,503,{error:"Semantic context gateway configuration incomplete"});
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const body=await req.text();
    const upstream=await fetch(`${base}/functions/v1/${UPSTREAM}`,{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Authorization":auth,
        "apikey":apikey,
        "Content-Type":"application/json",
        "x-client-info":req.headers.get("x-client-info")||"watchdog-semantic-browser-gateway"
      },
      body
    });
    const text=await upstream.text();
    return new Response(text,{status:upstream.status,headers:{...cors(req),"Content-Type":upstream.headers.get("content-type")||"application/json","Cache-Control":"private, no-store"}});
  }catch(error){
    const timeoutError=error instanceof DOMException&&error.name==="AbortError";
    return json(req,timeoutError?504:503,{error:timeoutError?"Semantic context timed out":"Semantic context unavailable"});
  }finally{clearTimeout(timeout)}
});

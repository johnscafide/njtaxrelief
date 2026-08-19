import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-scenario-prompt-adapter-v1";
const PARSER_VERSION="property-tax-scenario-parser-v1";
const clean=(v:unknown,n=1800)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(l)||""};
function origin(req:Request){const o=req.headers.get("origin")||"";if(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"].includes(o))return o;if(/^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/i.test(o))return o;return"https://njpropertytaxrelief.com"}
const cors=(r:Request)=>({"Access-Control-Allow-Origin":origin(r),"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
function escapeRegex(v:string){return v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function pct(text:string,aliases:string[]){
  for(const alias of aliases){
    const a=escapeRegex(alias),zero=new RegExp(`\\b${a}\\b[^.!?]{0,32}\\b(?:unchanged|flat|no\\s+change|stays?\\s+the\\s+same|remains?\\s+the\\s+same)\\b`,"i");
    if(zero.test(text))return{value:0,explicit:true,match:"explicit_zero"};
    const forward=new RegExp(`\\b${a}\\b[^.!?%]{0,38}?(?:up|increase(?:s|d)?|growth|grow(?:s|th)?|rise(?:s|n)?|change|at|by|of|=|:)\\s*(?:by\\s*)?(-?\\d+(?:\\.\\d+)?)\\s*%`,"i"),plain=new RegExp(`\\b${a}\\b\\s*(?:[:=]|at|by|of)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*%`,"i"),reverse=new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*%[^.!?]{0,24}\\b${a}\\b`,"i");
    for(const re of [forward,plain,reverse]){const m=text.match(re);if(m)return{value:Number(m[1]),explicit:true,match:m[0]}}
  }
  return{value:null,explicit:false,match:null};
}
function yearsFrom(text:string){for(const re of [/(?:for|over|across|next)\s+(\d{1,2})\s*(?:years?|yrs?)\b/i,/\b(\d{1,2})\s*[- ]year\b/i]){const m=text.match(re);if(m){const n=Number(m[1]);if(Number.isFinite(n)&&n>=1&&n<=5)return{years:n,defaulted:false,match:m[0]}}}return{years:1,defaulted:true,match:null}}
function parse(prompt:string){
  const levy=pct(prompt,["municipal levy","levy"]),assessment=pct(prompt,["property assessment","assessment"]),taxBase=pct(prompt,["municipal tax base","taxable base","tax base","ratable base"]),yr=yearsFrom(prompt),missing:string[]=[];
  if(!levy.explicit)missing.push("municipal levy growth");if(!assessment.explicit)missing.push("property assessment growth");if(!taxBase.explicit)missing.push("municipal tax-base growth");
  return{missing,years:yr.years,years_defaulted:yr.defaulted,assumptions:{levy_growth_pct:levy.value,property_assessment_growth_pct:assessment.value,municipal_tax_base_growth_pct:taxBase.value},matches:{levy:levy.match,assessment:assessment.match,tax_base:taxBase.match,years:yr.match}};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");if(!url||!pub)return out(req,503,{error:"Scenario adapter configuration incomplete"});const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:who}=await uc.auth.getUser();if(!who?.user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}const prompt=clean(body?.prompt),pin=clean(body?.pams_pin,120);if(!prompt)return out(req,400,{error:"prompt required"});if(!pin)return out(req,400,{error:"pams_pin required"});const parsed=parse(prompt);
  if(parsed.missing.length)return out(req,409,{engine_version:ENGINE,parser_version:PARSER_VERSION,status:"needs_assumptions",error:"Watchdog needs all three financial assumptions before calculating this scenario.",missing_assumptions:parsed.missing,parsed:{years:parsed.years,years_defaulted:parsed.years_defaulted,assumptions:parsed.assumptions}});
  const assumptions={levy_growth_bps:Math.round(Number(parsed.assumptions.levy_growth_pct)*100),property_assessment_growth_bps:Math.round(Number(parsed.assumptions.property_assessment_growth_pct)*100),municipal_tax_base_growth_bps:Math.round(Number(parsed.assumptions.municipal_tax_base_growth_pct)*100)};
  const call=await fetch(`${url}/functions/v1/intelligence-scenario-preview`,{method:"POST",headers:{Authorization:auth,apikey:pub,"Content-Type":"application/json"},body:JSON.stringify({pams_pin:pin,years:parsed.years,scenario_type:"property_tax_share",assumptions})}),data=await call.json().catch(()=>({}));if(!call.ok)return out(req,call.status,{engine_version:ENGINE,parser_version:PARSER_VERSION,status:"scenario_failed",error:clean(data?.error||`Scenario engine returned ${call.status}`,400),parsed});
  return out(req,200,{engine_version:ENGINE,parser_version:PARSER_VERSION,status:"complete",parsed:{years:parsed.years,years_defaulted:parsed.years_defaulted,assumptions:parsed.assumptions,matches:parsed.matches},scenario:data});
});

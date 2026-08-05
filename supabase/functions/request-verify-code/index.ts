import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const clean=(v:unknown,max=100)=>String(v||'').trim().slice(0,max);
async function sha(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  const postgrid=Deno.env.get('POSTGRID_API_KEY')||'';
  if(req.method==='GET')return json({ok:true,service:'request-verify-code',database_configured:!!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),mail_provider_configured:!!postgrid,mode:Deno.env.get('POSTGRID_MODE')||'test'});
  try{
    const auth=req.headers.get('Authorization')||'';
    const url=Deno.env.get('SUPABASE_URL')!;
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({ok:false,reason:'Sign in required',stage:'auth'},401);
    const body=await req.json();
    const pin=clean(body.pams_pin,40),line1=clean(body.address_line1),city=clean(body.city,80),postal=clean(body.postal_code,12);
    if(!pin||!line1||!city||!/^[0-9]{5}(?:-[0-9]{4})?$/.test(postal))return json({ok:false,reason:'A complete New Jersey mailing address is required',stage:'validation'},400);
    const since=new Date(Date.now()-24*60*60*1000).toISOString();
    const {count}=await admin.from('ownership_verifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',since);
    if((count||0)>=3)return json({ok:false,reason:'Daily mailing limit reached. Try again tomorrow.',stage:'rate_limit'},429);
    if(!postgrid)return json({ok:false,reason:'Postal provider is not configured',stage:'provider_configuration'},503);
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<6;i++)code+=alphabet[crypto.getRandomValues(new Uint32Array(1))[0]%alphabet.length];
    const nonce=crypto.randomUUID(),hash=await sha(code+nonce);
    const address={address_line1:line1,city,state:'NJ',postal_code:postal};
    const {data:row,error:insertError}=await admin.from('ownership_verifications').insert({user_id:user.id,pams_pin:pin,delivery_address:address,code_hash:hash,code_nonce:nonce,status:'queued'}).select('id').single();
    if(insertError)return json({ok:false,reason:'Verification queue is unavailable',stage:'database',detail:insertError.code},500);
    const form=new URLSearchParams({to:JSON.stringify({firstName:'Property',lastName:'Resident',addressLine1:line1,city,stateOrProvince:'NJ',postalOrZip:postal,country:'US'}),from:JSON.stringify({companyName:'NJ Property Tax Relief',addressLine1:Deno.env.get('VERIFY_FROM_LINE1')||'',city:Deno.env.get('VERIFY_FROM_CITY')||'',stateOrProvince:Deno.env.get('VERIFY_FROM_STATE')||'NJ',postalOrZip:Deno.env.get('VERIFY_FROM_ZIP')||'',country:'US'}),size:'6x9',frontHTML:'<html><body style="font-family:Arial;padding:36px"><h1 style="color:#078486">Watchdog ownership verification</h1><p>This postcard was requested from NJPropertyTaxRelief.com.</p><p>Your code is:</p><div style="font-size:42px;font-weight:800;letter-spacing:8px;color:#10294b">'+code+'</div><p>It expires in 30 days. If you did not request it, no action is needed.</p></body></html>',backHTML:'<html><body></body></html>'});
    const response=await fetch('https://api.postgrid.com/print-mail/v1/postcards',{method:'POST',headers:{'x-api-key':postgrid,'Content-Type':'application/x-www-form-urlencoded'},body:form});
    const provider=await response.json().catch(()=>({}));
    if(!response.ok){await admin.from('ownership_verifications').update({status:'failed',provider_message:String(provider?.message||response.status).slice(0,300),updated_at:new Date().toISOString()}).eq('id',row.id);return json({ok:false,reason:'The mailing provider rejected the request',stage:'provider',provider_status:response.status},502);}
    await admin.from('ownership_verifications').update({status:'submitted',provider_id:provider?.data?.id||provider?.id||null,updated_at:new Date().toISOString()}).eq('id',row.id);
    return json({ok:true,status:'submitted',request_id:row.id,expires_in_days:30});
  }catch(error){return json({ok:false,reason:'Unexpected verification service error',stage:'function',detail:String(error).slice(0,180)},500);}
});

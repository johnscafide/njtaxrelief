const crypto=require('node:crypto');
const SUPABASE_URL=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const PROVIDER_SECRET=process.env.WATCHDOG_DESIGNS_PROVIDER_SECRET||'';
function clean(v,n=500){return String(v??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,n)}
function timingEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y)}
async function rpc(name,args){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok){const message=data&&typeof data==='object'?(data.message||data.error_description||data.error||data.hint):data;const e=new Error(clean(message||`Provider transition failed (${r.status})`,700));e.status=r.status;throw e}return data}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive, nosnippet');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'})}
  if(!SERVICE_KEY||!PROVIDER_SECRET)return res.status(503).json({error:'Watchdog Designs provider bridge is not configured.'});
  const supplied=req.headers['x-watchdog-provider-secret'];if(!timingEqual(supplied,PROVIDER_SECRET))return res.status(401).json({error:'Provider authentication failed.'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{};const action=clean(body.action,40);const handoffId=clean(body.handoff_id,80);const providerDesignId=clean(body.provider_design_id,220);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(handoffId))return res.status(400).json({error:'Valid handoff_id required.'});
    if(action==='record_mapping'){
      const result=await rpc('marketing_record_wdd_provider_mapping',{p_handoff_id:handoffId,p_provider_design_id:providerDesignId,p_provider_contract_version:clean(body.provider_contract_version||'wdd-provider-mapping-v1',120)});
      return res.status(200).json({ok:true,transition:'mapped_to_pcm',result});
    }
    if(action==='record_proof'){
      const proof=body.proof&&typeof body.proof==='object'&&!Array.isArray(body.proof)?body.proof:null;if(!proof)return res.status(400).json({error:'Proof metadata object required.'});
      const result=await rpc('marketing_record_wdd_provider_proof',{p_handoff_id:handoffId,p_provider_design_id:providerDesignId,p_proof:proof});
      return res.status(200).json({ok:true,transition:'proof_ready',result});
    }
    return res.status(400).json({error:'Unsupported provider transition.'});
  }catch(e){const status=Number(e.status)>=400&&Number(e.status)<500?Number(e.status):409;return res.status(status).json({error:clean(e.message||'Provider transition rejected.',700)})}
};

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({markers:[],error:'provider registry unavailable'});
  try{
    const q=new URLSearchParams({select:'marker_id,provider_key,value_status,provider_kind,bulk_capable,last_verified_at',value_status:'eq.live',order:'marker_id.asc'});
    const r=await fetch(`${url}/rest/v1/data_center_provider_coverage?${q}`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});
    if(!r.ok)return res.status(503).json({markers:[],error:'provider registry unavailable',status:r.status});
    const data=await r.json();
    return res.status(200).json({markers:Array.isArray(data)?data:[],count:Array.isArray(data)?data.length:0,generated_at:new Date().toISOString()});
  }catch(_){return res.status(503).json({markers:[],error:'provider registry unavailable'});}
};

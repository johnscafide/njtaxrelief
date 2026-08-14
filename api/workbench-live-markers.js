const { createClient } = require('@supabase/supabase-js');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({markers:[],error:'provider registry unavailable'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.from('data_center_provider_coverage').select('marker_id,provider_key,value_status,provider_kind,bulk_capable,last_verified_at').eq('value_status','live').order('marker_id');
  if(error)return res.status(503).json({markers:[],error:'provider registry unavailable'});
  return res.status(200).json({markers:data||[],count:(data||[]).length,generated_at:new Date().toISOString()});
};

const fs=require('fs');
const path=require('path');
const ALLOWED=new Set(['atlantic','bergen','burlington','camden','cape-may','cumberland','essex','gloucester','hudson','hunterdon','mercer','middlesex','monmouth','morris','ocean','passaic','salem','somerset','sussex','union','warren']);
const AUTOMATION_UA=/\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const cache=new Map();
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end('Method not allowed');}
  const county=String(req.query&&req.query.county||'').toLowerCase().replace(/[^a-z-]/g,'');
  const district=String(req.query&&req.query.district||'').replace(/\D/g,'').slice(0,4);
  const automationHint=AUTOMATION_UA.test(String(req.headers&&req.headers['user-agent']||''));
  if(!ALLOWED.has(county)||district.length!==4){
    console.warn('sales-by-district',JSON.stringify({event:'invalid_scope',county,district_length:district.length,automation_hint:automationHint}));
    res.statusCode=400;
    return res.json({error:'Valid county and four-digit district are required.'});
  }
  try{
    let all=cache.get(county);
    if(!all){
      const file=path.join(process.cwd(),'property','sales-'+county+'.json');
      const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
      all=Array.isArray(parsed.sales)?parsed.sales:[];
      cache.set(county,all);
      if(cache.size>5)cache.delete(cache.keys().next().value);
    }
    const sales=all.filter(row=>String(row&&row.d||'').replace(/\D/g,'').slice(0,4)===district);
    console.info('sales-by-district',JSON.stringify({event:'served',county,district,rows:sales.length,automation_hint:automationHint}));
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('X-Watchdog-Sales-Scope','municipality');
    return res.status(200).json({district,county,count:sales.length,sales});
  }catch(err){
    console.error('sales-by-district',err);
    return res.status(500).json({error:'Verified sales are temporarily unavailable.'});
  }
};

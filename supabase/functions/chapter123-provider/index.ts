import pdfParse from 'npm:pdf-parse@1.1.1';

const SOURCE_URL='https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/2026CH123.pdf';
const SOURCE_ID='nj-chapter123-2026';
const PROVIDER_VERSION='chapter123-provider-v3';
const EXPECTED_DISTRICTS=564;
const COUNTY:Record<string,string>={
 '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May','06':'Cumberland','07':'Essex',
 '08':'Gloucester','09':'Hudson','10':'Hunterdon','11':'Mercer','12':'Middlesex','13':'Monmouth','14':'Morris',
 '15':'Ocean','16':'Passaic','17':'Salem','18':'Somerset','19':'Sussex','20':'Union','21':'Warren'
};
type District={municipality:string;county:string;ratio:number;lower:number;upper:number;amended_by_tax_court:boolean};
type Cache={loaded_at:number;source_observed_at:string;districts:Record<string,District>};
let cache:Cache|null=null;
function headers(){return{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=3600','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET, POST, OPTIONS'}}
function json(status:number,body:any){return new Response(JSON.stringify(body),{status,headers:headers()})}
function r2(v:number){return Math.round((v+Number.EPSILON)*100)/100}
async function load():Promise<Cache>{
 if(cache&&Date.now()-cache.loaded_at<21600000)return cache;
 const res=await fetch(SOURCE_URL,{headers:{'user-agent':'Watchdog/1.0 (+https://njpropertytaxrelief.com)'}});
 if(!res.ok)throw new Error(`Official Chapter 123 source returned ${res.status}`);
 const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.length<100000)throw new Error(`Official Chapter 123 PDF unexpectedly small: ${bytes.length}`);
 const parsed=await pdfParse(bytes as any),text=String(parsed?.text||'').replace(/\u00a0/g,' ');
 if(!/CERTIFICATION OF AVERAGE RATIOS/i.test(text)||!/COMMON LEVEL RANGES FOR USE IN THE TAX YEAR 2026/i.test(text)||!/Original Certification\s+October 1, 2025/i.test(text)||!/January 30, 2026/i.test(text))throw new Error('Official Chapter 123 source signature validation failed');
 const districts:Record<string,District>={};
 const tail=/(\d{1,3}\.\d{2})(\d{1,3}\.\d{2})(\d{1,3}\.\d{2})\s*$/;
 for(const line0 of text.split(/\r?\n/)){
   const line=line0.trim();const head=line.match(/^(\d{4})\s*(.+)$/);if(!head)continue;
   const code=head[1],prefix=code.slice(0,2);if(!COUNTY[prefix])continue;
   const nums=head[2].match(tail);if(!nums)continue;
   const ratio=Number(nums[1]),lower=Number(nums[2]),upper=Number(nums[3]);
   if(![ratio,lower,upper].every(Number.isFinite))continue;
   if(Math.abs(r2(ratio*.85)-lower)>.011||Math.abs(r2(ratio*1.15)-upper)>.011)continue;
   const rawName=head[2].slice(0,nums.index).replace(/\s+/g,' ').trim();if(!rawName)continue;
   if(districts[code])throw new Error(`Duplicate Chapter 123 district ${code}`);
   districts[code]={municipality:rawName.replace(/\*\*/g,'').trim(),county:COUNTY[prefix],ratio,lower,upper,amended_by_tax_court:/\*\*/.test(rawName)};
 }
 const codes=Object.keys(districts);
 if(codes.length!==EXPECTED_DISTRICTS)throw new Error(`Chapter 123 validation failed: expected ${EXPECTED_DISTRICTS}, found ${codes.length}`);
 if(new Set(codes.map(c=>c.slice(0,2))).size!==21)throw new Error('Chapter 123 validation failed: all 21 counties were not present');
 const control=districts['0415'];if(!control||control.ratio!==56.95||control.lower!==48.41||control.upper!==65.49)throw new Error('Chapter 123 Gloucester Township control row failed');
 const north=districts['1204'];if(!north||north.ratio!==17.44||north.lower!==14.82||north.upper!==20.06)throw new Error('Chapter 123 East Brunswick control row failed');
 cache={loaded_at:Date.now(),source_observed_at:new Date().toISOString(),districts};return cache;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:headers()});
 try{
   const data=await load();
   if(req.method==='GET'){
     const u=new URL(req.url),district=String(u.searchParams.get('district')||'').replace(/\D/g,'').slice(0,4);
     if(district)return json(data.districts[district]?200:404,{source_id:SOURCE_ID,provider_version:PROVIDER_VERSION,tax_year:2026,district,data:data.districts[district]||null,source_url:SOURCE_URL,source_observed_at:data.source_observed_at});
     return json(200,{source_id:SOURCE_ID,provider_version:PROVIDER_VERSION,tax_year:2026,district_count:Object.keys(data.districts).length,county_count:21,source_url:SOURCE_URL,source_observed_at:data.source_observed_at});
   }
   if(req.method!=='POST')return json(405,{error:'GET or POST required'});
   const body=await req.json().catch(()=>({}));const requested=[...new Set((Array.isArray(body?.districts)?body.districts:[]).map((x:any)=>String(x||'').replace(/\D/g,'').slice(0,4)).filter((x:string)=>/^\d{4}$/.test(x)))].slice(0,500);
   const out:Record<string,District>={};for(const code of requested)if(data.districts[code])out[code]=data.districts[code];
   return json(200,{source_id:SOURCE_ID,provider_version:PROVIDER_VERSION,tax_year:2026,district_count:Object.keys(data.districts).length,county_count:21,source_url:SOURCE_URL,source_observed_at:data.source_observed_at,districts:out});
 }catch(e){console.error(e);return json(503,{error:'Chapter 123 provider unavailable',detail:String((e as Error)?.message||e),provider_version:PROVIDER_VERSION});}
});
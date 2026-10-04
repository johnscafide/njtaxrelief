const dns=require('dns').promises;
const net=require('net');
const https=require('https');

function clean(v,n){return String(v??'').trim().slice(0,n)}
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
async function requireUser(req){
  const token=String(req.headers&&req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw Object.assign(new Error('Authentication required.'),{status:401});
  const c=backend(),r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token}});
  if(!r.ok)throw Object.assign(new Error('Authentication required.'),{status:401});
  return r.json();
}
const KNOWN=[
 {name:'Opus Elite Real Estate',website:'https://opusagent.com/',hosts:['opusagent.com','opuselitere.com','opuselitenj.com','opuseliterealestate.com'],primary:'#00778B',secondary:'#E35205',accent:'#222222',logo:'https://www.watchdogindex.com/property/assets/brokerages/opus-elite-logo.png'},
 {name:'Keller Williams',website:'https://kw.com/',hosts:['kw.com'],primary:'#B40101',secondary:'#F4F4F4',accent:'#333333'},
 {name:'RE/MAX',website:'https://www.remax.com/usa/en',hosts:['remax.com'],primary:'#003DA5',secondary:'#DC1C2E',accent:'#172B4D'},
 {name:'Coldwell Banker',website:'https://www.coldwellbanker.com/',hosts:['coldwellbanker.com'],primary:'#012169',secondary:'#FFFFFF',accent:'#0C2340'},
 {name:'Compass',website:'https://www.compass.com/',hosts:['compass.com'],primary:'#000000',secondary:'#FFFFFF',accent:'#545454'},
 {name:'eXp Realty',website:'https://www.exprealty.com/',hosts:['exprealty.com'],primary:'#0A4B78',secondary:'#F58220',accent:'#183244'},
 {name:'Weichert',website:'https://www.weichert.com/',hosts:['weichert.com'],primary:'#FFCB05',secondary:'#000000',accent:'#58595B'},
 {name:'Century 21',website:'https://www.century21.com/',hosts:['century21.com'],primary:'#BEAF87',secondary:'#000000',accent:'#6B604F'},
 {name:'Berkshire Hathaway HomeServices',website:'https://www.bhhs.com/',hosts:['bhhs.com'],primary:'#552448',secondary:'#E6E1DF',accent:'#222222'},
 {name:"Sotheby's International Realty",website:'https://www.sothebysrealty.com/',hosts:['sothebysrealty.com'],primary:'#002349',secondary:'#A7A9AC',accent:'#111111'}
];
function hostOf(input){try{return new URL(input).hostname.replace(/^www\./,'').toLowerCase()}catch(_){return''}}
function knownFor(input){const h=hostOf(input);return KNOWN.find(b=>b.hosts.some(x=>h===x||h.endsWith('.'+x)))||null}
function favicon(host){return 'https://www.google.com/s2/favicons?domain='+encodeURIComponent(host)+'&sz=256'}
function knownPayload(item){
  const host=hostOf(item.website);
  const logo=item.logo||favicon(host);return {website:item.website,brokerage_name:item.name,logo_url:logo,logo_candidates:[logo],colors:[item.primary,item.secondary,item.accent],primary_color:item.primary,secondary_color:item.secondary,accent_color:item.accent,source:'curated_registry',warning:null};
}
// Every range that isn't the public internet: private, loopback, link-local,
// carrier NAT, benchmarking, multicast/reserved, and IPv6 forms of the same.
const BLOCKED=new net.BlockList();
for(const [a,p] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])BLOCKED.addSubnet(a,p,'ipv4');
for(const [a,p] of [['::',127],['64:ff9b::',96],['100::',64],['2001::',23],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]])BLOCKED.addSubnet(a,p,'ipv6');
function isPrivateIp(ip){
  const s=String(ip).toLowerCase();
  const mapped=s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if(mapped)return isPrivateIp(mapped[1]);
  const v=net.isIP(s);
  if(!v)return true;
  return BLOCKED.check(s,v===4?'ipv4':'ipv6');
}
async function validateUrl(input){
  let u;try{u=new URL(input)}catch(_){throw Object.assign(new Error('Enter a valid brokerage website URL.'),{status:400})}
  if(u.protocol!=='https:')throw Object.assign(new Error('Brokerage website must use HTTPS.'),{status:400});
  if(!u.hostname||u.username||u.password||(u.port&&u.port!=='443'))throw Object.assign(new Error('Invalid brokerage website URL.'),{status:400});
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(net.isIP(host)&&isPrivateIp(host))throw Object.assign(new Error('Private network addresses are not allowed.'),{status:400});
  const addrs=await dns.lookup(host,{all:true}).catch(()=>[]);
  if(!addrs.length||addrs.some(x=>isPrivateIp(x.address)))throw Object.assign(new Error('Brokerage website could not be resolved safely.'),{status:400});
  return u;
}
// Re-checks the address at connect time, so a DNS answer that changes between
// validateUrl and the request (DNS rebinding) still can't reach a private host.
function safeLookup(hostname,options,callback){
  dns.lookup(hostname,{all:true}).then(addrs=>{
    const ok=addrs.filter(x=>!isPrivateIp(x.address));
    if(!ok.length||ok.length!==addrs.length)return callback(Object.assign(new Error('Brokerage website could not be resolved safely.'),{status:400}));
    if(options&&options.all)return callback(null,ok);
    callback(null,ok[0].address,ok[0].family);
  },callback);
}
function getOnce(url,maxBytes){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{lookup:safeLookup,timeout:7000,headers:{
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
      'Accept':'text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.5',
      'Accept-Language':'en-US,en;q=0.9','Cache-Control':'no-cache','Pragma':'no-cache'
    }},r=>{
      const status=r.statusCode||0;
      if([301,302,303,307,308].includes(status)){r.resume();return resolve({status,location:r.headers.location||''})}
      if(status<200||status>=300){r.resume();return resolve({status})}
      const len=Number(r.headers['content-length']||0);
      if(len>maxBytes*2){r.destroy();return reject(Object.assign(new Error('Brokerage website response was too large.'),{status:422}))}
      const chunks=[];let size=0;
      r.on('data',c=>{size+=c.length;if(size>maxBytes){chunks.push(c);r.destroy();resolve({status,text:Buffer.concat(chunks).toString('utf8').slice(0,maxBytes)})}else chunks.push(c)});
      r.on('end',()=>resolve({status,text:Buffer.concat(chunks).toString('utf8').slice(0,maxBytes)}));
      r.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('Brokerage website timed out.')));
    req.on('error',reject);
  });
}
async function safeFetch(input,maxBytes=850000){
  let url=await validateUrl(input);
  for(let i=0;i<4;i++){
    const r=await getOnce(url,maxBytes);
    if([301,302,303,307,308].includes(r.status)){if(!r.location)throw Object.assign(new Error('Brokerage website redirect was invalid.'),{status:422});url=await validateUrl(new URL(r.location,url).toString());continue}
    if(r.text===undefined)throw Object.assign(new Error('Brokerage website blocked automated metadata discovery.'),{status:422,upstreamStatus:r.status});
    return {url,text:r.text};
  }
  throw Object.assign(new Error('Brokerage website redirected too many times.'),{status:422});
}
function decode(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function attr(tag,name){const m=tag.match(new RegExp(name+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']','i'));return m?decode(m[1]):''}
function resolve(base,value){try{return new URL(value,base).toString()}catch(_){return''}}
function extractName(html){
  const og=html.match(/<meta[^>]+property=["']og:site_name["'][^>]*>/i)||html.match(/<meta[^>]+name=["']application-name["'][^>]*>/i);
  if(og){const c=attr(og[0],'content');if(c)return clean(c,140)}
  const t=html.match(/<title[^>]*>([\s\S]{1,220}?)<\/title>/i);return t?clean(decode(t[1].replace(/<[^>]+>/g,' ')),140):'';
}
function extractLogos(html,base){
  const out=[];for(const m of html.matchAll(/<(?:img|link|meta)\b[^>]*>/gi)){
    const tag=m[0],hay=tag.toLowerCase();let candidate='';
    if(/^<img/i.test(tag)&&/logo|brand|masthead/.test(hay))candidate=attr(tag,'src');
    else if(/^<link/i.test(tag)&&/rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(tag))candidate=attr(tag,'href');
    else if(/^<meta/i.test(tag)&&/property=["']og:image["']/i.test(tag))candidate=attr(tag,'content');
    const url=resolve(base,candidate);if(url&&url.startsWith('https://')&&!out.includes(url))out.push(url);if(out.length>=6)break;
  }return out;
}
function goodColor(hex){const h=hex.replace('#','');if(!/^[0-9a-f]{6}$/i.test(h))return false;const n=parseInt(h,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,max=Math.max(r,g,b),min=Math.min(r,g,b);if(max>245&&min>235)return false;if(max<24)return false;return max-min>20||(max<210&&min<210)}
function extractColors(text){const out=[];for(const re of [/(?:theme-color|--(?:brand|primary|secondary|accent)[-_a-z0-9]*)[^#]{0,40}(#[0-9a-f]{6})/gi,/#[0-9a-f]{6}\b/gi]){for(const m of text.matchAll(re)){const h=(m[1]||m[0]).toUpperCase();if(goodColor(h)&&!out.includes(h))out.push(h);if(out.length>=8)break}if(out.length>=8)break}return out.slice(0,5)}
function fallbackPayload(url,warning){
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  return {website:url.toString(),brokerage_name:host.split('.')[0].replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),logo_url:favicon(host),logo_candidates:[favicon(host)],colors:['#10294B','#0B8B85','#1F2937'],primary_color:'#10294B',secondary_color:'#0B8B85',accent_color:'#1F2937',source:'site_icon_fallback',warning:warning||'This site blocks automated brand metadata. Watchdog used the site icon and editable default colors.'};
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
  try{await requireUser(req)}catch(e){return res.status(e.status||401).json({error:e.message||'Authentication required.'})}
  const raw=clean(req.query&&req.query.url,700);if(!raw)return res.status(400).json({error:'Brokerage website URL is required.'});
  const known=knownFor(raw);if(known)return res.status(200).json(knownPayload(known));
  let validated;try{validated=await validateUrl(raw)}catch(e){return res.status(e.status||400).json({error:e.message})}
  try{
    const page=await safeFetch(validated.toString()),host=page.url.hostname.replace(/^www\./,'').toLowerCase(),logos=extractLogos(page.text,page.url.toString());
    let colors=extractColors(page.text);
    return res.status(200).json({website:page.url.toString(),brokerage_name:extractName(page.text)||host,logo_url:logos[0]||favicon(host),logo_candidates:logos.length?logos.slice(0,4):[favicon(host)],colors:colors.slice(0,5),primary_color:colors[0]||'#10294B',secondary_color:colors[1]||'#0B8B85',accent_color:colors[2]||'#1F2937',source:'public_website',warning:logos.length||colors.length?null:'Only a site icon was available. Review the colors before saving.'});
  }catch(e){
    return res.status(200).json(fallbackPayload(validated,'This brokerage website blocks automated metadata discovery (HTTP '+String(e.upstreamStatus||'blocked')+'). Watchdog used its site icon and editable default colors instead.'));
  }
};